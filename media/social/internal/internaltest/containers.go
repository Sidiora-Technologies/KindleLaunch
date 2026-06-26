// Package internaltest provides real ephemeral infrastructure (Postgres, Redis)
// for the social service's integration tests via testcontainers — never fakes.
// It is imported only by *_test.go files, so it adds nothing to the production
// binary.
package internaltest

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/migrate"
)

// NewPostgres starts a postgres:16-alpine container, applies the social goose
// migrations, creates the cross-schema indexer.pools table (owned by the indexer
// service in prod; created here so creator lookups resolve), and returns a ready
// pgx pool. Torn down via t.Cleanup.
func NewPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("social_test"),
		tcpostgres.WithUsername("kl"),
		tcpostgres.WithPassword("kl"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() {
		if err := ctr.Terminate(ctx); err != nil {
			t.Logf("terminate container: %v", err)
		}
	})

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("postgres connection string: %v", err)
	}
	if err := migrate.Up(ctx, dsn); err != nil {
		t.Fatalf("migrate up: %v", err)
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("parse pool config: %v", err)
	}
	cfg.MaxConns = 8
	cfg.MaxConnIdleTime = 30 * time.Second
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("new pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `
		CREATE SCHEMA IF NOT EXISTS indexer;
		CREATE TABLE IF NOT EXISTS indexer.pools (
			pool_address  varchar(42) PRIMARY KEY,
			token_address varchar(42) NOT NULL,
			creator       varchar(42) NOT NULL,
			created_at    bigint NOT NULL
		);`); err != nil {
		t.Fatalf("create indexer.pools: %v", err)
	}
	return pool
}

// SeedPool inserts a row into indexer.pools so creator-authorized deletes resolve.
func SeedPool(t *testing.T, pool *pgxpool.Pool, poolAddr, tokenAddr, creator string, createdAt int64) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO indexer.pools (pool_address, token_address, creator, created_at) VALUES ($1,$2,$3,$4)
		 ON CONFLICT (pool_address) DO UPDATE SET token_address = EXCLUDED.token_address, creator = EXCLUDED.creator, created_at = EXCLUDED.created_at`,
		poolAddr, tokenAddr, creator, createdAt); err != nil {
		t.Fatalf("seed pool: %v", err)
	}
}

// NewRedisURL starts a redis:7-alpine container and returns its connection URL.
func NewRedisURL(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("start redis container: %v", err)
	}
	t.Cleanup(func() {
		if err := ctr.Terminate(ctx); err != nil {
			t.Logf("terminate redis: %v", err)
		}
	})
	uri, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("redis connection string: %v", err)
	}
	return uri
}
