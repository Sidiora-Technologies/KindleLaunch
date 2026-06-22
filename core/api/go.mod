// core/api — PUBLIC DATA gateway / BFF: the only public ingress for the data
// plane. WSS/SSE multiplexer + rate-limited public REST; fans out to core/*
// services. Must survive 500K concurrent. cmd/apid. [SECTION 10, L6]
module github.com/Sidiora-Technologies/KindleLaunch/core/api

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
