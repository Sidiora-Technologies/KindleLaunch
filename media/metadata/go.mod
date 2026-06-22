// media/metadata — token metadata (name/symbol/socials/desc) + image storage
// (logos/banners) on Cloudflare R2 [L9] + virus scan. Decomposes the 26KB TS
// monolith. cmd/metadatad. [SECTION 11]
module github.com/Sidiora-Technologies/KindleLaunch/media/metadata

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
