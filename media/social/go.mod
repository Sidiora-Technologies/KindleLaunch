// media/social — pool chat rooms + comments + DMs (realtime over WS, fronted by
// media/gateway), moderation. Was @media_microservices/chat. cmd/sociald.
// [SECTION 13]
module github.com/Sidiora-Technologies/KindleLaunch/media/social

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
