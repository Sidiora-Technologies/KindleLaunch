package queue

import (
	"context"
	"testing"

	"github.com/hibiken/asynq"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
)

func TestParseRedisConn(t *testing.T) {
	t.Parallel()
	opt, err := ParseRedisConn("redis://localhost:6379/3")
	if err != nil {
		t.Fatalf("ParseRedisConn: %v", err)
	}
	rc, ok := opt.(asynq.RedisClientOpt)
	if !ok {
		t.Fatalf("opt type = %T, want RedisClientOpt", opt)
	}
	if rc.Addr != "localhost:6379" {
		t.Errorf("Addr = %q, want localhost:6379", rc.Addr)
	}
	if rc.DB != 3 {
		t.Errorf("DB = %d, want 3", rc.DB)
	}
}

func TestParseRedisConnBad(t *testing.T) {
	t.Parallel()
	if _, err := ParseRedisConn("http://not-redis"); err == nil {
		t.Fatal("want error for non-redis uri")
	}
}

func TestServerDefaults(t *testing.T) {
	t.Parallel()
	// NewServer with a parseable URL must succeed and not panic; concurrency
	// defaulting is covered by construction (no enqueue needed).
	if _, err := NewServer("redis://localhost:6379/0", ServerOptions{}); err != nil {
		t.Fatalf("NewServer: %v", err)
	}
}

func TestEnqueueIntegration(t *testing.T) {
	ctx := context.Background()
	ctr, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("start redis: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })
	url, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	client, err := NewClient(url)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer client.Close()

	const qname = "holder-enrichment"
	task := asynq.NewTask("holder:enrich", []byte(`{"pool":"0xabc"}`))
	if _, err := client.Enqueue(task, asynq.Queue(qname)); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	insp, err := NewInspector(url)
	if err != nil {
		t.Fatalf("NewInspector: %v", err)
	}
	defer insp.Close()

	qi, err := insp.GetQueueInfo(qname)
	if err != nil {
		t.Fatalf("GetQueueInfo: %v", err)
	}
	if qi.Pending < 1 {
		t.Fatalf("pending = %d, want >= 1", qi.Pending)
	}
}
