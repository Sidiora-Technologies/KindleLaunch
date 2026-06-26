// Package config loads and validates the media/metadata environment, mirroring
// the TS metadataEnvSchema (src/config.ts) env var names (invariant i8 — matches
// docker-envs/metadata.env) and defaults.
//
// Storage model is BUCKET-PRIMARY (2026-06-26 decision): the S3_* vars are now
// REQUIRED (the TS volume-as-source-of-truth + optional-fallback model is gone).
// Objects are written straight to R2 and served back from it.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/caarlos0/env/v11"
)

// Config is the parsed metadata environment.
type Config struct {
	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL,required"`

	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	Port     int    `env:"PORT" envDefault:"3000"`

	// PublicURL builds absolute image/metadata URLs. When empty, URLs are built
	// from the incoming request host (parity with the TS fallback).
	PublicURL string `env:"PUBLIC_URL"`

	// Object storage (Cloudflare R2 / S3-compatible) — bucket-primary, required.
	S3Endpoint        string `env:"S3_ENDPOINT,required"`
	S3Bucket          string `env:"S3_BUCKET,required"`
	S3AccessKeyID     string `env:"S3_ACCESS_KEY_ID,required"`
	S3SecretAccessKey string `env:"S3_SECRET_ACCESS_KEY,required"`
	S3Region          string `env:"S3_REGION" envDefault:"auto"`

	MaxLogoSizeBytes   int64 `env:"MAX_LOGO_SIZE_BYTES" envDefault:"2097152"`
	MaxBannerSizeBytes int64 `env:"MAX_BANNER_SIZE_BYTES" envDefault:"5242880"`

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
	if err := requireURL("S3_ENDPOINT", c.S3Endpoint); err != nil {
		errs = append(errs, err)
	}
	if strings.TrimSpace(c.S3Bucket) == "" {
		errs = append(errs, errors.New("S3_BUCKET is required"))
	}
	if strings.TrimSpace(c.S3AccessKeyID) == "" {
		errs = append(errs, errors.New("S3_ACCESS_KEY_ID is required"))
	}
	if strings.TrimSpace(c.S3SecretAccessKey) == "" {
		errs = append(errs, errors.New("S3_SECRET_ACCESS_KEY is required"))
	}
	if _, ok := validLevels[c.LogLevel]; !ok {
		errs = append(errs, fmt.Errorf("LOG_LEVEL %q must be one of debug|info|warn|error", c.LogLevel))
	}
	if c.Port <= 0 || c.Port > 65535 {
		errs = append(errs, fmt.Errorf("PORT %d must be in 1..65535", c.Port))
	}
	if c.MaxLogoSizeBytes <= 0 {
		errs = append(errs, fmt.Errorf("MAX_LOGO_SIZE_BYTES %d must be positive", c.MaxLogoSizeBytes))
	}
	if c.MaxBannerSizeBytes <= 0 {
		errs = append(errs, fmt.Errorf("MAX_BANNER_SIZE_BYTES %d must be positive", c.MaxBannerSizeBytes))
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
