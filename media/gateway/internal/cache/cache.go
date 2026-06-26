// Package cache is the gateway's Redis hot-cache for small media objects. It
// sits in front of R2 so the edge serves frequently-requested logos/banners/og
// cards without an origin round-trip, while large objects bypass the cache and
// stream straight from R2 (see internal/serve).
package cache

import (
	"context"
	"time"

	goredis "github.com/redis/go-redis/v9"

	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"
)

const keyPrefix = "gw:obj:"

// Object is a cached media object: its bytes plus the headers needed to serve
// it verbatim (Body is base64-encoded by the JSON codec in Redis).
type Object struct {
	ContentType string `json:"ct"`
	ETag        string `json:"etag"`
	Body        []byte `json:"body"`
}

// Cache is a typed Redis object cache.
type Cache struct {
	redis *goredis.Client
	ttl   time.Duration
}

// New constructs a Cache with the given TTL.
func New(redis *goredis.Client, ttl time.Duration) *Cache {
	return &Cache{redis: redis, ttl: ttl}
}

// Get returns the cached object for (bucket,key). found is false on a miss.
func (c *Cache) Get(ctx context.Context, bucket, key string) (Object, bool, error) {
	return sharedredis.CacheGet[Object](ctx, c.redis, redisKey(bucket, key))
}

// Set stores obj for (bucket,key) under the configured TTL.
func (c *Cache) Set(ctx context.Context, bucket, key string, obj Object) error {
	return sharedredis.CacheSet(ctx, c.redis, redisKey(bucket, key), obj, c.ttl)
}

func redisKey(bucket, key string) string { return keyPrefix + bucket + ":" + key }
