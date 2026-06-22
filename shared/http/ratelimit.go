package http

import (
	"context"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimitOptions configures the rate-limit middleware (parity with TS
// rate-limit.ts). Redis is used when set; otherwise a per-process in-memory
// store is the fallback (not shared across instances — SH-1).
type RateLimitOptions struct {
	Max         int
	Window      time.Duration
	Redis       *redis.Client
	KeyFunc     func(*http.Request) string
	RoutePrefix string
}

// RateLimit returns a chi-compatible middleware enforcing the limit, setting
// X-RateLimit-* headers and returning 429 when exceeded (i12 load-shedding).
func RateLimit(opts RateLimitOptions) func(http.Handler) http.Handler {
	maxN := opts.Max
	if maxN <= 0 {
		maxN = 100
	}
	window := opts.Window
	if window <= 0 {
		window = 60 * time.Second
	}
	keyFunc := opts.KeyFunc
	if keyFunc == nil {
		keyFunc = clientIP
	}
	store := newMemStore()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if opts.RoutePrefix != "" && !strings.HasPrefix(r.URL.Path, opts.RoutePrefix) {
				next.ServeHTTP(w, r)
				return
			}
			key := keyFunc(r)

			var allowed bool
			var remaining int
			if opts.Redis != nil {
				a, rem, err := checkRedis(r.Context(), opts.Redis, key, maxN, window)
				if err != nil {
					a, rem = store.check(key, maxN, window)
				}
				allowed, remaining = a, rem
			} else {
				allowed, remaining = store.check(key, maxN, window)
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(maxN))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
			if !allowed {
				WriteError(w, http.StatusTooManyRequests, "Too Many Requests",
					"rate limit exceeded, try again in "+strconv.Itoa(int(window.Seconds()))+"s")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func checkRedis(ctx context.Context, rdb *redis.Client, key string, maxN int, window time.Duration) (allowed bool, remaining int, err error) {
	full := "ratelimit:" + key
	current, err := rdb.Incr(ctx, full).Result()
	if err != nil {
		return false, 0, err
	}
	if current == 1 {
		if err := rdb.Expire(ctx, full, window).Err(); err != nil {
			return false, 0, err
		}
	}
	rem := maxN - int(current)
	if rem < 0 {
		rem = 0
	}
	return current <= int64(maxN), rem, nil
}

type memEntry struct {
	count   int
	resetAt time.Time
}

type memStore struct {
	mu        sync.Mutex
	entries   map[string]memEntry
	lastSweep time.Time
}

func newMemStore() *memStore {
	return &memStore{entries: make(map[string]memEntry), lastSweep: time.Now()}
}

func (s *memStore) check(key string, maxN int, window time.Duration) (allowed bool, remaining int) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()

	// Opportunistic sweep (no background goroutine -> no leak).
	if now.Sub(s.lastSweep) > time.Minute {
		for k, e := range s.entries {
			if !e.resetAt.After(now) {
				delete(s.entries, k)
			}
		}
		s.lastSweep = now
	}

	e, ok := s.entries[key]
	if !ok || !e.resetAt.After(now) {
		s.entries[key] = memEntry{count: 1, resetAt: now.Add(window)}
		return true, maxN - 1
	}
	e.count++
	s.entries[key] = e
	rem := maxN - e.count
	if rem < 0 {
		rem = 0
	}
	return e.count <= maxN, rem
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
