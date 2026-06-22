// Package config loads and validates the base environment shared by every
// service, mirroring the TS shared baseEnvSchema (shared/src/config/env.ts)
// one-to-one: identical env var names (invariant i8), identical defaults, and
// identical validation (address regex, URL checks, level/node-env enums).
package config

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/caarlos0/env/v11"
)

// BaseEnv is the parsed base environment. Field order follows env.ts.
type BaseEnv struct {
	DatabaseURL  string `env:"DATABASE_URL,required"`
	RedisURL     string `env:"REDIS_URL,required"`
	RedisBullURL string `env:"REDIS_BULL_URL,required"`

	ChainID        int    `env:"CHAIN_ID" envDefault:"125"`
	RPCURL         string `env:"RPC_URL,required"`
	RPCURLFallback string `env:"RPC_URL_FALLBACK"`

	EventEmitterAddress string `env:"EVENT_EMITTER_ADDRESS,required"`
	PoolRegistryAddress string `env:"POOL_REGISTRY_ADDRESS,required"`
	RouterAddress       string `env:"ROUTER_ADDRESS,required"`
	FactoryAddress      string `env:"FACTORY_ADDRESS,required"`
	QuoterAddress       string `env:"QUOTER_ADDRESS,required"`
	ProtocolConfigAddr  string `env:"PROTOCOL_CONFIG_ADDRESS,required"`
	FeeAccumulatorAddr  string `env:"FEE_ACCUMULATOR_ADDRESS,required"`
	SidioraNFTAddress   string `env:"SIDIORA_NFT_ADDRESS,required"`
	FeesRouterAddress   string `env:"FEES_ROUTER_ADDRESS,required"`
	PoolBeaconAddress   string `env:"POOL_BEACON_ADDRESS,required"`

	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	NodeEnv  string `env:"NODE_ENV" envDefault:"production"`
	Port     int    `env:"PORT" envDefault:"3000"`
}

var (
	addressRe   = regexp.MustCompile(`^0x[a-fA-F0-9]{40}$`)
	validLevels = map[string]struct{}{"debug": {}, "info": {}, "warn": {}, "error": {}}
	validNodes  = map[string]struct{}{"development": {}, "production": {}, "test": {}}
)

// Load parses the process environment into a validated BaseEnv.
func Load() (BaseEnv, error) {
	cfg, err := env.ParseAs[BaseEnv]()
	if err != nil {
		return BaseEnv{}, fmt.Errorf("config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return BaseEnv{}, fmt.Errorf("config: %w", err)
	}
	return cfg, nil
}

// Validate enforces the same field-level rules as the zod baseEnvSchema.
func (c *BaseEnv) Validate() error {
	var errs []error

	if err := requireHTTPURL("DATABASE_URL", c.DatabaseURL); err != nil {
		errs = append(errs, err)
	}
	if err := requireHTTPURL("RPC_URL", c.RPCURL); err != nil {
		errs = append(errs, err)
	}
	if c.RPCURLFallback != "" {
		if err := requireHTTPURL("RPC_URL_FALLBACK", c.RPCURLFallback); err != nil {
			errs = append(errs, err)
		}
	}

	for _, a := range []struct{ name, val string }{
		{"EVENT_EMITTER_ADDRESS", c.EventEmitterAddress},
		{"POOL_REGISTRY_ADDRESS", c.PoolRegistryAddress},
		{"ROUTER_ADDRESS", c.RouterAddress},
		{"FACTORY_ADDRESS", c.FactoryAddress},
		{"QUOTER_ADDRESS", c.QuoterAddress},
		{"PROTOCOL_CONFIG_ADDRESS", c.ProtocolConfigAddr},
		{"FEE_ACCUMULATOR_ADDRESS", c.FeeAccumulatorAddr},
		{"SIDIORA_NFT_ADDRESS", c.SidioraNFTAddress},
		{"FEES_ROUTER_ADDRESS", c.FeesRouterAddress},
		{"POOL_BEACON_ADDRESS", c.PoolBeaconAddress},
	} {
		if !addressRe.MatchString(a.val) {
			errs = append(errs, fmt.Errorf("%s %q is not a 0x-prefixed 20-byte address", a.name, a.val))
		}
	}

	if _, ok := validLevels[c.LogLevel]; !ok {
		errs = append(errs, fmt.Errorf("LOG_LEVEL %q must be one of debug|info|warn|error", c.LogLevel))
	}
	if _, ok := validNodes[c.NodeEnv]; !ok {
		errs = append(errs, fmt.Errorf("NODE_ENV %q must be one of development|production|test", c.NodeEnv))
	}

	return errors.Join(errs...)
}

func requireHTTPURL(name, raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("%s %q is not a valid URL", name, raw)
	}
	return nil
}
