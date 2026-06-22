package redis

import (
	"context"
	"testing"
	"time"

	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
)

func newRedisURL(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("start redis container: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })
	uri, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	return uri
}

func TestNewClientBadURL(t *testing.T) {
	t.Parallel()
	if _, err := NewClient("not a url"); err == nil {
		t.Fatal("want error for bad redis url")
	}
}

func TestClientAndCacheIntegration(t *testing.T) {
	ctx := context.Background()
	url := newRedisURL(t)

	rdb, err := NewClient(url)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Fatalf("ping: %v", err)
	}

	type payload struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	// Miss.
	if _, ok, err := CacheGet[payload](ctx, rdb, "k1"); err != nil || ok {
		t.Fatalf("expected miss, got ok=%v err=%v", ok, err)
	}
	// Set + hit.
	want := payload{Name: "sidiora", Count: 7}
	if err := CacheSet(ctx, rdb, "k1", want, time.Minute); err != nil {
		t.Fatalf("CacheSet: %v", err)
	}
	got, ok, err := CacheGet[payload](ctx, rdb, "k1")
	if err != nil || !ok || got != want {
		t.Fatalf("CacheGet = %+v ok=%v err=%v", got, ok, err)
	}
	// Invalidate.
	if err := CacheInvalidate(ctx, rdb, "k1"); err != nil {
		t.Fatalf("CacheInvalidate: %v", err)
	}
	if _, ok, _ := CacheGet[payload](ctx, rdb, "k1"); ok {
		t.Fatal("expected miss after invalidate")
	}

	// GetOrSet: first call fetches, second call serves cache.
	calls := 0
	fetch := func() (payload, error) { calls++; return payload{Name: "lazy", Count: calls}, nil }
	v1, err := CacheGetOrSet(ctx, rdb, "k2", fetch, time.Minute)
	if err != nil || v1.Count != 1 {
		t.Fatalf("GetOrSet first = %+v err=%v", v1, err)
	}
	v2, err := CacheGetOrSet(ctx, rdb, "k2", fetch, time.Minute)
	if err != nil || v2.Count != 1 || calls != 1 {
		t.Fatalf("GetOrSet second = %+v calls=%d err=%v (should serve cache)", v2, calls, err)
	}
}

func TestPubSubIntegration(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	url := newRedisURL(t)

	sub, err := NewSubscriber(url)
	if err != nil {
		t.Fatalf("NewSubscriber: %v", err)
	}
	defer sub.Close()

	const channel = "indexer:swap"
	received := make(chan string, 1)
	if _, err := sub.Subscribe(ctx, channel, func(_ context.Context, payload []byte) error {
		received <- string(payload)
		return nil
	}); err != nil {
		t.Fatalf("Subscribe: %v", err)
	}

	pub, err := NewPublisher(url)
	if err != nil {
		t.Fatalf("NewPublisher: %v", err)
	}
	defer pub.Close()

	// Give the subscription a moment to register, then publish.
	type swap struct {
		Pool string `json:"pool"`
	}
	deadline := time.After(5 * time.Second)
	for {
		if err := pub.Publish(ctx, channel, swap{Pool: "0xabc"}); err != nil {
			t.Fatalf("Publish: %v", err)
		}
		select {
		case got := <-received:
			if got != `{"pool":"0xabc"}` {
				t.Fatalf("payload = %s", got)
			}
			return
		case <-time.After(150 * time.Millisecond):
			// retry publish (subscriber may not be ready yet)
		case <-deadline:
			t.Fatal("did not receive published message in time")
		}
	}
}
