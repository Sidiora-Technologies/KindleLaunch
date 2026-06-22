// Package redis wraps go-redis v9 for the shared client, pub/sub, and JSON
// cache helpers, porting shared/src/redis. Channel payloads are JSON, identical
// in shape to the TS services (invariant i5).
package redis

import (
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client is the concrete go-redis client type used across services.
type Client = redis.Client

// NewClient builds a go-redis client from a redis:// URL with retry behaviour
// mirroring the TS createRedisClient (maxRetries 3, capped backoff).
func NewClient(redisURL string) (*redis.Client, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("redis: parse url: %w", err)
	}
	opt.MaxRetries = 3
	opt.MinRetryBackoff = 200 * time.Millisecond
	opt.MaxRetryBackoff = 5 * time.Second
	return redis.NewClient(opt), nil
}
