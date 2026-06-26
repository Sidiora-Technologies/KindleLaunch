// Package app wires the media/social service together (config, migrations,
// pgxpool, Redis pub/sub, HTTP+WS router, health, graceful shutdown) and owns
// its lifecycle. Keeping the wiring here (rather than in main) makes the whole
// service testable end-to-end against testcontainers.
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

	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/config"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/fanout"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/migrate"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/social"
)

// rateLimitMax / rateLimitWindow mirror the TS registerRateLimit(app, {max:60,
// windowSeconds:60}) configuration for the chat service's REST surface.
const (
	rateLimitMax    = 60
	rateLimitWindow = 60 * time.Second
)

// App is a fully-wired, ready-to-serve social service.
type App struct {
	Router http.Handler
	Hub    *fanout.Hub

	pool   *pgxpool.Pool
	redis  *goredis.Client
	sub    *goredis.Client
	logger *slog.Logger
}

// New runs migrations, opens the DB + Redis (publisher + dedicated subscriber)
// pools, and builds the HTTP+WS router with health endpoints, the rate-limited
// REST routes, and the realtime /ws endpoint.
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
	sub, err := sharedredis.NewClient(cfg.RedisURL)
	if err != nil {
		pool.Close()
		_ = rdb.Close()
		return nil, err
	}

	queries := sqlcdb.New(pool)

	handlers := social.New(social.Deps{
		Queries:          queries,
		MaxMessageLength: cfg.MaxMessageLength,
		AdminAPIKey:      cfg.ChatAdminAPIKey,
		Logger:           logger,
	})

	hub := fanout.New(fanout.Deps{
		Queries:          queries,
		Pub:              rdb,
		Sub:              sub,
		MaxMessageLength: cfg.MaxMessageLength,
		RateWindow:       time.Duration(cfg.RateWindowSeconds) * time.Second,
		MaxPoolMsgs:      cfg.MaxPoolMsgsPerWin,
		MaxDmMsgs:        cfg.MaxDmMsgsPerWindow,
		SendBuffer:       cfg.WSSendBuffer,
		WriteWait:        time.Duration(cfg.WSWriteTimeoutSecs) * time.Second,
		ReadLimit:        cfg.WSReadLimitBytes,
		Logger:           logger,
	})

	mux := sharedhttp.NewRouter(sharedhttp.ServerOptions{
		CORSOrigins: cfg.CORSAllowedOrigins,
		Health: sharedhttp.HealthDeps{
			DB:    func(c context.Context) error { return pool.Ping(c) },
			Redis: func(c context.Context) error { return rdb.Ping(c).Err() },
		},
	})

	// Realtime WS endpoint: its own per-message rate limiting lives in the hub,
	// so it is not behind the REST token bucket.
	mux.Get("/ws", hub.ServeWS)

	// Rate-limit the REST routes (health probes + WS stay un-throttled here, i12).
	mux.Group(func(gr chi.Router) {
		gr.Use(sharedhttp.RateLimit(sharedhttp.RateLimitOptions{
			Max:    rateLimitMax,
			Window: rateLimitWindow,
			Redis:  rdb,
		}))
		handlers.RegisterRoutes(gr)
	})

	return &App{Router: mux, Hub: hub, pool: pool, redis: rdb, sub: sub, logger: logger}, nil
}

// Close releases the DB and Redis pools.
func (a *App) Close() {
	a.pool.Close()
	if err := a.redis.Close(); err != nil && a.logger != nil {
		a.logger.Warn("redis close", slog.String("err", err.Error()))
	}
	if err := a.sub.Close(); err != nil && a.logger != nil {
		a.logger.Warn("redis sub close", slog.String("err", err.Error()))
	}
}

// Run loads config, builds the App, serves HTTP+WS, runs the realtime hub, and
// blocks until ctx is cancelled or a signal arrives, then drains gracefully.
func Run(parent context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := sharedlog.New("social", cfg.LogLevel)
	logger.Info("starting social service")

	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	app, err := New(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer app.Close()

	// Drive the Redis subscriber loop for the lifetime of the service.
	go func() {
		if err := app.Hub.Run(ctx); err != nil && ctx.Err() == nil {
			logger.Error("hub run", slog.String("err", err.Error()))
		}
	}()

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
			cancel()
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
