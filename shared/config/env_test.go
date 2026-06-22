package config

import (
	"testing"
)

// validEnv sets a complete, valid base environment via t.Setenv.
func validEnv(t *testing.T) {
	t.Helper()
	const addr = "0x6679aF411d534de222C32ed0AF94C3BD67090672"
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db?sslmode=disable")
	t.Setenv("REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("REDIS_BULL_URL", "redis://localhost:6379/1")
	t.Setenv("RPC_URL", "https://mainnet-beta.rpc.hyperpaxeer.com/rpc")
	for _, k := range []string{
		"EVENT_EMITTER_ADDRESS", "POOL_REGISTRY_ADDRESS", "ROUTER_ADDRESS",
		"FACTORY_ADDRESS", "QUOTER_ADDRESS", "PROTOCOL_CONFIG_ADDRESS",
		"FEE_ACCUMULATOR_ADDRESS", "SIDIORA_NFT_ADDRESS", "FEES_ROUTER_ADDRESS",
		"POOL_BEACON_ADDRESS",
	} {
		t.Setenv(k, addr)
	}
}

func TestLoadValidWithDefaults(t *testing.T) {
	validEnv(t)
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}
	if cfg.ChainID != 125 {
		t.Errorf("ChainID default = %d, want 125", cfg.ChainID)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel default = %q, want info", cfg.LogLevel)
	}
	if cfg.NodeEnv != "production" {
		t.Errorf("NodeEnv default = %q, want production", cfg.NodeEnv)
	}
	if cfg.Port != 3000 {
		t.Errorf("Port default = %d, want 3000", cfg.Port)
	}
	if cfg.RPCURLFallback != "" {
		t.Errorf("RPCURLFallback = %q, want empty (optional)", cfg.RPCURLFallback)
	}
}

func TestLoadCoercesAndOverrides(t *testing.T) {
	validEnv(t)
	t.Setenv("CHAIN_ID", "999")
	t.Setenv("PORT", "8080")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("NODE_ENV", "development")
	t.Setenv("RPC_URL_FALLBACK", "https://fallback.example.com/rpc")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}
	if cfg.ChainID != 999 || cfg.Port != 8080 {
		t.Errorf("coercion failed: ChainID=%d Port=%d", cfg.ChainID, cfg.Port)
	}
	if cfg.LogLevel != "debug" || cfg.NodeEnv != "development" {
		t.Errorf("override failed: LogLevel=%q NodeEnv=%q", cfg.LogLevel, cfg.NodeEnv)
	}
	if cfg.RPCURLFallback == "" {
		t.Error("RPCURLFallback should be set")
	}
}

func TestLoadMissingRequired(t *testing.T) {
	validEnv(t)
	t.Setenv("DATABASE_URL", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for missing DATABASE_URL")
	}
}

func TestValidateRejectsBadAddress(t *testing.T) {
	validEnv(t)
	t.Setenv("ROUTER_ADDRESS", "0xnothex")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for malformed ROUTER_ADDRESS")
	}
}

func TestValidateRejectsBadURL(t *testing.T) {
	validEnv(t)
	t.Setenv("RPC_URL", "not-a-url")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for malformed RPC_URL")
	}
}

func TestValidateRejectsBadFallbackURL(t *testing.T) {
	validEnv(t)
	t.Setenv("RPC_URL_FALLBACK", "::::bad")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for malformed RPC_URL_FALLBACK")
	}
}

func TestValidateRejectsBadEnums(t *testing.T) {
	validEnv(t)
	t.Setenv("LOG_LEVEL", "verbose")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for invalid LOG_LEVEL")
	}
}

func TestValidateRejectsBadNodeEnv(t *testing.T) {
	validEnv(t)
	t.Setenv("NODE_ENV", "staging")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for invalid NODE_ENV")
	}
}
