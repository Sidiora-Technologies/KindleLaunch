// media/social — pool chat rooms + comments + DMs (realtime over WS, fronted by
// media/gateway), moderation. Was @media_microservices/chat. cmd/sociald.
// [SECTION 13]
module github.com/Sidiora-Technologies/KindleLaunch/media/social

go 1.25.0

require (
	github.com/Sidiora-Technologies/KindleLaunch/protocol v0.0.0
	github.com/Sidiora-Technologies/KindleLaunch/shared v0.0.0
	github.com/caarlos0/env/v11 v11.4.1
	github.com/go-chi/chi/v5 v5.3.0
	github.com/gorilla/websocket v1.5.3
	github.com/jackc/pgx/v5 v5.10.0
	github.com/pressly/goose/v3 v3.24.3
	github.com/redis/go-redis/v9 v9.20.1
	github.com/testcontainers/testcontainers-go/modules/postgres v0.43.0
	github.com/testcontainers/testcontainers-go/modules/redis v0.43.0
)

replace github.com/Sidiora-Technologies/KindleLaunch/shared => ../../shared

replace github.com/Sidiora-Technologies/KindleLaunch/protocol => ../../protocol
