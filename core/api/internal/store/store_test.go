package store_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/internaltest"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/store"
)

func newStore(t *testing.T) (*store.Store, *pgxpool.Pool, *goredis.Client) {
	t.Helper()
	pool := internaltest.NewPostgres(t)
	rdb := internaltest.NewRedis(t)
	return store.New(pool, rdb), pool, rdb
}

func insertCandle(t *testing.T, pool *pgxpool.Pool, addr, tf string, start, seq int64, closePrice string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO candles.candles
		(pool_address, timeframe, candle_start, open, high, low, close, last_trade_ts, sequence_num)
		VALUES ($1,$2,$3,'1000000','2000000','500000',$4,$3,$5)`,
		addr, tf, start, closePrice, seq)
	if err != nil {
		t.Fatalf("insert candle: %v", err)
	}
}

func TestCandleHistoryRange(t *testing.T) {
	st, pool, _ := newStore(t)
	ctx := context.Background()
	insertCandle(t, pool, "0xAAA", "1m", 60, 1, "1100000")
	insertCandle(t, pool, "0xAAA", "1m", 120, 2, "1200000")
	insertCandle(t, pool, "0xAAA", "1m", 180, 3, "1300000")
	insertCandle(t, pool, "0xAAA", "5m", 60, 1, "9999999") // different tf, excluded

	rows, err := st.CandleHistoryRange(ctx, "0xAAA", "1m", 60, 120)
	if err != nil {
		t.Fatalf("CandleHistoryRange: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("range len = %d, want 2", len(rows))
	}
	if rows[0].CandleStart != 60 || rows[1].CandleStart != 120 {
		t.Errorf("range not ascending: %d, %d", rows[0].CandleStart, rows[1].CandleStart)
	}
	if rows[0].Close != "1100000" {
		t.Errorf("close = %q, want 1100000 (text, no float)", rows[0].Close)
	}
}

func TestCandleHistoryCountback(t *testing.T) {
	st, pool, _ := newStore(t)
	ctx := context.Background()
	for i := int64(1); i <= 5; i++ {
		insertCandle(t, pool, "0xAAA", "1m", i*60, i, "100")
	}
	rows, err := st.CandleHistoryCountback(ctx, "0xAAA", "1m", 5*60, 3)
	if err != nil {
		t.Fatalf("CandleHistoryCountback: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("countback len = %d, want 3", len(rows))
	}
	// Last 3 candles, returned ascending: seq 3,4,5 -> starts 180,240,300.
	if rows[0].CandleStart != 180 || rows[2].CandleStart != 300 {
		t.Errorf("countback order wrong: %d..%d", rows[0].CandleStart, rows[2].CandleStart)
	}
}

func insertPoolStats(t *testing.T, pool *pgxpool.Pool, addr, token, price, mcap string, holders int) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO stats.pool_stats (pool_address, token_address, price, market_cap, holder_count, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,100,200)`, addr, token, price, mcap, holders)
	if err != nil {
		t.Fatalf("insert pool_stats: %v", err)
	}
}

func TestPoolStatsJSON_DBThenCache(t *testing.T) {
	st, pool, rdb := newStore(t)
	ctx := context.Background()
	insertPoolStats(t, pool, "0xAAA", "0xTOKEN", "1000", "50000", 7)

	raw, found, err := st.PoolStatsJSON(ctx, "0xAAA")
	if err != nil || !found {
		t.Fatalf("PoolStatsJSON: found=%v err=%v", found, err)
	}
	var row store.PoolStatsRow
	if err := json.Unmarshal(raw, &row); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if row.Price != "1000" || row.MarketCap != "50000" || row.HolderCount != 7 {
		t.Errorf("row = %+v", row)
	}
	// Read-through must have populated the Redis cache.
	if cached, err := rdb.Get(ctx, "stats:0xAAA").Result(); err != nil || cached == "" {
		t.Errorf("expected stats:0xAAA cached, err=%v", err)
	}
}

func TestPoolStatsJSON_ServesFromCache(t *testing.T) {
	st, _, rdb := newStore(t)
	ctx := context.Background()
	// No DB row; a warm cache entry must be served verbatim.
	if err := rdb.Set(ctx, "stats:0xCACHED", `{"poolAddress":"0xCACHED","price":"42"}`, 0).Err(); err != nil {
		t.Fatalf("seed cache: %v", err)
	}
	raw, found, err := st.PoolStatsJSON(ctx, "0xCACHED")
	if err != nil || !found {
		t.Fatalf("found=%v err=%v", found, err)
	}
	var row store.PoolStatsRow
	_ = json.Unmarshal(raw, &row)
	if row.Price != "42" {
		t.Errorf("cache value not served, price=%q", row.Price)
	}
}

func TestPoolStatsJSON_NotFound(t *testing.T) {
	st, _, _ := newStore(t)
	_, found, err := st.PoolStatsJSON(context.Background(), "0xMISSING")
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if found {
		t.Error("missing pool should report found=false")
	}
}

func TestStatsBatch_CacheAndDBFallback(t *testing.T) {
	st, pool, rdb := newStore(t)
	ctx := context.Background()
	// 0xA cached, 0xB only in DB, 0xC absent everywhere.
	_ = rdb.Set(ctx, "stats:0xA", `{"poolAddress":"0xA","price":"1"}`, 0).Err()
	insertPoolStats(t, pool, "0xB", "0xTOKENB", "2", "0", 0)

	res, err := st.StatsBatch(ctx, []string{"0xA", "0xB", "0xC"})
	if err != nil {
		t.Fatalf("StatsBatch: %v", err)
	}
	if _, ok := res["0xA"]; !ok {
		t.Error("0xA (cached) missing")
	}
	if _, ok := res["0xB"]; !ok {
		t.Error("0xB (db) missing")
	}
	if _, ok := res["0xC"]; ok {
		t.Error("0xC should be absent")
	}
}

func TestTopHolders_NumericOrder(t *testing.T) {
	st, pool, _ := newStore(t)
	ctx := context.Background()
	for _, h := range []struct {
		addr, bal string
	}{
		{"0xh1", "100"},
		{"0xh2", "2000"}, // numerically largest; lexically "2000" < "9" so this checks numeric sort
		{"0xh3", "9"},
	} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO stats.pool_holders (pool_address, holder_address, balance, pct_of_supply, last_updated)
			VALUES ('0xPOOL',$1,$2,'0',1)`, h.addr, h.bal); err != nil {
			t.Fatalf("insert holder: %v", err)
		}
	}
	holders, err := st.TopHolders(ctx, "0xPOOL", 10)
	if err != nil {
		t.Fatalf("TopHolders: %v", err)
	}
	if len(holders) != 3 || holders[0].HolderAddress != "0xh2" {
		t.Fatalf("expected 0xh2 first (balance 2000), got %+v", holders)
	}
}

func TestRankings_FromRedisZSet(t *testing.T) {
	st, _, rdb := newStore(t)
	ctx := context.Background()
	key := "ranking:trending"
	if err := rdb.ZAdd(ctx, key,
		goredis.Z{Score: 10, Member: "0xLow"},
		goredis.Z{Score: 30, Member: "0xHigh"},
		goredis.Z{Score: 20, Member: "0xMid"},
	).Err(); err != nil {
		t.Fatalf("zadd: %v", err)
	}
	items, total, err := st.Rankings(ctx, "trending", 0, 10)
	if err != nil {
		t.Fatalf("Rankings: %v", err)
	}
	if total != 3 {
		t.Errorf("total = %d, want 3", total)
	}
	if len(items) != 3 || items[0].PoolAddress != "0xHigh" || items[0].Rank != 1 {
		t.Fatalf("ranking order wrong: %+v", items)
	}
	if items[2].PoolAddress != "0xLow" || items[2].Rank != 3 {
		t.Errorf("last item = %+v", items[2])
	}
}

func TestCachedJSON_HitAndMiss(t *testing.T) {
	st, _, rdb := newStore(t)
	ctx := context.Background()
	_ = rdb.Set(ctx, "platform:metrics", `{"totalVolume":"123"}`, 0).Err()

	raw, found, err := st.CachedJSON(ctx, "platform:metrics")
	if err != nil || !found {
		t.Fatalf("hit: found=%v err=%v", found, err)
	}
	if string(raw) != `{"totalVolume":"123"}` {
		t.Errorf("value = %s", raw)
	}

	_, found, err = st.CachedJSON(ctx, "platform:nope")
	if err != nil {
		t.Fatalf("miss err = %v", err)
	}
	if found {
		t.Error("missing key should report found=false")
	}
}

func TestPing(t *testing.T) {
	st, _, _ := newStore(t)
	if err := st.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}
