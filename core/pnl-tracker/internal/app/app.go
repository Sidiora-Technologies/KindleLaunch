// Package app wires the core/pnl-tracker service together (config, migrations,
// pgxpool, Redis, the swap-fold consumer behind an HMAC webhook, the portfolio /
// card / referral / status read API, the OG image renderer, the background
// idempotent reconciler loop, rate limiting, graceful shutdown) and owns its
// lifecycle. Ports @analytics_microservices/pnl server + workers.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	shareddb "github.com/Sidiora-Technologies/KindleLaunch/shared/db"
	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"
	sharedlog "github.com/Sidiora-Technologies/KindleLaunch/shared/log"
	sharedprocess "github.com/Sidiora-Technologies/KindleLaunch/shared/process"
	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"

	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/card"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/config"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/httpapi"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/migrate"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/ogrender"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/position"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/reconcile"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/referral"
	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/store"
)

const (
	// rateLimitMax / rateLimitWindow mirror the shared global rate limit
	// (100 req / 60s per client).
	rateLimitMax    = 100
	rateLimitWindow = 60 * time.Second
)

// App is a fully-wired, ready-to-run pnl service.
type App struct {
	Router http.Handler

	logger      *slog.Logger
	pool        *pgxpool.Pool
	redis       *goredis.Client
	reconciler  *reconcile.Reconciler
	reconcileIn time.Duration
}

// New runs migrations and builds every component.
func New(ctx context.Context, cfg config.Config, logger *slog.Logger) (*App, error) {
	if err := migrate.Up(ctx, cfg.DatabaseURL); err != nil {
		return nil, err
	}

	pool, err := shareddb.NewPool(ctx, cfg.DatabaseURL, shareddb.PoolOptions{
		MaxConns:         30,
		MaxConnIdleTime:  10 * time.Second,
		ConnectTimeout:   3 * time.Second,
		StatementTimeout: 15 * time.Second,
	})
	if err != nil {
		return nil, err
	}

	rdb, err := sharedredis.NewClient(cfg.RedisURL)
	if err != nil {
		pool.Close()
		return nil, err
	}

	st := store.New(pool)
	now := shareddb.NowSeconds

	swapConsumer := position.NewConsumer(st, rdb, logger)
	cardSvc := card.New(st, cfg.ShareOrigin(), cfg.OGOrigin(), now)
	referralSvc := referral.New(st, logger, cfg.RewardPerConversion, now)
	renderer := ogrender.New(cfg.FontDir)
	reconciler := reconcile.New(st, rdb, logger, cfg.ReconcileBatchSize)

	router := sharedhttp.NewRouter(sharedhttp.ServerOptions{
		CORSOrigins: cfg.CORSAllowedOrigins,
		Health: sharedhttp.HealthDeps{
			DB:    func(c context.Context) error { return pool.Ping(c) },
			Redis: func(c context.Context) error { return rdb.Ping(c).Err() },
		},
	})

	shareOrigin := cfg.ShareOrigin()
	httpapi.RegisterReads(router, st, rdb)
	httpapi.RegisterCards(router, httpapi.CardDeps{
		Cards:      cardSvc,
		Renderer:   renderer,
		Redis:      rdb,
		ShareLabel: func(code string) string { return shareLabel(shareOrigin, code) },
	})
	httpapi.RegisterReferrals(router, referralSvc)
	httpapi.RegisterStatus(router, httpapi.StatusDeps{Store: st, StartedAt: time.Now()})
	httpapi.RegisterWebhook(router, httpapi.WebhookDeps{
		Swap:   swapConsumer,
		Logger: logger,
		Secret: cfg.WebhookHMACSecret,
	})

	handler := sharedhttp.RateLimit(sharedhttp.RateLimitOptions{
		Max:    rateLimitMax,
		Window: rateLimitWindow,
		Redis:  rdb,
	})(router)

	return &App{
		Router:      handler,
		logger:      logger,
		pool:        pool,
		redis:       rdb,
		reconciler:  reconciler,
		reconcileIn: cfg.ReconcileInterval(),
	}, nil
}

// shareLabel renders the human footer drawn on the OG image (origin host without
// scheme, e.g. "sidiora.fun/pnl/abc123").
func shareLabel(shareOrigin, code string) string {
	host := shareOrigin
	for _, prefix := range []string{"https://", "http://"} {
		if len(host) >= len(prefix) && host[:len(prefix)] == prefix {
			host = host[len(prefix):]
		}
	}
	return host + "/pnl/" + code
}

// Close releases all resources.
func (a *App) Close() {
	if a.pool != nil {
		a.pool.Close()
	}
	if a.redis != nil {
		_ = a.redis.Close()
	}
}

// startBackgroundJobs launches the reconciler loop, draining backlog each tick
// until ctx is cancelled.
func (a *App) startBackgroundJobs(ctx context.Context) {
	go a.loop(ctx, a.reconcileIn, "pnl reconciler", func(c context.Context) error {
		// Drain until a tick yields nothing, so a backlog catches up promptly.
		for {
			n, err := a.reconciler.RunOnce(c)
			if err != nil {
				return err
			}
			if n == 0 {
				return nil
			}
			if c.Err() != nil {
				return c.Err()
			}
		}
	})
}

// loop runs fn on a ticker until ctx is cancelled, logging (not propagating)
// errors so a transient failure never kills the loop.
func (a *App) loop(ctx context.Context, interval time.Duration, name string, fn func(context.Context) error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := fn(ctx); err != nil {
				a.logger.Error("background job failed", slog.String("job", name), slog.Any("err", err))
			}
		}
	}
}

// Run loads config, builds the App, serves HTTP, starts the reconciler, and
// blocks until a shutdown signal arrives.
func Run(parent context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := sharedlog.New("pnl", cfg.LogLevel)
	logger.Info("starting pnl service")

	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	app, err := New(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer app.Close()

	app.startBackgroundJobs(ctx)

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           app.Router,
		ReadHeaderTimeout: 10 * time.Second,
	}
	serveErr := make(chan error, 1)
	go func() {
		logger.Info("http server listening", slog.Int("port", cfg.Port),
			slog.String("webhook", "POST /webhooks/events"))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			cancel()
		}
	}()

	shutErr := sharedprocess.Run(ctx, sharedprocess.Options{
		Logger:     logger,
		OnShutdown: func(sctx context.Context) error { return srv.Shutdown(sctx) },
	})

	cancel()

	select {
	case err := <-serveErr:
		return err
	default:
		return shutErr
	}
}
