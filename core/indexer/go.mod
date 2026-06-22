// core/indexer — chain ingest spine: reads EVM logs at ~133ms cadence, decodes
// launchpad events, writes DB, fans out (HMAC webhooks + Redis pub/sub) to
// downstream consumers; live + backfill modes. cmd/indexerd. [SECTION 5]
module github.com/Sidiora-Technologies/KindleLaunch/core/indexer

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
