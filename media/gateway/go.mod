// media/gateway — PUBLIC MEDIA edge: serve+cache media (R2 [L9]) with CDN
// headers, realtime WSS tunnel fronting media/social, and the token-create
// wizard upload endpoint (scan -> bucket -> metadata). Must survive 500K
// concurrent. cmd/mediagatewayd. [SECTION 15, L6]
module github.com/Sidiora-Technologies/KindleLaunch/media/gateway

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
