// Package secrets is a uniform secrets-retrieval abstraction, porting the TS
// shared createSecretsManager (shared/src/secrets/manager.ts). The default
// provider reads the environment; an optional TTL cache wraps it. aws/vault are
// recognized but fall back to env until implemented. Secrets are never logged
// (SECTION 17 security).
package secrets

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"
)

// Provider retrieves secrets by key.
type Provider interface {
	// Get returns the value and whether it was found.
	Get(ctx context.Context, key string) (string, bool, error)
	// GetRequired returns the value or an error if it is absent.
	GetRequired(ctx context.Context, key string) (string, error)
}

// ProviderType selects the backing store.
type ProviderType string

const (
	ProviderEnv   ProviderType = "env"
	ProviderAWS   ProviderType = "aws"
	ProviderVault ProviderType = "vault"
)

// Options configures New.
type Options struct {
	// Provider selects the backend; empty uses $SECRETS_PROVIDER then env.
	Provider ProviderType
	// CacheTTL, when > 0, wraps the provider in a TTL cache.
	CacheTTL time.Duration
	// Logger is optional.
	Logger *slog.Logger
	// now is injectable for tests; nil uses time.Now.
	now func() time.Time
}

// New builds a Provider per Options, mirroring the TS provider selection.
func New(opts Options) Provider {
	pt := opts.Provider
	if pt == "" {
		pt = ProviderType(os.Getenv("SECRETS_PROVIDER"))
	}

	var base Provider = EnvProvider{}
	switch pt {
	case ProviderAWS:
		if opts.Logger != nil {
			opts.Logger.Warn("AWS Secrets Manager not yet implemented, falling back to env")
		}
	case ProviderVault:
		if opts.Logger != nil {
			opts.Logger.Warn("Vault provider not yet implemented, falling back to env")
		}
	case ProviderEnv, "":
	default:
		if opts.Logger != nil {
			opts.Logger.Warn("unknown secrets provider, falling back to env", slog.String("provider", string(pt)))
		}
	}

	if opts.CacheTTL > 0 {
		return newCached(base, opts.CacheTTL, opts.now)
	}
	return base
}

// EnvProvider reads secrets from the process environment.
type EnvProvider struct{}

// Get implements Provider.
func (EnvProvider) Get(_ context.Context, key string) (value string, found bool, err error) {
	v, ok := os.LookupEnv(key)
	return v, ok, nil
}

// GetRequired implements Provider.
func (e EnvProvider) GetRequired(ctx context.Context, key string) (string, error) {
	v, ok, err := e.Get(ctx, key)
	if err != nil {
		return "", err
	}
	if !ok || v == "" {
		return "", fmt.Errorf("secrets: required secret %q not found in environment", key)
	}
	return v, nil
}

type cacheEntry struct {
	value     string
	expiresAt time.Time
}

type cachedProvider struct {
	delegate Provider
	ttl      time.Duration
	now      func() time.Time
	mu       sync.Mutex
	cache    map[string]cacheEntry
}

func newCached(delegate Provider, ttl time.Duration, now func() time.Time) *cachedProvider {
	if now == nil {
		now = time.Now
	}
	return &cachedProvider{
		delegate: delegate,
		ttl:      ttl,
		now:      now,
		cache:    make(map[string]cacheEntry),
	}
}

func (c *cachedProvider) Get(ctx context.Context, key string) (value string, found bool, err error) {
	c.mu.Lock()
	if e, ok := c.cache[key]; ok && e.expiresAt.After(c.now()) {
		c.mu.Unlock()
		return e.value, true, nil
	}
	c.mu.Unlock()

	v, ok, err := c.delegate.Get(ctx, key)
	if err != nil {
		return "", false, err
	}
	if ok {
		c.mu.Lock()
		c.cache[key] = cacheEntry{value: v, expiresAt: c.now().Add(c.ttl)}
		c.mu.Unlock()
	}
	return v, ok, nil
}

func (c *cachedProvider) GetRequired(ctx context.Context, key string) (string, error) {
	v, ok, err := c.Get(ctx, key)
	if err != nil {
		return "", err
	}
	if !ok || v == "" {
		return "", fmt.Errorf("secrets: required secret %q not found", key)
	}
	return v, nil
}
