// media/user — user profiles, avatars (R2 [L9]), watchlists; created-pools via
// cross-schema read of indexer.pools; EIP-191 sig on writes. Was
// @media_microservices/users. cmd/userd. [SECTION 12]
module github.com/Sidiora-Technologies/KindleLaunch/media/user

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
