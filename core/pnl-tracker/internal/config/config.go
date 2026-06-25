// Package config loads and validates the core/pnl-tracker environment, mirroring
// the TS pnlEnvSchema (pnl/src/config.ts): identical env var names (invariant
// i8), identical defaults, extending the shared base env (shared/config.BaseEnv).
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"

	sharedconfig "github.com/Sidiora-Technologies/KindleLaunch/shared/config"
)

// Config is the parsed pnl environment.
type Config struct {
	sharedconfig.BaseEnv

	// ReconcileIntervalMS is how often the idempotent backfill reconciler scans
	// indexer.swaps for swaps not yet folded into positions. Mirrors the TS
	// PNL_RECONCILE_INTERVAL_MS (default 30000).
	ReconcileIntervalMS int `env:"PNL_RECONCILE_INTERVAL_MS" envDefault:"30000"`

	// ReconcileBatchSize bounds the number of swaps reconciled per tick.
	ReconcileBatchSize int `env:"PNL_RECONCILE_BATCH_SIZE" envDefault:"500"`

	// PublicBaseURL is the origin used to build a card's shareUrl
	// (PublicBaseURL + "/pnl/" + shortCode) — the referral landing page.
	PublicBaseURL string `env:"PNL_PUBLIC_BASE_URL" envDefault:"https://sidiora.fun"`

	// OGBaseURL is the origin that serves rendered OG images. Empty falls back to
	// PublicBaseURL. The ogUrl is OGBaseURL + "/pnl/cards/" + cardId + "/og.png".
	OGBaseURL string `env:"PNL_OG_BASE_URL"`

	// FontDir is an optional directory holding the Inter *.ttf font files used by
	// the OG renderer. When empty (or a face is missing) the renderer falls back
	// to the built-in basic font so rendering never fails.
	FontDir string `env:"PNL_FONT_DIR"`

	// RewardPerConversion is the (integer) reward units credited to a sharer per
	// referral conversion, surfaced in the sharer dashboard.
	RewardPerConversion int `env:"PNL_REWARD_PER_CONVERSION" envDefault:"1"`

	// WebhookHMACSecret is the HMAC-SHA256 secret shared with the indexer fanout
	// publisher. Required, min 32 chars (zod parity).
	WebhookHMACSecret string `env:"WEBHOOK_HMAC_SECRET,required"`

	// CORSAllowedOrigins is the HTTP CORS allowlist (comma-separated; empty/"*"
	// allows all).
	CORSAllowedOrigins string `env:"CORS_ALLOWED_ORIGINS"`
}

// Load parses the process environment into a validated Config.
func Load() (Config, error) {
	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return Config{}, fmt.Errorf("config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("config: %w", err)
	}
	if len(cfg.WebhookHMACSecret) < 32 {
		return Config{}, fmt.Errorf("config: WEBHOOK_HMAC_SECRET must be at least 32 characters")
	}
	return cfg, nil
}

// ReconcileInterval returns the reconciler scan interval as a Duration.
func (c Config) ReconcileInterval() time.Duration {
	return time.Duration(c.ReconcileIntervalMS) * time.Millisecond
}

// OGOrigin returns the origin used to build OG image URLs, falling back to the
// public base URL when PNL_OG_BASE_URL is unset.
func (c Config) OGOrigin() string {
	if s := strings.TrimSpace(c.OGBaseURL); s != "" {
		return strings.TrimRight(s, "/")
	}
	return strings.TrimRight(c.PublicBaseURL, "/")
}

// ShareOrigin returns the trimmed public base URL used to build share URLs.
func (c Config) ShareOrigin() string {
	return strings.TrimRight(c.PublicBaseURL, "/")
}
