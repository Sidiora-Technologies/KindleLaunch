// core/pnl-tracker — position tracking, realized/unrealized PnL (bigint micro
// units, no float), referrals, shareable OG cards, idempotent reconciler. Was
// @analytics_microservices/pnl. cmd/pnld. [SECTION 8]
module github.com/Sidiora-Technologies/KindleLaunch/core/pnl-tracker

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
