// Package internaltest provides real ephemeral infrastructure (Redis, MinIO) for
// the gateway's integration tests via testcontainers — never fakes. It is
// imported only by *_test.go files, so it adds nothing to the production binary.
package internaltest

import (
	"context"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	goredis "github.com/redis/go-redis/v9"
	tcminio "github.com/testcontainers/testcontainers-go/modules/minio"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"
	"github.com/Sidiora-Technologies/KindleLaunch/shared/storage"
)

// NewRedis starts a redis:7-alpine container and returns a ready client plus its
// connection URL. Torn down via t.Cleanup.
func NewRedis(t *testing.T) (*goredis.Client, string) {
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
	rdb, err := sharedredis.NewClient(uri)
	if err != nil {
		t.Fatalf("new redis client: %v", err)
	}
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, uri
}

// MinIO describes a running MinIO container's connection details so callers can
// either build a storage.Client (NewStore) or configure a service that builds
// its own clients (e.g. the gateway app from S3_* env vars).
type MinIO struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
}

// NewMinIO starts a MinIO container, creates the named buckets, and returns its
// connection details. Torn down via t.Cleanup.
func NewMinIO(t *testing.T, buckets ...string) MinIO {
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
	mc := MinIO{Endpoint: "http://" + hostPort, AccessKeyID: ctr.Username, SecretAccessKey: ctr.Password}

	rawCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(mc.AccessKeyID, mc.SecretAccessKey, ""),
		),
	)
	if err != nil {
		t.Fatalf("load aws config: %v", err)
	}
	raw := s3.NewFromConfig(rawCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(mc.Endpoint)
		o.UsePathStyle = true
	})
	for _, b := range buckets {
		if _, err := raw.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(b)}); err != nil {
			t.Fatalf("create bucket %q: %v", b, err)
		}
	}
	return mc
}

// Client builds a storage.Client scoped to bucket against this MinIO.
func (m MinIO) Client(t *testing.T, bucket string) *storage.Client {
	t.Helper()
	client, err := storage.New(context.Background(), storage.Config{
		Endpoint:        m.Endpoint,
		Region:          "us-east-1",
		AccessKeyID:     m.AccessKeyID,
		SecretAccessKey: m.SecretAccessKey,
		Bucket:          bucket,
	})
	if err != nil {
		t.Fatalf("storage.New: %v", err)
	}
	return client
}

// NewStore starts a MinIO container, creates a bucket, and returns a ready
// storage.Client (real S3-compatible backend — no fakes).
func NewStore(t *testing.T, bucket string) *storage.Client {
	t.Helper()
	return NewMinIO(t, bucket).Client(t, bucket)
}
