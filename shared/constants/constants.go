// Package constants holds the cross-service wire constants (Redis channels,
// queue names, candle timeframes) ported verbatim from the TypeScript shared
// package so Go and TS services interoperate byte-for-byte.
//
// Parity sources:
//   - channels.ts   -> Channel* (invariant i5: identical Redis channel names)
//   - queues.ts     -> Queue*
//   - timeframes.ts -> Timeframes / TimeframeKeys
package constants

// Redis pub/sub channel names (shared/src/constants/channels.ts CHANNELS).
const (
	ChannelSwap               = "indexer:swap"
	ChannelMarketCreated      = "indexer:market_created"
	ChannelPoolStateUpdated   = "indexer:pool_state_updated"
	ChannelFeeRecorded        = "indexer:fee_recorded"
	ChannelFeeDistributed     = "indexer:fee_distributed"
	ChannelFeeStrategyChanged = "indexer:fee_strategy_changed"
	ChannelOpticalExecuted    = "indexer:optical_executed"
	ChannelConfigUpdated      = "indexer:config_updated"
	ChannelCandleUpdate       = "candles:update"
)

// Channels is the ordered set of every Redis channel the indexer fans out on.
var Channels = []string{
	ChannelSwap,
	ChannelMarketCreated,
	ChannelPoolStateUpdated,
	ChannelFeeRecorded,
	ChannelFeeDistributed,
	ChannelFeeStrategyChanged,
	ChannelOpticalExecuted,
	ChannelConfigUpdated,
	ChannelCandleUpdate,
}

// Queue names (shared/src/constants/queues.ts QUEUES).
const (
	QueueHolderEnrichment = "holder-enrichment"
	QueueRankingCompute   = "ranking-compute"
	QueueImageProcessing  = "image-processing"
	QueueBackfill         = "indexer-backfill"
)

// Queues is the ordered set of every background queue name.
var Queues = []string{
	QueueHolderEnrichment,
	QueueRankingCompute,
	QueueImageProcessing,
	QueueBackfill,
}

// Timeframes maps a candle timeframe key to its duration in seconds
// (shared/src/constants/timeframes.ts TIMEFRAMES).
var Timeframes = map[string]int64{
	"1m":  60,
	"5m":  300,
	"15m": 900,
	"1h":  3600,
	"4h":  14400,
	"1d":  86400,
	"1w":  604800,
}

// TimeframeKeys lists the timeframe keys in ascending duration order
// (parity with TIMEFRAME_KEYS, which preserves object insertion order).
var TimeframeKeys = []string{"1m", "5m", "15m", "1h", "4h", "1d", "1w"}
