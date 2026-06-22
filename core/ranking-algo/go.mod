// core/ranking-algo — scheduled pool ranking compute (trending, breakout,
// top-volume, movers, unusual, new-pools); reads stats/indexer schemas, caches
// ranked lists in Redis. cmd/rankingd. [SECTION 9]
module github.com/Sidiora-Technologies/KindleLaunch/core/ranking-algo

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
