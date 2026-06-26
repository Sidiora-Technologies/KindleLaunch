// Package config loads and validates the media/social environment, mirroring the
// TS chatEnvSchema (src/config.ts) env var names (invariant i8 — matches
// docker-envs/chat.env) and defaults, plus the knobs the Go realtime hub needs
// to stay bounded under the 500K-concurrency bar (i11).
//
// Identity model (2026-06-26 decision): social writes are SIGN-FREE. There is no
// per-action EIP-191 verification; the actor wallet is injected by media/gateway
// (the sole public ingress) via the X-Actor-Wallet header, which this service
// trusts. Admin/moderation routes are still gated by CHAT_ADMIN_API_KEY.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/caarlos0/env/v11"
)

// Config is the parsed social-service environment.
type Config struct {
	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL,required"`

	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	Port     int    `env:"PORT" envDefault:"3000"`

	// MaxMessageLength caps pool/dm/comment content length (parity with TS
	// MAX_MESSAGE_LENGTH).
	MaxMessageLength int `env:"MAX_MESSAGE_LENGTH" envDefault:"500"`

	// Per-actor sliding-window rate limit for realtime sends (parity with the
	// TS ws handler's 10s/5-message window).
	RateWindowSeconds  int `env:"RATE_WINDOW_SECONDS" envDefault:"10"`
	MaxPoolMsgsPerWin  int `env:"MAX_POOL_MSGS_PER_WINDOW" envDefault:"5"`
	MaxDmMsgsPerWindow int `env:"MAX_DM_MSGS_PER_WINDOW" envDefault:"5"`

	// Realtime hub bounds (i11 backpressure). WSSendBuffer is the per-connection
	// outbound queue depth; a client that can't keep up past it is evicted rather
	// than allowed to grow memory without bound.
	WSSendBuffer       int   `env:"WS_SEND_BUFFER" envDefault:"64"`
	WSWriteTimeoutSecs int   `env:"WS_WRITE_TIMEOUT_SECONDS" envDefault:"10"`
	WSReadLimitBytes   int64 `env:"WS_READ_LIMIT_BYTES" envDefault:"4096"`

	// ChatAdminAPIKey gates the /admin/* moderation routes. Empty => admin API
	// is disabled (routes return 503), parity with the TS service.
	ChatAdminAPIKey string `env:"CHAT_ADMIN_API_KEY"`

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

// Validate enforces field-level rules beyond presence.
func (c *Config) Validate() error {
	var errs []error

	if err := requireURL("DATABASE_URL", c.DatabaseURL); err != nil {
		errs = append(errs, err)
	}
	if strings.TrimSpace(c.RedisURL) == "" {
		errs = append(errs, errors.New("REDIS_URL is required"))
	}
	if _, ok := validLevels[c.LogLevel]; !ok {
		errs = append(errs, fmt.Errorf("LOG_LEVEL %q must be one of debug|info|warn|error", c.LogLevel))
	}
	if c.Port <= 0 || c.Port > 65535 {
		errs = append(errs, fmt.Errorf("PORT %d must be in 1..65535", c.Port))
	}
	if c.MaxMessageLength <= 0 {
		errs = append(errs, fmt.Errorf("MAX_MESSAGE_LENGTH %d must be positive", c.MaxMessageLength))
	}
	if c.RateWindowSeconds <= 0 {
		errs = append(errs, fmt.Errorf("RATE_WINDOW_SECONDS %d must be positive", c.RateWindowSeconds))
	}
	if c.MaxPoolMsgsPerWin <= 0 {
		errs = append(errs, fmt.Errorf("MAX_POOL_MSGS_PER_WINDOW %d must be positive", c.MaxPoolMsgsPerWin))
	}
	if c.MaxDmMsgsPerWindow <= 0 {
		errs = append(errs, fmt.Errorf("MAX_DM_MSGS_PER_WINDOW %d must be positive", c.MaxDmMsgsPerWindow))
	}
	if c.WSSendBuffer <= 0 {
		errs = append(errs, fmt.Errorf("WS_SEND_BUFFER %d must be positive", c.WSSendBuffer))
	}
	if c.WSWriteTimeoutSecs <= 0 {
		errs = append(errs, fmt.Errorf("WS_WRITE_TIMEOUT_SECONDS %d must be positive", c.WSWriteTimeoutSecs))
	}
	if c.WSReadLimitBytes <= 0 {
		errs = append(errs, fmt.Errorf("WS_READ_LIMIT_BYTES %d must be positive", c.WSReadLimitBytes))
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
