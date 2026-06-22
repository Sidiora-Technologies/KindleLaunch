// core/trading-charts — OHLCV candle builder from swap events; TradingView UDF
// data + candle stream (candles:update). Was @analytics_microservices/candles.
// cmd/chartsd. [SECTION 6]
module github.com/Sidiora-Technologies/KindleLaunch/core/trading-charts

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
