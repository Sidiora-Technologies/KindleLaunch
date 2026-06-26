// Package config loads and validates the media/gateway environment. The gateway
// is the PUBLIC media edge (SECTION 15): it authenticates users once (EIP-191 ->
// JWT session), fronts media/social over a REST + WS tunnel injecting the trusted
// X-Actor-Wallet header, serves media bytes from R2 with CDN caching, and guards
// the token-create upload before forwarding it to media/metadata.
//
// It is STATELESS apart from Redis (auth nonces, hot object cache, rate limiter):
// it owns no Postgres schema and runs no migrations. Env var names follow the
// shared S3_* convention (invariant i8) so deploy configs port across unchanged.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/caarlos0/env/v11"
)

// Config is the parsed gateway environment.
type Config struct {
	RedisURL string `env:"REDIS_URL,required"`

	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	Port     int    `env:"PORT" envDefault:"3000"`

	// PublicURL is the externally-reachable base of this gateway (used to build
	// absolute media URLs). Empty falls back to the incoming request host.
	PublicURL string `env:"PUBLIC_URL"`

	// ── Session auth (EIP-191 SIWE -> JWT) ──────────────────────────────────
	// JWTSecret signs session tokens (HMAC-SHA256). Required and must be strong.
	JWTSecret string `env:"GATEWAY_JWT_SECRET,required"`
	// JWTTTLSeconds is the session lifetime (default 24h).
	JWTTTLSeconds int `env:"GATEWAY_JWT_TTL_SECONDS" envDefault:"86400"`
	// NonceTTLSeconds bounds how long a login nonce is valid (default 5m).
	NonceTTLSeconds int `env:"GATEWAY_NONCE_TTL_SECONDS" envDefault:"300"`
	// AppDomain is embedded in the SIWE sign-in message for user clarity.
	AppDomain string `env:"GATEWAY_APP_DOMAIN" envDefault:"kindlelaunch"`

	// ── Upstreams the edge fronts ───────────────────────────────────────────
	// SocialHTTPURL / SocialWSURL are the internal base URLs of media/social.
	SocialHTTPURL string `env:"SOCIAL_HTTP_URL,required"`
	SocialWSURL   string `env:"SOCIAL_WS_URL,required"`
	// MetadataUploadURL is the internal base URL of media/metadata (the
	// authoritative upload writer the create-wizard upload is forwarded to).
	MetadataUploadURL string `env:"METADATA_UPLOAD_URL,required"`
	// UpstreamTimeoutSeconds caps proxied REST/upload calls (default 30s).
	UpstreamTimeoutSeconds int `env:"UPSTREAM_TIMEOUT_SECONDS" envDefault:"30"`

	// ── Object storage (Cloudflare R2 / S3-compatible) ──────────────────────
	S3Endpoint        string `env:"S3_ENDPOINT,required"`
	S3AccessKeyID     string `env:"S3_ACCESS_KEY_ID,required"`
	S3SecretAccessKey string `env:"S3_SECRET_ACCESS_KEY,required"`
	S3Region          string `env:"S3_REGION" envDefault:"auto"`
	// Logical bucket map. At least one must be set; an unset bucket makes its
	// logical name 404 at the edge. token=metadata assets, user=profile assets,
	// og=pnl share cards.
	TokenBucket string `env:"METADATA_BUCKET"`
	UserBucket  string `env:"USER_BUCKET"`
	OGBucket    string `env:"OG_BUCKET"`
	// ObjectCacheMaxBytes is the largest object body cached in Redis (default
	// 256KiB). Larger objects stream straight from R2 (no cache).
	ObjectCacheMaxBytes int64 `env:"OBJECT_CACHE_MAX_BYTES" envDefault:"262144"`
	// ObjectCacheTTLSeconds is the Redis hot-cache TTL for objects (default 5m).
	ObjectCacheTTLSeconds int `env:"OBJECT_CACHE_TTL_SECONDS" envDefault:"300"`

	// ── Upload edge guard ───────────────────────────────────────────────────
	MaxUploadBytes int64 `env:"MAX_UPLOAD_BYTES" envDefault:"6291456"` // 6 MiB

	// ── Public ingress rate limiting (i12) ──────────────────────────────────
	RateLimitMax           int `env:"RATE_LIMIT_MAX" envDefault:"120"`
	RateLimitWindowSeconds int `env:"RATE_LIMIT_WINDOW_SECONDS" envDefault:"60"`

	// Optional CORS allowlist (comma-separated). Empty/"*" allows all (dev).
	CORSAllowedOrigins string `env:"CORS_ALLOWED_ORIGINS"`
}

var validLevels = map[string]struct{}{"debug": {}, "info": {}, "warn": {}, "error": {}}

// Load parses the process environment into a validated Config.
func Load() (Config, error) {
	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return Config{}, fmt.Errorf("config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("config: %w", err)
	}
	return cfg, nil
}

// Buckets returns the configured logical-name -> bucket map, omitting unset ones.
func (c *Config) Buckets() map[string]string {
	m := make(map[string]string, 3)
	if s := strings.TrimSpace(c.TokenBucket); s != "" {
		m["token"] = s
	}
	if s := strings.TrimSpace(c.UserBucket); s != "" {
		m["user"] = s
	}
	if s := strings.TrimSpace(c.OGBucket); s != "" {
		m["og"] = s
	}
	return m
}

// Validate enforces field-level rules beyond presence.
func (c *Config) Validate() error {
	var errs []error

	if strings.TrimSpace(c.RedisURL) == "" {
		errs = append(errs, errors.New("REDIS_URL is required"))
	}
	if _, ok := validLevels[c.LogLevel]; !ok {
		errs = append(errs, fmt.Errorf("LOG_LEVEL %q must be one of debug|info|warn|error", c.LogLevel))
	}
	if c.Port <= 0 || c.Port > 65535 {
		errs = append(errs, fmt.Errorf("PORT %d must be in 1..65535", c.Port))
	}
	if len(strings.TrimSpace(c.JWTSecret)) < 16 {
		errs = append(errs, errors.New("GATEWAY_JWT_SECRET must be at least 16 characters"))
	}
	if c.JWTTTLSeconds <= 0 {
		errs = append(errs, fmt.Errorf("GATEWAY_JWT_TTL_SECONDS %d must be positive", c.JWTTTLSeconds))
	}
	if c.NonceTTLSeconds <= 0 {
		errs = append(errs, fmt.Errorf("GATEWAY_NONCE_TTL_SECONDS %d must be positive", c.NonceTTLSeconds))
	}
	for name, raw := range map[string]string{
		"SOCIAL_HTTP_URL":     c.SocialHTTPURL,
		"SOCIAL_WS_URL":       c.SocialWSURL,
		"METADATA_UPLOAD_URL": c.MetadataUploadURL,
		"S3_ENDPOINT":         c.S3Endpoint,
	} {
		if err := requireURL(name, raw); err != nil {
			errs = append(errs, err)
		}
	}
	if c.UpstreamTimeoutSeconds <= 0 {
		errs = append(errs, fmt.Errorf("UPSTREAM_TIMEOUT_SECONDS %d must be positive", c.UpstreamTimeoutSeconds))
	}
	if strings.TrimSpace(c.S3AccessKeyID) == "" {
		errs = append(errs, errors.New("S3_ACCESS_KEY_ID is required"))
	}
	if strings.TrimSpace(c.S3SecretAccessKey) == "" {
		errs = append(errs, errors.New("S3_SECRET_ACCESS_KEY is required"))
	}
	if len(c.Buckets()) == 0 {
		errs = append(errs, errors.New("at least one of METADATA_BUCKET/USER_BUCKET/OG_BUCKET is required"))
	}
	if c.ObjectCacheMaxBytes < 0 {
		errs = append(errs, fmt.Errorf("OBJECT_CACHE_MAX_BYTES %d must be non-negative", c.ObjectCacheMaxBytes))
	}
	if c.ObjectCacheTTLSeconds <= 0 {
		errs = append(errs, fmt.Errorf("OBJECT_CACHE_TTL_SECONDS %d must be positive", c.ObjectCacheTTLSeconds))
	}
	if c.MaxUploadBytes <= 0 {
		errs = append(errs, fmt.Errorf("MAX_UPLOAD_BYTES %d must be positive", c.MaxUploadBytes))
	}
	if c.RateLimitMax <= 0 {
		errs = append(errs, fmt.Errorf("RATE_LIMIT_MAX %d must be positive", c.RateLimitMax))
	}
	if c.RateLimitWindowSeconds <= 0 {
		errs = append(errs, fmt.Errorf("RATE_LIMIT_WINDOW_SECONDS %d must be positive", c.RateLimitWindowSeconds))
	}

	return errors.Join(errs...)
}

func requireURL(name, raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("%s %q is not a valid URL", name, raw)
	}
	return nil
}
