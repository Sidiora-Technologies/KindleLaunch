// Package internaltest provides real ephemeral infrastructure (Postgres, Redis,
// MinIO) for the user service's integration tests via testcontainers — never
// fakes. It is imported only by *_test.go files, so it adds nothing to the
// production binary.
package internaltest

import (
	"context"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	tcminio "github.com/testcontainers/testcontainers-go/modules/minio"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/Sidiora-Technologies/KindleLaunch/shared/storage"

	"github.com/Sidiora-Technologies/KindleLaunch/media/user/internal/migrate"
)

// NewPostgres starts a postgres:16-alpine container, applies the user goose
// migrations, creates the cross-schema indexer.pools foreign table (owned by the
// indexer service in prod; created here so cross-schema reads resolve), and
// returns a ready pgx pool. Torn down via t.Cleanup.
func NewPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("user_test"),
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

	// Cross-schema dependency: indexer.pools is owned by the indexer service in
	// prod. Create the minimal shape the user reads target.
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

// SeedPool inserts a row into indexer.pools so the created-pools read resolves.
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

// NewStore starts a MinIO container, creates a bucket, and returns a ready
// storage.Client (real S3-compatible backend — no fakes).
func NewStore(t *testing.T, bucket string) *storage.Client {
	t.Helper()
	ctx := context.Background()

	ctr, err := tcminio.Run(ctx, "minio/minio:RELEASE.2024-12-18T13-15-44Z")
	if err != nil {
		t.Fatalf("start minio container: %v", err)
	}
	t.Cleanup(func() {
		if err := ctr.Terminate(ctx); err != nil {
			t.Logf("terminate minio: %v", err)
		}
	})
	hostPort, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("minio connection string: %v", err)
	}
	endpoint := "http://" + hostPort

	rawCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(ctr.Username, ctr.Password, ""),
		),
	)
	if err != nil {
		t.Fatalf("load aws config: %v", err)
	}
	raw := s3.NewFromConfig(rawCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})
	if _, err := raw.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(bucket)}); err != nil {
		t.Fatalf("create bucket: %v", err)
	}

	client, err := storage.New(ctx, storage.Config{
		Endpoint:        endpoint,
		Region:          "us-east-1",
		AccessKeyID:     ctr.Username,
		SecretAccessKey: ctr.Password,
		Bucket:          bucket,
	})
	if err != nil {
		t.Fatalf("storage.New: %v", err)
	}
	return client
}
