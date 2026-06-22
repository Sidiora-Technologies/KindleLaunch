// media/livestream — Livepeer-backed token livestreams (create/manage streams,
// playback ids, pool association). Smallest service; validates the module
// template end-to-end. cmd/livestreamd. [SECTION 14]
module github.com/Sidiora-Technologies/KindleLaunch/media/livestream

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
