package db

import (
	"context"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestPoolTag(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"postgres://u:p@host:5432/mydb?sslmode=disable": "mydb",
		"postgres://u:p@host:5432/":                     "default",
		"postgres://u:p@host:5432":                      "default",
		"://bad":                                        "default",
	}
	for dsn, want := range cases {
		if got := poolTag(dsn); got != want {
			t.Errorf("poolTag(%q) = %q, want %q", dsn, got, want)
		}
	}
}

func TestNewPoolBadDSN(t *testing.T) {
	t.Parallel()
	if _, err := NewPool(context.Background(), "not-a-valid-dsn://", PoolOptions{}); err == nil {
		t.Fatal("want error for bad dsn")
	}
}

func TestNewPoolIntegration(t *testing.T) {
	ctx := context.Background()
	ctr, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("kindle_test"),
		postgres.WithUsername("kl"),
		postgres.WithPassword("kl"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	pool, err := NewPool(ctx, dsn, PoolOptions{MaxConns: 5, MinConns: 1, StatementTimeout: 3 * time.Second})
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	defer pool.Close()
	defer unregister(poolTag(dsn))

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx, "select 1").Scan(&n); err != nil || n != 1 {
		t.Fatalf("select 1 = %d, err %v", n, err)
	}

	m := PoolMetrics()
	if _, ok := m["kindle_test"]; !ok {
		t.Errorf("PoolMetrics missing tag kindle_test, got %v", m)
	}
}
