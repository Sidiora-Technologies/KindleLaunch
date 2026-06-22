package db

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PoolOptions tunes the pgx connection pool. Zero fields take the TS defaults
// (shared/src/db/client.ts): max 20 conns, 30s idle, 5s connect.
type PoolOptions struct {
	MaxConns         int32
	MinConns         int32
	MaxConnIdleTime  time.Duration
	ConnectTimeout   time.Duration
	StatementTimeout time.Duration
}

var (
	registryMu sync.RWMutex
	registry   = map[string]*pgxpool.Pool{}
)

// NewPool builds a pgxpool from a DATABASE_URL and registers it for metrics.
func NewPool(ctx context.Context, dsn string, opts PoolOptions) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("db: parse dsn: %w", err)
	}

	cfg.MaxConns = 20
	if opts.MaxConns > 0 {
		cfg.MaxConns = opts.MaxConns
	}
	if opts.MinConns > 0 {
		cfg.MinConns = opts.MinConns
	}
	cfg.MaxConnIdleTime = 30 * time.Second
	if opts.MaxConnIdleTime > 0 {
		cfg.MaxConnIdleTime = opts.MaxConnIdleTime
	}
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	if opts.ConnectTimeout > 0 {
		cfg.ConnConfig.ConnectTimeout = opts.ConnectTimeout
	}
	if opts.StatementTimeout > 0 {
		cfg.ConnConfig.RuntimeParams["statement_timeout"] = fmt.Sprintf("%d", opts.StatementTimeout.Milliseconds())
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: new pool: %w", err)
	}

	tag := poolTag(dsn)
	registryMu.Lock()
	registry[tag] = pool
	registryMu.Unlock()
	return pool, nil
}

// poolTag derives a metrics tag from the DSN database name (parity with TS).
func poolTag(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return "default"
	}
	tag := strings.TrimPrefix(u.Path, "/")
	if tag == "" {
		return "default"
	}
	return tag
}

// PoolMetric reports live pool gauges for one registered pool (SH-3).
type PoolMetric struct {
	Total        int32
	Idle         int32
	Acquired     int32
	Constructing int32
	AcquireCount int64
}

// PoolMetrics returns metrics for every registered pool, keyed by DB-name tag.
func PoolMetrics() map[string]PoolMetric {
	registryMu.RLock()
	defer registryMu.RUnlock()
	out := make(map[string]PoolMetric, len(registry))
	for tag, p := range registry {
		s := p.Stat()
		out[tag] = PoolMetric{
			Total:        s.TotalConns(),
			Idle:         s.IdleConns(),
			Acquired:     s.AcquiredConns(),
			Constructing: s.ConstructingConns(),
			AcquireCount: s.AcquireCount(),
		}
	}
	return out
}

// unregister removes a pool tag (used by tests to keep the registry tidy).
func unregister(tag string) {
	registryMu.Lock()
	delete(registry, tag)
	registryMu.Unlock()
}
