// Package store is the read layer of core/api. Per the gateway design the
// core/* services WRITE to Postgres + Redis; this package only READS from them
// — directly, with no HTTP hop to the owning service. It exposes the snapshot
// reads the REST surface serves: candle history (candles schema), pool stats
// (read-through Redis cache over stats.pool_stats), top holders, Redis-backed
// rankings, and pass-through of the JSON the services cache (platform metrics,
// pressure, reactions).
//
// All money/amount fields are read and returned as text (invariant i1 — never
// float). JSON property names match the TS/Go services byte-for-byte so the
// gateway's snapshot responses are parity-compatible with the per-service ones.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"
)

// statsCacheTTL mirrors the TS / stats-workers `EX 10` read-through cache.
const statsCacheTTL = 10 * time.Second

// Store reads from the shared Postgres pool and Redis.
type Store struct {
	pool *pgxpool.Pool
	rdb  *goredis.Client
}

// New builds a Store from a pgx pool and a Redis client.
func New(pool *pgxpool.Pool, rdb *goredis.Client) *Store {
	return &Store{pool: pool, rdb: rdb}
}

// statsKey is the Redis read-through key for a pool's stats (parity).
func statsKey(pool string) string { return "stats:" + pool }

// ---------------------------------------------------------------------------
// Candle history (candles schema) — ported from core/trading-charts store.
// ---------------------------------------------------------------------------

// CandleRow is a row in candles.candles (text money fields, invariant i1).
type CandleRow struct {
	PoolAddress     string
	Timeframe       string
	CandleStart     int64
	Open            string
	High            string
	Low             string
	Close           string
	VolumeUsdl      string
	VolumeToken     string
	BuyVolumeUsdl   string
	SellVolumeUsdl  string
	TradeCount      int
	UniqueTraders   int
	LargeTradeCount int
	LastTradeTs     int64
	SequenceNum     int64
	McapOpen        string
	McapHigh        string
	McapLow         string
	McapClose       string
}

const candleColumns = `pool_address, timeframe, candle_start, open, high, low, close,
	volume_usdl, volume_token, buy_volume_usdl, sell_volume_usdl,
	trade_count, unique_traders, large_trade_count, last_trade_ts,
	sequence_num, mcap_open, mcap_high, mcap_low, mcap_close`

// CandleHistoryRange returns candles in [from, to] ordered by sequence ascending.
func (s *Store) CandleHistoryRange(ctx context.Context, pool, timeframe string, from, to int64) ([]CandleRow, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+candleColumns+`
		FROM candles.candles
		WHERE pool_address = $1 AND timeframe = $2 AND candle_start >= $3 AND candle_start <= $4
		ORDER BY sequence_num ASC`, pool, timeframe, from, to)
	if err != nil {
		return nil, fmt.Errorf("store: candle history range: %w", err)
	}
	defer rows.Close()
	return scanCandles(rows)
}

// CandleHistoryCountback returns the last `limit` candles up to `to`, ascending
// (parity with the TS countback path).
func (s *Store) CandleHistoryCountback(ctx context.Context, pool, timeframe string, to int64, limit int) ([]CandleRow, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+candleColumns+`
		FROM candles.candles
		WHERE pool_address = $1 AND timeframe = $2 AND candle_start <= $3
		ORDER BY sequence_num DESC
		LIMIT $4`, pool, timeframe, to, limit)
	if err != nil {
		return nil, fmt.Errorf("store: candle history countback: %w", err)
	}
	defer rows.Close()
	out, err := scanCandles(rows)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

func scanCandles(rows pgx.Rows) ([]CandleRow, error) {
	var out []CandleRow
	for rows.Next() {
		var c CandleRow
		if err := rows.Scan(
			&c.PoolAddress, &c.Timeframe, &c.CandleStart, &c.Open, &c.High, &c.Low, &c.Close,
			&c.VolumeUsdl, &c.VolumeToken, &c.BuyVolumeUsdl, &c.SellVolumeUsdl,
			&c.TradeCount, &c.UniqueTraders, &c.LargeTradeCount, &c.LastTradeTs,
			&c.SequenceNum, &c.McapOpen, &c.McapHigh, &c.McapLow, &c.McapClose,
		); err != nil {
			return nil, fmt.Errorf("store: scan candle: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Pool stats (stats schema + Redis read-through) — JSON shape matches the
// stats-workers PoolStatsRow byte-for-byte (parity).
// ---------------------------------------------------------------------------

// PoolStatsRow is a full stats.pool_stats row. JSON tags match the TS drizzle
// property names exactly (camelCase) so the Redis cache payload and the HTTP
// responses are byte-compatible with the stats service.
type PoolStatsRow struct {
	PoolAddress          string  `json:"poolAddress"`
	TokenAddress         string  `json:"tokenAddress"`
	Price                string  `json:"price"`
	PriceChange1m        string  `json:"priceChange1m"`
	PriceChange5m        string  `json:"priceChange5m"`
	PriceChange15m       string  `json:"priceChange15m"`
	PriceChange1h        string  `json:"priceChange1h"`
	PriceChange24h       string  `json:"priceChange24h"`
	PriceChangeDollar1m  string  `json:"priceChangeDollar1m"`
	PriceChangeDollar5m  string  `json:"priceChangeDollar5m"`
	PriceChangeDollar15m string  `json:"priceChangeDollar15m"`
	PriceChangeDollar1h  string  `json:"priceChangeDollar1h"`
	PriceChangeDollar24h string  `json:"priceChangeDollar24h"`
	High24h              string  `json:"high24h"`
	Low24h               string  `json:"low24h"`
	Volume24h            string  `json:"volume24h"`
	Volume1h             string  `json:"volume1h"`
	Volume5m             string  `json:"volume5m"`
	MarketCap            string  `json:"marketCap"`
	BuyCount24h          int     `json:"buyCount24h"`
	SellCount24h         int     `json:"sellCount24h"`
	UniqueTraders24h     int     `json:"uniqueTraders24h"`
	HolderCount          int     `json:"holderCount"`
	Top10Concentration   string  `json:"top10Concentration"`
	CreatorHoldingsPct   string  `json:"creatorHoldingsPct"`
	RiskRating           int     `json:"riskRating"`
	RiskFactors          *string `json:"riskFactors"`
	CreatorAddress       *string `json:"creatorAddress"`
	CreatedAt            int64   `json:"createdAt"`
	UpdatedAt            int64   `json:"updatedAt"`
}

const poolStatsColumns = ` pool_address, token_address, price,
	price_change_1m, price_change_5m, price_change_15m, price_change_1h, price_change_24h,
	price_change_dollar_1m, price_change_dollar_5m, price_change_dollar_15m,
	price_change_dollar_1h, price_change_dollar_24h, high_24h, low_24h,
	volume_24h, volume_1h, volume_5m, market_cap,
	buy_count_24h, sell_count_24h, unique_traders_24h, holder_count,
	top10_concentration, creator_holdings_pct, risk_rating, risk_factors,
	creator_address, created_at, updated_at`

func scanPoolStats(row pgx.Row) (*PoolStatsRow, error) {
	var r PoolStatsRow
	err := row.Scan(
		&r.PoolAddress, &r.TokenAddress, &r.Price,
		&r.PriceChange1m, &r.PriceChange5m, &r.PriceChange15m, &r.PriceChange1h, &r.PriceChange24h,
		&r.PriceChangeDollar1m, &r.PriceChangeDollar5m, &r.PriceChangeDollar15m,
		&r.PriceChangeDollar1h, &r.PriceChangeDollar24h, &r.High24h, &r.Low24h,
		&r.Volume24h, &r.Volume1h, &r.Volume5m, &r.MarketCap,
		&r.BuyCount24h, &r.SellCount24h, &r.UniqueTraders24h, &r.HolderCount,
		&r.Top10Concentration, &r.CreatorHoldingsPct, &r.RiskRating, &r.RiskFactors,
		&r.CreatorAddress, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// PoolStatsJSON returns a pool's stats as JSON, read-through cached in Redis
// (stats:<pool>, EX 10s). found is false when the pool has no stats row.
func (s *Store) PoolStatsJSON(ctx context.Context, pool string) (json.RawMessage, bool, error) {
	if cached, err := s.rdb.Get(ctx, statsKey(pool)).Result(); err == nil && cached != "" {
		return json.RawMessage(cached), true, nil
	}
	row := s.pool.QueryRow(ctx, `SELECT`+poolStatsColumns+`
		FROM stats.pool_stats WHERE pool_address = $1 LIMIT 1`, pool)
	r, err := scanPoolStats(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("store: pool stats: %w", err)
	}
	payload, err := json.Marshal(r)
	if err != nil {
		return nil, false, fmt.Errorf("store: marshal pool stats: %w", err)
	}
	s.rdb.Set(ctx, statsKey(pool), payload, statsCacheTTL)
	return payload, true, nil
}

// StatsBatch returns stats JSON for many pools via a Redis pipeline with a DB
// fallback for misses (parity with the stats-workers /stats/batch route). The
// result is keyed by pool address; absent pools are simply omitted.
func (s *Store) StatsBatch(ctx context.Context, pools []string) (map[string]json.RawMessage, error) {
	result := make(map[string]json.RawMessage, len(pools))
	if len(pools) == 0 {
		return result, nil
	}
	pipe := s.rdb.Pipeline()
	cmds := make([]*goredis.StringCmd, len(pools))
	for i, p := range pools {
		cmds[i] = pipe.Get(ctx, statsKey(p))
	}
	// Pipeline errors (incl. redis.Nil on per-key misses, or Redis being
	// unavailable) are intentionally ignored: each command's result is inspected
	// below and anything not served from cache falls through to the DB query.
	_, _ = pipe.Exec(ctx) //nolint:errcheck // best-effort warm read; see comment above

	var missed []string
	for i, p := range pools {
		if v, err := cmds[i].Result(); err == nil && v != "" {
			result[p] = json.RawMessage(v)
		} else {
			missed = append(missed, p)
		}
	}
	if len(missed) == 0 {
		return result, nil
	}

	rows, err := s.pool.Query(ctx, `SELECT`+poolStatsColumns+`
		FROM stats.pool_stats WHERE pool_address = ANY($1)`, missed)
	if err != nil {
		return nil, fmt.Errorf("store: stats batch: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		r, err := scanPoolStats(rows)
		if err != nil {
			return nil, fmt.Errorf("store: scan stats batch: %w", err)
		}
		payload, err := json.Marshal(r)
		if err != nil {
			return nil, fmt.Errorf("store: marshal stats batch: %w", err)
		}
		result[r.PoolAddress] = payload
		s.rdb.Set(ctx, statsKey(r.PoolAddress), payload, statsCacheTTL)
	}
	return result, rows.Err()
}

// ---------------------------------------------------------------------------
// Top holders (stats.pool_holders) — for the token BFF.
// ---------------------------------------------------------------------------

// Holder is one row of stats.pool_holders (balance is text — invariant i1).
type Holder struct {
	HolderAddress string `json:"holderAddress"`
	Balance       string `json:"balance"`
	PctOfSupply   string `json:"pctOfSupply"`
	LastUpdated   int64  `json:"lastUpdated"`
}

// TopHolders returns the top `limit` holders of a pool by balance (numeric sort).
func (s *Store) TopHolders(ctx context.Context, pool string, limit int) ([]Holder, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := s.pool.Query(ctx, `
		SELECT holder_address, balance, pct_of_supply, last_updated
		FROM stats.pool_holders
		WHERE pool_address = $1
		ORDER BY balance::numeric DESC
		LIMIT $2`, pool, limit)
	if err != nil {
		return nil, fmt.Errorf("store: top holders: %w", err)
	}
	defer rows.Close()

	out := make([]Holder, 0, limit)
	for rows.Next() {
		var h Holder
		if err := rows.Scan(&h.HolderAddress, &h.Balance, &h.PctOfSupply, &h.LastUpdated); err != nil {
			return nil, fmt.Errorf("store: scan holder: %w", err)
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Recent trades (stats.pool_transactions) — one-shot REST bootstrap snapshot
// for the token-page trades list (Bug 3). JSON tags mirror the frontend
// PoolTrade shape byte-for-byte.
// ---------------------------------------------------------------------------

// Trade is one recent swap from stats.pool_transactions (money fields text —
// invariant i1). JSON tags match the frontend PoolTrade type exactly.
type Trade struct {
	ID             string `json:"id"`
	Sender         string `json:"sender"`
	IsBuy          bool   `json:"isBuy"`
	AmountIn       string `json:"amountIn"`
	AmountOut      string `json:"amountOut"`
	Price          string `json:"price"`
	Fee            string `json:"fee"`
	BlockTimestamp int64  `json:"blockTimestamp"`
	TxHash         string `json:"txHash"`
}

// maxRecentTrades caps the bootstrap snapshot size regardless of the requested
// limit; defaultRecentTrades is used when no positive limit is given.
const (
	maxRecentTrades     = 100
	defaultRecentTrades = 50
)

// RecentTrades returns the most-recent `limit` swaps for a pool from
// stats.pool_transactions, newest first (text money fields, invariant i1). This
// is a one-shot bootstrap snapshot only — live deltas ride the push stream.
func (s *Store) RecentTrades(ctx context.Context, pool string, limit int) ([]Trade, error) {
	if limit <= 0 {
		limit = defaultRecentTrades
	}
	if limit > maxRecentTrades {
		limit = maxRecentTrades
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, sender, is_buy, amount_in, amount_out, price, fee, block_timestamp, tx_hash
		FROM stats.pool_transactions
		WHERE pool_address = $1
		ORDER BY block_timestamp DESC
		LIMIT $2`, pool, limit)
	if err != nil {
		return nil, fmt.Errorf("store: recent trades: %w", err)
	}
	defer rows.Close()

	out := make([]Trade, 0, limit)
	for rows.Next() {
		var t Trade
		if err := rows.Scan(
			&t.ID, &t.Sender, &t.IsBuy, &t.AmountIn, &t.AmountOut,
			&t.Price, &t.Fee, &t.BlockTimestamp, &t.TxHash,
		); err != nil {
			return nil, fmt.Errorf("store: scan trade: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Creator activity (stats.pool_stats + stats.pool_transactions + pool_holders)
// — the SAME aggregation stats-workers httpapi/pool_analytics.go creatorActivity
// performs, surfaced through core/api so the token page can seed historical
// buy/sell counts (Bug 5). Money fields stay text bigint; the holdings percent
// is converted bps->percent once here (single-point conversion).
// ---------------------------------------------------------------------------

// CreatorSummary folds the creator's full transaction history into buy/sell
// counts and token totals (bigint, never float). JSON tags match the frontend.
type CreatorSummary struct {
	BuyCount          int    `json:"buyCount"`
	SellCount         int    `json:"sellCount"`
	HasSold           bool   `json:"hasSold"`
	TotalBoughtTokens string `json:"totalBoughtTokens"`
	TotalSoldTokens   string `json:"totalSoldTokens"`
	NetTokenBalance   string `json:"netTokenBalance"`
}

// CreatorActivityResult is the surfaced creator-activity payload. CreatorAddress
// is nil when the pool never recorded one; CurrentHoldingsPct is a human percent
// (bps/100). Transactions reuse the Trade shape (newest first).
type CreatorActivityResult struct {
	PoolAddress        string          `json:"poolAddress"`
	CreatorAddress     *string         `json:"creatorAddress"`
	CreatedAt          int64           `json:"createdAt"`
	CurrentBalance     string          `json:"currentBalance"`
	CurrentHoldingsPct float64         `json:"currentHoldingsPct"`
	Summary            *CreatorSummary `json:"summary"`
	Transactions       []Trade         `json:"transactions"`
}

// CreatorActivity reads the pool's creator address + holdings (stats.pool_stats),
// the creator's full swap history (stats.pool_transactions filtered by sender),
// and the creator's current balance (stats.pool_holders), folding buy/sell
// counts and token totals in bigint — the same aggregation stats-workers
// already computes (5.3.5). found is false when the pool has no stats row.
func (s *Store) CreatorActivity(ctx context.Context, pool string) (*CreatorActivityResult, bool, error) {
	var (
		creatorAddr     *string
		creatorHoldings string
		createdAt       int64
	)
	err := s.pool.QueryRow(ctx, `
		SELECT creator_address, creator_holdings_pct, created_at
		FROM stats.pool_stats WHERE pool_address = $1 LIMIT 1`, pool).
		Scan(&creatorAddr, &creatorHoldings, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("store: creator activity stats: %w", err)
	}

	res := &CreatorActivityResult{
		PoolAddress:        pool,
		CreatorAddress:     creatorAddr,
		CreatedAt:          createdAt,
		CurrentBalance:     "0",
		CurrentHoldingsPct: BpsToPct(creatorHoldings),
		Transactions:       []Trade{},
	}
	if creatorAddr == nil {
		return res, true, nil
	}
	creatorLower := strings.ToLower(*creatorAddr)

	rows, err := s.pool.Query(ctx, `
		SELECT id, sender, is_buy, amount_in, amount_out, price, fee, block_timestamp, tx_hash
		FROM stats.pool_transactions
		WHERE pool_address = $1 AND sender = $2
		ORDER BY block_timestamp DESC`, pool, creatorLower)
	if err != nil {
		return nil, false, fmt.Errorf("store: creator activity txs: %w", err)
	}
	defer rows.Close()

	totalBought := new(big.Int)
	totalSold := new(big.Int)
	buyCount, sellCount := 0, 0
	txs := []Trade{}
	for rows.Next() {
		var t Trade
		if err := rows.Scan(
			&t.ID, &t.Sender, &t.IsBuy, &t.AmountIn, &t.AmountOut,
			&t.Price, &t.Fee, &t.BlockTimestamp, &t.TxHash,
		); err != nil {
			return nil, false, fmt.Errorf("store: scan creator tx: %w", err)
		}
		if t.IsBuy {
			if v, ok := new(big.Int).SetString(t.AmountOut, 10); ok {
				totalBought.Add(totalBought, v)
			}
			buyCount++
		} else {
			if v, ok := new(big.Int).SetString(t.AmountIn, 10); ok {
				totalSold.Add(totalSold, v)
			}
			sellCount++
		}
		txs = append(txs, t)
	}
	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("store: creator tx rows: %w", err)
	}
	res.Transactions = txs

	var balance string
	err = s.pool.QueryRow(ctx, `
		SELECT balance FROM stats.pool_holders
		WHERE pool_address = $1 AND holder_address = $2`, pool, creatorLower).Scan(&balance)
	if err == nil {
		res.CurrentBalance = balance
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, fmt.Errorf("store: creator balance: %w", err)
	}

	net := new(big.Int).Sub(totalBought, totalSold)
	res.Summary = &CreatorSummary{
		BuyCount:          buyCount,
		SellCount:         sellCount,
		HasSold:           sellCount > 0,
		TotalBoughtTokens: totalBought.String(),
		TotalSoldTokens:   totalSold.String(),
		NetTokenBalance:   net.String(),
	}
	return res, true, nil
}

// BpsToPct converts a basis-points string (1 bps = 0.01%) to a human percent
// number, rounded to 2dp. Invalid input yields 0. This is the single-point
// bps->percent conversion for the unit contract (Bug 5): bps at source/transport,
// percent at render — converted in exactly one layer (core/api).
func BpsToPct(bps string) float64 {
	v, err := strconv.ParseFloat(bps, 64)
	if err != nil {
		return 0
	}
	return round2(v / 100)
}

// round2 rounds to two decimal places.
func round2(f float64) float64 {
	return float64(int64(f*100+sign(f)*0.5)) / 100
}

func sign(f float64) float64 {
	if f < 0 {
		return -1
	}
	return 1
}

// ---------------------------------------------------------------------------
// Rankings (Redis ZSETs written by ranking-algo).
// ---------------------------------------------------------------------------

// RankedItem is one entry of a ranked list.
type RankedItem struct {
	PoolAddress string  `json:"poolAddress"`
	Score       float64 `json:"score"`
	Rank        int     `json:"rank"`
}

// Rankings returns a page of a category's ranked list (highest score first)
// plus the total set size, read from the Redis ZSET ranking:<category>.
func (s *Store) Rankings(ctx context.Context, category string, offset, limit int) ([]RankedItem, int64, error) {
	if offset < 0 {
		offset = 0
	}
	if limit < 0 {
		limit = 0
	}
	key := "ranking:" + category
	start := int64(offset)
	end := start + int64(limit) - 1
	entries, err := s.rdb.ZRevRangeWithScores(ctx, key, start, end).Result()
	if err != nil {
		return nil, 0, fmt.Errorf("store: rankings range: %w", err)
	}
	items := make([]RankedItem, 0, len(entries))
	for i, z := range entries {
		addr, ok := z.Member.(string)
		if !ok {
			continue
		}
		items = append(items, RankedItem{PoolAddress: addr, Score: z.Score, Rank: offset + i + 1})
	}
	total, err := s.rdb.ZCard(ctx, key).Result()
	if err != nil {
		return nil, 0, fmt.Errorf("store: rankings count: %w", err)
	}
	return items, total, nil
}

// ---------------------------------------------------------------------------
// Generic cached-JSON passthrough (platform metrics, pressure, reactions).
// ---------------------------------------------------------------------------

// CachedJSON returns the raw JSON value the services cached at key. found is
// false on a cache miss (the gateway then serves an empty/absent payload).
func (s *Store) CachedJSON(ctx context.Context, key string) (json.RawMessage, bool, error) {
	v, err := s.rdb.Get(ctx, key).Result()
	if errors.Is(err, goredis.Nil) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("store: cached get %q: %w", key, err)
	}
	if v == "" {
		return nil, false, nil
	}
	return json.RawMessage(v), true, nil
}

// Ping verifies the DB and Redis are reachable (readiness probe support).
func (s *Store) Ping(ctx context.Context) error {
	if err := s.pool.Ping(ctx); err != nil {
		return err
	}
	return s.rdb.Ping(ctx).Err()
}
