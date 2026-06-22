// core/stats-workers — pool statistics, holder tracking, risk ratings via swap/
// market/state consumers + holder-enrichment queue. Was
// @analytics_microservices/stats. cmd/statsd. [SECTION 7]
module github.com/Sidiora-Technologies/KindleLaunch/core/stats-workers

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
