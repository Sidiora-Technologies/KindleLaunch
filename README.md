# KindleLaunch

Production-grade **Go** backend for **Sidiora.fun** — a token launchpad + real-time
trading platform on the Paxeer Network (EVM chain id 125, ~133ms blocks). This is
the strangler-pattern rewrite of the TypeScript monorepo at `/sidiora`, engineered
to carry **500K+ users on day one**.

Master plan and the single source of truth:
[`knowledge/kindlelaunch.frozen.kvx`](knowledge/kindlelaunch.frozen.kvx).

## Architecture

Two domain groups, each holding **independent Go modules** (own `go.mod`), tied
together for local dev by `go.work` and sharing code via local `replace`.

```
shared/        runtime lib (config, db, redis, queue, chain, auth, http, log, util)
protocol/      contract ABIs + abigen bindings + event registry + address book
core/          DATA plane
  indexer/         chain ingest spine (live + backfill; webhook + pubsub fan-out)
  trading-charts/  OHLCV engine + TradingView UDF
  stats-workers/   pool stats, holders, ratings
  pnl-tracker/     positions, PnL, referrals, OG cards, reconciler
  ranking-algo/    scheduled ranking compute
  api/             PUBLIC data gateway: WSS/SSE + rate-limited REST
media/         MEDIA plane
  metadata/        token metadata + image storage (R2)
  user/            profiles, avatars, watchlists
  social/          chat + comments (realtime)
  livestream/      Livepeer streams
  gateway/         PUBLIC media edge: serve+cache + chat/comment WSS + wizard upload
```

Module root: `github.com/Sidiora-Technologies/KindleLaunch` (L8).

## Locked stack decisions

| | Choice |
|---|---|
| HTTP (D1) | chi v5 over net/http |
| DB (D2) | pgx/v5 (pgxpool) + sqlc + goose |
| Queues (D3) | hibiken/asynq (Redis) |
| Cutover (D4) | strangler per-service (same PG/Redis as TS) |
| Shared (D7) | single top-level `shared/` module |
| Gateways (D8) | `core/api` (data) + `media/gateway` (media) |
| Storage (L9) | Cloudflare R2 (S3-compatible) for all buckets |
| Deploy (D6) | **deferred** — `deploy/` is registry-agnostic |

## Engineering bars (HARD, CI-enforced)

- Every package ships table-driven unit tests; coverage gate **≥85% repo / ≥90%**
  for `shared`, `protocol`, `core/indexer`, `core/pnl-tracker`, `core/trading-charts`.
- Tests exercise **real** code paths (Postgres/Redis via testcontainers) — no fakes.
- All money/price/PnL math in `math/big.Int` / `uint256` — **never** float.
- `golangci-lint` zero warnings + `go test -race`; no merge while CI red.

## Develop

Requires Go 1.23+.

```bash
make build      # build every module
make test       # unit tests
make race       # race detector
make lint       # golangci-lint (zero warnings)
make cover-check # coverage gate
make ci         # everything CI runs
make help       # list targets
```
