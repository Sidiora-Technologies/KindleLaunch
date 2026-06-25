// Package internaltest provides real ephemeral infrastructure (Postgres, Redis)
// for the pnl-tracker integration tests via testcontainers — never fakes (HARD
// rule no_stub). A migrated Postgres pool (the pnl schema, via the service's own
// goose migrations) and a live Redis client are spun up per call and torn down
// through t.Cleanup. The Ensure* helpers create faithful subsets of the
// cross-schema tables pnl reads in production (indexer.pools/indexer.swaps,
// stats.pool_stats, metadata.token_metadata) which are owned by other services
// in the SAME database (invariant i2). It is imported only by *_test.go files, so
// it adds nothing to the production binary and is invisible to the coverage gate.
package internaltest

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker/internal/migrate"
)

// indexerSchemaDDL creates the subset of the indexer schema pnl reads: pools
// (pool -> token resolution) and swaps (the reconciler's backfill source).
const indexerSchemaDDL = `
CREATE SCHEMA IF NOT EXISTS indexer;
CREATE TABLE IF NOT EXISTS indexer.pools (
	pool_address  varchar(42) PRIMARY KEY,
	token_address varchar(42) NOT NULL,
	creator       varchar(42),
	pool_id       text,
	created_at    bigint
);
CREATE TABLE IF NOT EXISTS indexer.swaps (
	id              text        PRIMARY KEY,
	pool_id         text,
	pool_address    varchar(42) NOT NULL,
	sender          varchar(42) NOT NULL,
	router          varchar(42),
	is_buy          boolean     NOT NULL,
	amount_in       text        NOT NULL,
	amount_out      text        NOT NULL,
	fee             text        NOT NULL DEFAULT '0',
	price           text        NOT NULL DEFAULT '0',
	block_number    bigint      NOT NULL,
	block_timestamp bigint      NOT NULL,
	tx_hash         varchar(66) NOT NULL,
	log_index       integer     NOT NULL DEFAULT 0
);`

// statsSchemaDDL creates the subset of stats.pool_stats pnl reads for market
// context (price WAD, market cap USDL, 24h change) on cards + portfolio.
const statsSchemaDDL = `
CREATE SCHEMA IF NOT EXISTS stats;
CREATE TABLE IF NOT EXISTS stats.pool_stats (
	pool_address     varchar(42) PRIMARY KEY,
	token_address    varchar(42) NOT NULL,
	price            text        NOT NULL DEFAULT '0',
	market_cap       text        NOT NULL DEFAULT '0',
	price_change_24h text        NOT NULL DEFAULT '0'
);`

// metadataSchemaDDL creates the subset of metadata.token_metadata pnl reads for
// token name/symbol on cards + portfolio.
const metadataSchemaDDL = `
CREATE SCHEMA IF NOT EXISTS metadata;
CREATE TABLE IF NOT EXISTS metadata.token_metadata (
	token_address varchar(42) PRIMARY KEY,
	pool_address  varchar(42),
	name          text,
	symbol        text,
	created_at    bigint
);`

// NewPostgres starts a postgres:16-alpine container, applies the pnl-tracker
// goose migrations, and returns a ready pgx pool. Container + pool are torn down
// via t.Cleanup.
func NewPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	_, pool := NewPostgresWithDSN(t)
	return pool
}

// NewPostgresWithDSN is NewPostgres but also returns the connection DSN, for
// callers (e.g. the app integration test) that build their own pool from config.
func NewPostgresWithDSN(t *testing.T) (string, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()

	ctr, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("pnl_test"),
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
	return dsn, pool
}

// EnsureIndexerSchema creates indexer.pools + indexer.swaps (pool->token
// resolution + reconciler source). Call from tests that fold swaps.
func EnsureIndexerSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), indexerSchemaDDL); err != nil {
		t.Fatalf("create indexer schema: %v", err)
	}
}

// EnsureStatsSchema creates stats.pool_stats. Call from tests that read market
// context (cards / portfolio).
func EnsureStatsSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), statsSchemaDDL); err != nil {
		t.Fatalf("create stats schema: %v", err)
	}
}

// EnsureMetadataSchema creates metadata.token_metadata. Call from tests that read
// token name/symbol.
func EnsureMetadataSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), metadataSchemaDDL); err != nil {
		t.Fatalf("create metadata schema: %v", err)
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
			t.Logf("terminate container: %v", err)
		}
	})
	uri, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("redis connection string: %v", err)
	}
	return uri
}

// NewRedis starts a redis:7-alpine container and returns a connected client.
func NewRedis(t *testing.T) *goredis.Client {
	t.Helper()
	opt, err := goredis.ParseURL(NewRedisURL(t))
	if err != nil {
		t.Fatalf("parse redis url: %v", err)
	}
	rdb := goredis.NewClient(opt)
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}
