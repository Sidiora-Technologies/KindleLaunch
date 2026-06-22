// Package app wires the media/livestream service together (config, migrations,
// pgxpool, redis, Livepeer client, HTTP router, health, graceful shutdown) and
// owns its lifecycle. Keeping the wiring here (rather than in main) makes the
// whole service testable end-to-end against testcontainers.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	shareddb "github.com/Sidiora-Technologies/KindleLaunch/shared/db"
	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"
	sharedlog "github.com/Sidiora-Technologies/KindleLaunch/shared/log"
	"github.com/Sidiora-Technologies/KindleLaunch/shared/process"
	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"

	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/internal/config"
	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/internal/livepeer"
	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/internal/migrate"
	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/internal/streams"
)

// rateLimitMax / rateLimitWindow mirror the TS registerRateLimit(app, {max:60,
// windowSeconds:60}) configuration.
const (
	rateLimitMax    = 60
	rateLimitWindow = 60 * time.Second
)

// App is a fully-wired, ready-to-serve livestream service.
type App struct {
	Router http.Handler

	pool   *pgxpool.Pool
	redis  *goredis.Client
	logger *slog.Logger
}

// New runs migrations, opens the DB + Redis pools, and builds the HTTP router
// with health endpoints and rate-limited stream routes.
func New(ctx context.Context, cfg config.Config, logger *slog.Logger) (*App, error) {
	if err := migrate.Up(ctx, cfg.DatabaseURL); err != nil {
		return nil, err
	}

	pool, err := shareddb.NewPool(ctx, cfg.DatabaseURL, shareddb.PoolOptions{})
	if err != nil {
		return nil, err
	}

	rdb, err := sharedredis.NewClient(cfg.RedisURL)
	if err != nil {
		pool.Close()
		return nil, err
	}

	lp := livepeer.New(cfg.LivepeerAPIKey, cfg.LivepeerAPIURL, logger)
	handlers := streams.New(streams.Deps{
		Queries:             sqlcdb.New(pool),
		Redis:               rdb,
		Livepeer:            lp,
		MaxStreamsPerWallet: cfg.MaxStreamsPerWallet,
		WebhookSecret:       cfg.LivepeerWebhookSecret,
		Logger:              logger,
	})

	mux := sharedhttp.NewRouter(sharedhttp.ServerOptions{
		CORSOrigins: cfg.CORSAllowedOrigins,
		Health: sharedhttp.HealthDeps{
			DB:    func(c context.Context) error { return pool.Ping(c) },
			Redis: func(c context.Context) error { return rdb.Ping(c).Err() },
		},
	})
	// Rate-limit only the stream routes (health probes stay un-throttled, i12).
	mux.Group(func(gr chi.Router) {
		gr.Use(sharedhttp.RateLimit(sharedhttp.RateLimitOptions{
			Max:    rateLimitMax,
			Window: rateLimitWindow,
			Redis:  rdb,
		}))
		handlers.RegisterRoutes(gr)
	})

	return &App{Router: mux, pool: pool, redis: rdb, logger: logger}, nil
}

// Close releases the DB and Redis pools.
func (a *App) Close() {
	a.pool.Close()
	if err := a.redis.Close(); err != nil && a.logger != nil {
		a.logger.Warn("redis close", slog.String("err", err.Error()))
	}
}

// Run loads config from the environment, builds the App, serves HTTP, and blocks
// until ctx is cancelled or a shutdown signal arrives, then drains gracefully.
func Run(parent context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := sharedlog.New("livestream", cfg.LogLevel)
	logger.Info("starting livestream service")

	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	app, err := New(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer app.Close()

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           app.Router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("http server listening", slog.Int("port", cfg.Port))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			cancel() // wake the shutdown path below
		}
	}()

	shutErr := process.Run(ctx, process.Options{
		Logger: logger,
		OnShutdown: func(sctx context.Context) error {
			return srv.Shutdown(sctx)
		},
	})

	select {
	case err := <-serveErr:
		return err
	default:
		return shutErr
	}
}
