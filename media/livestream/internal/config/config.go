// Package config loads and validates the media/livestream environment, mirroring
// the TS livestreamEnvSchema (src/config.ts) one-to-one: identical env var names
// (invariant i8 — matches docker-envs/livestream.env), defaults, and validation.
//
// Unlike most services, livestream does NOT inherit the chain-heavy base env
// (no RPC_URL / contract addresses): the TS service defines its own schema, and
// docker-envs/livestream.env carries none of those vars.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/caarlos0/env/v11"
)

// Config is the parsed livestream environment. Field order follows config.ts.
type Config struct {
	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL,required"`

	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	Port     int    `env:"PORT" envDefault:"3000"`

	LivepeerAPIKey string `env:"LIVEPEER_API_KEY,required"`
	LivepeerAPIURL string `env:"LIVEPEER_API_URL" envDefault:"https://livepeer.studio/api"`

	MaxStreamsPerWallet int `env:"MAX_STREAMS_PER_WALLET" envDefault:"3"`

	// Optional: when set, /webhooks/livepeer enforces HMAC signature checks (L-1).
	LivepeerWebhookSecret string `env:"LIVEPEER_WEBHOOK_SECRET"`

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

// Validate enforces the same field-level rules as the zod livestreamEnvSchema.
func (c *Config) Validate() error {
	var errs []error

	if err := requireURL("DATABASE_URL", c.DatabaseURL); err != nil {
		errs = append(errs, err)
	}
	if strings.TrimSpace(c.RedisURL) == "" {
		errs = append(errs, errors.New("REDIS_URL is required"))
	}
	if err := requireURL("LIVEPEER_API_URL", c.LivepeerAPIURL); err != nil {
		errs = append(errs, err)
	}
	if strings.TrimSpace(c.LivepeerAPIKey) == "" {
		errs = append(errs, errors.New("LIVEPEER_API_KEY is required (min 1 char)"))
	}
	if _, ok := validLevels[c.LogLevel]; !ok {
		errs = append(errs, fmt.Errorf("LOG_LEVEL %q must be one of debug|info|warn|error", c.LogLevel))
	}
	if c.Port <= 0 || c.Port > 65535 {
		errs = append(errs, fmt.Errorf("PORT %d must be in 1..65535", c.Port))
	}
	if c.MaxStreamsPerWallet <= 0 {
		errs = append(errs, fmt.Errorf("MAX_STREAMS_PER_WALLET %d must be positive", c.MaxStreamsPerWallet))
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
