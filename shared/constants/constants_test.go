package constants

import "testing"

func TestChannelValues(t *testing.T) {
	t.Parallel()
	want := map[string]string{
		"SWAP":                 ChannelSwap,
		"MARKET_CREATED":       ChannelMarketCreated,
		"POOL_STATE_UPDATED":   ChannelPoolStateUpdated,
		"FEE_RECORDED":         ChannelFeeRecorded,
		"FEE_DISTRIBUTED":      ChannelFeeDistributed,
		"FEE_STRATEGY_CHANGED": ChannelFeeStrategyChanged,
		"OPTICAL_EXECUTED":     ChannelOpticalExecuted,
		"CONFIG_UPDATED":       ChannelConfigUpdated,
		"CANDLE_UPDATE":        ChannelCandleUpdate,
	}
	// Exact wire strings (invariant i5 — must match the TS CHANNELS constant).
	exact := map[string]string{
		"SWAP":                 "indexer:swap",
		"MARKET_CREATED":       "indexer:market_created",
		"POOL_STATE_UPDATED":   "indexer:pool_state_updated",
		"FEE_RECORDED":         "indexer:fee_recorded",
		"FEE_DISTRIBUTED":      "indexer:fee_distributed",
		"FEE_STRATEGY_CHANGED": "indexer:fee_strategy_changed",
		"OPTICAL_EXECUTED":     "indexer:optical_executed",
		"CONFIG_UPDATED":       "indexer:config_updated",
		"CANDLE_UPDATE":        "candles:update",
	}
	for k, got := range want {
		if got != exact[k] {
			t.Errorf("%s = %q, want %q", k, got, exact[k])
		}
	}
	if len(Channels) != len(exact) {
		t.Fatalf("Channels len = %d, want %d", len(Channels), len(exact))
	}
}

func TestQueueValues(t *testing.T) {
	t.Parallel()
	exact := []string{"holder-enrichment", "ranking-compute", "image-processing", "indexer-backfill"}
	got := []string{QueueHolderEnrichment, QueueRankingCompute, QueueImageProcessing, QueueBackfill}
	for i := range exact {
		if got[i] != exact[i] {
			t.Errorf("queue[%d] = %q, want %q", i, got[i], exact[i])
		}
	}
	if len(Queues) != len(exact) {
		t.Fatalf("Queues len = %d, want %d", len(Queues), len(exact))
	}
	for i := range Queues {
		if Queues[i] != exact[i] {
			t.Errorf("Queues[%d] = %q, want %q", i, Queues[i], exact[i])
		}
	}
}

func TestTimeframes(t *testing.T) {
	t.Parallel()
	want := map[string]int64{
		"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800,
	}
	if len(Timeframes) != len(want) {
		t.Fatalf("Timeframes len = %d, want %d", len(Timeframes), len(want))
	}
	for k, v := range want {
		if Timeframes[k] != v {
			t.Errorf("Timeframes[%q] = %d, want %d", k, Timeframes[k], v)
		}
	}
	if len(TimeframeKeys) != len(want) {
		t.Fatalf("TimeframeKeys len = %d, want %d", len(TimeframeKeys), len(want))
	}
	// Keys must be in ascending duration order.
	var prev int64
	for i, k := range TimeframeKeys {
		v, ok := Timeframes[k]
		if !ok {
			t.Errorf("TimeframeKeys[%d]=%q missing from Timeframes", i, k)
		}
		if v <= prev {
			t.Errorf("TimeframeKeys not ascending at %d (%q=%d <= %d)", i, k, v, prev)
		}
		prev = v
	}
}
