// Package consumer implements the Redis pub/sub swap consumer that feeds the
// candle builder, porting candles/src/engine/swap-consumer.ts. It subscribes to
// the indexer swap channel and forwards Swap events to the Builder.
package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/Sidiora-Technologies/KindleLaunch/shared/constants"
	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"

	"github.com/Sidiora-Technologies/KindleLaunch/core/trading-charts/internal/engine"
)

// SwapConsumer subscribes to the Redis swap channel and processes swaps through
// the candle builder.
type SwapConsumer struct {
	builder    *engine.Builder
	subscriber *sharedredis.Subscriber
	logger     *slog.Logger
}

// New creates a SwapConsumer.
func New(builder *engine.Builder, redisURL string, logger *slog.Logger) (*SwapConsumer, error) {
	sub, err := sharedredis.NewSubscriber(redisURL)
	if err != nil {
		return nil, fmt.Errorf("consumer: new subscriber: %w", err)
	}
	return &SwapConsumer{
		builder:    builder,
		subscriber: sub,
		logger:     logger,
	}, nil
}

// Start subscribes to the swap channel and processes events until ctx is cancelled.
func (sc *SwapConsumer) Start(ctx context.Context) error {
	errc, err := sc.subscriber.Subscribe(ctx, constants.ChannelSwap, func(ctx context.Context, payload []byte) error {
		var data struct {
			EventName      string                 `json:"eventName"`
			BlockNumber    int64                  `json:"blockNumber"`
			BlockTimestamp int64                  `json:"blockTimestamp"`
			TxHash         string                 `json:"txHash"`
			LogIndex       int                    `json:"logIndex"`
			Args           map[string]interface{} `json:"args"`
		}
		if err := json.Unmarshal(payload, &data); err != nil {
			sc.logger.Error("consumer: unmarshal swap", slog.String("err", err.Error()))
			return nil
		}

		swap := engine.SwapEvent{
			PoolID:      asString(data.Args["poolId"]),
			PoolAddress: asString(data.Args["poolAddress"]),
			Sender:      asString(data.Args["sender"]),
			IsBuy:       asBool(data.Args["isBuy"]),
			AmountIn:    asString(data.Args["amountIn"]),
			AmountOut:   asString(data.Args["amountOut"]),
			Fee:         asString(data.Args["fee"]),
			Price:       asString(data.Args["price"]),
			TxHash:      data.TxHash,
			LogIndex:    data.LogIndex,
		}

		// Resolve the block timestamp. The indexer envelope (identical on the Redis
		// and webhook paths) carries it top-level as blockTimestamp; fall back to
		// args.blockTimestamp / args.timestamp, then blockNumber, for legacy and
		// test message shapes.
		switch {
		case data.BlockTimestamp > 0:
			swap.BlockTimestamp = data.BlockTimestamp
		case asInt64(data.Args["blockTimestamp"]) > 0:
			swap.BlockTimestamp = asInt64(data.Args["blockTimestamp"])
		case asInt64(data.Args["timestamp"]) > 0:
			swap.BlockTimestamp = asInt64(data.Args["timestamp"])
		default:
			swap.BlockTimestamp = data.BlockNumber
		}

		if err := sc.builder.ProcessSwap(ctx, swap); err != nil {
			sc.logger.Error("consumer: process swap", slog.String("err", err.Error()), slog.String("txHash", data.TxHash))
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("consumer: subscribe: %w", err)
	}

	sc.logger.Info("candle swap consumer started")

	go func() {
		for err := range errc {
			sc.logger.Error("consumer: receive error", slog.String("err", err.Error()))
		}
	}()

	return nil
}

// Close releases the subscriber connection.
func (sc *SwapConsumer) Close() error {
	return sc.subscriber.Close()
}

func asString(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return fmt.Sprintf("%v", val)
	case json.Number:
		return val.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

func asBool(v interface{}) bool {
	if v == nil {
		return false
	}
	switch val := v.(type) {
	case bool:
		return val
	case string:
		return val == "true"
	default:
		return false
	}
}

func asInt64(v interface{}) int64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return int64(val)
	case json.Number:
		n, err := val.Int64()
		if err != nil {
			return 0
		}
		return n
	case string:
		var n int64
		if _, err := fmt.Sscanf(val, "%d", &n); err != nil {
			return 0
		}
		return n
	default:
		return 0
	}
}
