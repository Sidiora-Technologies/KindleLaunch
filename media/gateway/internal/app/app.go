// Package app wires the media/gateway edge together (config, Redis, per-bucket
// R2 clients, EIP-191->JWT auth, the media/social REST + WS tunnel, the R2 serve
// edge, and the guarded create-wizard upload) and owns its lifecycle. Keeping
// the wiring here (rather than in main) makes the whole edge testable end-to-end
// against testcontainers + MinIO + httptest upstreams.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	goredis "github.com/redis/go-redis/v9"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"
	sharedlog "github.com/Sidiora-Technologies/KindleLaunch/shared/log"
	"github.com/Sidiora-Technologies/KindleLaunch/shared/process"
	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"
	"github.com/Sidiora-Technologies/KindleLaunch/shared/storage"

	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/auth"
	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/cache"
	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/config"
	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/proxy"
	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/serve"
	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/upload"
)

// App is a fully-wired, ready-to-serve gateway edge.
type App struct {
	Router http.Handler

	redis  *goredis.Client
	logger *slog.Logger
}

// New opens the Redis pool + per-bucket R2 clients and builds the HTTP router
// with health endpoints, rate-limited public routes, the auth + social tunnel,
// the media serve edge, and the guarded upload.
func New(ctx context.Context, cfg config.Config, logger *slog.Logger) (*App, error) {
	rdb, err := sharedredis.NewClient(cfg.RedisURL)
	if err != nil {
		return nil, err
	}

	readers, err := buildBuckets(ctx, cfg)
	if err != nil {
		_ = rdb.Close()
		return nil, err
	}

	authH := auth.New(auth.Deps{
		Redis:     rdb,
		JWTSecret: cfg.JWTSecret,
		JWTTTL:    time.Duration(cfg.JWTTTLSeconds) * time.Second,
		NonceTTL:  time.Duration(cfg.NonceTTLSeconds) * time.Second,
		AppDomain: cfg.AppDomain,
		Logger:    logger,
	})

	upstreamTimeout := time.Duration(cfg.UpstreamTimeoutSeconds) * time.Second
	restProxy, err := proxy.NewREST(proxy.RESTDeps{
		TargetBaseURL: cfg.SocialHTTPURL,
		Prefix:        "/social",
		Timeout:       upstreamTimeout,
		Logger:        logger,
	})
	if err != nil {
		_ = rdb.Close()
		return nil, err
	}
	wsProxy, err := proxy.NewWS(proxy.WSDeps{
		TargetBaseURL: cfg.SocialWSURL,
		Logger:        logger,
	})
	if err != nil {
		_ = rdb.Close()
		return nil, err
	}

	objCache := cache.New(rdb, time.Duration(cfg.ObjectCacheTTLSeconds)*time.Second)
	serveH := serve.New(serve.Deps{
		Buckets:      readers,
		Cache:        objCache,
		CacheMaxSize: cfg.ObjectCacheMaxBytes,
		Logger:       logger,
	})

	uploadH := upload.New(upload.Deps{
		MetadataBaseURL: cfg.MetadataUploadURL,
		MaxBytes:        cfg.MaxUploadBytes,
		Timeout:         upstreamTimeout,
		Logger:          logger,
	})

	mux := sharedhttp.NewRouter(sharedhttp.ServerOptions{
		CORSOrigins: cfg.CORSAllowedOrigins,
		Health: sharedhttp.HealthDeps{
			Redis: func(c context.Context) error { return rdb.Ping(c).Err() },
		},
	})

	// Rate-limit all public ingress per IP (health probes stay un-throttled, i12).
	mux.Group(func(gr chi.Router) {
		gr.Use(sharedhttp.RateLimit(sharedhttp.RateLimitOptions{
			Max:    cfg.RateLimitMax,
			Window: time.Duration(cfg.RateLimitWindowSeconds) * time.Second,
			Redis:  rdb,
		}))

		authH.RegisterRoutes(gr)
		serveH.RegisterRoutes(gr)
		uploadH.RegisterRoutes(gr)

		// Social realtime tunnel: WS requires a session (exact path beats the
		// REST wildcard below in chi's trie).
		gr.With(authH.RequireSession).Method(http.MethodGet, "/social/ws", wsProxy)
		// Social REST: reads are public; writes need a session, which social
		// itself enforces once the gateway injects X-Actor-Wallet.
		gr.With(authH.OptionalSession).Handle("/social/*", restProxy)
	})

	return &App{Router: mux, redis: rdb, logger: logger}, nil
}

// buildBuckets constructs one R2 client per configured logical bucket, all on
// the same endpoint/credentials.
func buildBuckets(ctx context.Context, cfg config.Config) (map[string]serve.Reader, error) {
	readers := make(map[string]serve.Reader)
	for name, bucket := range cfg.Buckets() {
		client, err := storage.New(ctx, storage.Config{
			Endpoint:        cfg.S3Endpoint,
			Region:          cfg.S3Region,
			AccessKeyID:     cfg.S3AccessKeyID,
			SecretAccessKey: cfg.S3SecretAccessKey,
			Bucket:          bucket,
		})
		if err != nil {
			return nil, fmt.Errorf("bucket %q: %w", name, err)
		}
		readers[name] = client
	}
	return readers, nil
}

// Close releases the Redis pool.
func (a *App) Close() {
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
	logger := sharedlog.New("gateway", cfg.LogLevel)
	logger.Info("starting media gateway")

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
