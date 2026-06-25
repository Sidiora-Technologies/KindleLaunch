package rest_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/cache"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/internaltest"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/rest"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/store"
)

const poolAddr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 42 chars

func newServer(t *testing.T) (*httptest.Server, *pgxpool.Pool, *goredis.Client) {
	t.Helper()
	pool := internaltest.NewPostgres(t)
	rdb := internaltest.NewRedis(t)
	st := store.New(pool, rdb)
	r := chi.NewRouter()
	rest.Register(r, st, cache.New(256))
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, pool, rdb
}

func getJSON(t *testing.T, url string) (int, map[string]any, http.Header) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	b, _ := io.ReadAll(resp.Body)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	return resp.StatusCode, m, resp.Header
}

func TestUDF_Config(t *testing.T) {
	srv, _, _ := newServer(t)
	code, m, _ := getJSON(t, srv.URL+"/udf/config")
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	if m["supports_search"] != true {
		t.Errorf("config missing supports_search: %v", m)
	}
}

func TestUDF_History(t *testing.T) {
	srv, pool, _ := newServer(t)
	ctx := context.Background()
	for i := int64(1); i <= 3; i++ {
		_, err := pool.Exec(ctx, `
			INSERT INTO candles.candles
			(pool_address, timeframe, candle_start, open, high, low, close, last_trade_ts, sequence_num)
			VALUES ($1,'1m',$2,'1000000','2000000','500000','1500000',$2,$3)`, poolAddr, i*60, i)
		if err != nil {
			t.Fatalf("insert candle: %v", err)
		}
	}
	code, m, _ := getJSON(t, srv.URL+"/udf/history?symbol="+poolAddr+"&resolution=1&from=0&to=1000")
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	if m["s"] != "ok" {
		t.Fatalf("history s = %v, want ok", m["s"])
	}
	if ts, ok := m["t"].([]any); !ok || len(ts) != 3 {
		t.Fatalf("history t = %v, want 3 entries", m["t"])
	}
}

func TestUDF_History_NoData(t *testing.T) {
	srv, _, _ := newServer(t)
	_, m, _ := getJSON(t, srv.URL+"/udf/history?symbol="+poolAddr+"&resolution=1&from=0&to=1000")
	if m["s"] != "no_data" {
		t.Fatalf("empty history s = %v, want no_data", m["s"])
	}
}

func insertStats(t *testing.T, pool *pgxpool.Pool, addr, price string, holders int) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO stats.pool_stats (pool_address, token_address, price, market_cap, holder_count, created_at, updated_at)
		VALUES ($1,'0xtoken',$2,'50000',$3,100,200)`, addr, price, holders)
	if err != nil {
		t.Fatalf("insert stats: %v", err)
	}
}

func TestStats_ByPool_AndConditional304(t *testing.T) {
	srv, pool, _ := newServer(t)
	insertStats(t, pool, poolAddr, "1234", 9)

	code, m, hdr := getJSON(t, srv.URL+"/stats/"+poolAddr)
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	if m["price"] != "1234" || m["holderCount"].(float64) != 9 {
		t.Errorf("stats body = %v", m)
	}
	etag := hdr.Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag")
	}

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/stats/"+poolAddr, nil)
	req.Header.Set("If-None-Match", etag)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("conditional GET: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotModified {
		t.Fatalf("conditional status = %d, want 304", resp.StatusCode)
	}
}

func TestStats_NotFound(t *testing.T) {
	srv, _, _ := newServer(t)
	code, _, _ := getJSON(t, srv.URL+"/stats/0xmissing")
	if code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", code)
	}
}

func TestStats_Batch(t *testing.T) {
	srv, pool, _ := newServer(t)
	insertStats(t, pool, poolAddr, "1", 1)
	code, m, _ := getJSON(t, srv.URL+"/stats/batch?pools="+poolAddr+",0xmissing")
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	if _, ok := m[poolAddr]; !ok {
		t.Errorf("batch missing %s: %v", poolAddr, m)
	}
	if _, ok := m["0xmissing"]; ok {
		t.Error("batch should omit missing pool")
	}
}

func TestRankings_ByCategory(t *testing.T) {
	srv, pool, rdb := newServer(t)
	insertStats(t, pool, poolAddr, "5", 3)
	if err := rdb.ZAdd(context.Background(), "ranking:trending",
		goredis.Z{Score: 100, Member: poolAddr}).Err(); err != nil {
		t.Fatalf("zadd: %v", err)
	}
	code, m, _ := getJSON(t, srv.URL+"/rankings/trending")
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	items, ok := m["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("rankings items = %v", m["items"])
	}
	first := items[0].(map[string]any)
	if first["poolAddress"] != poolAddr || first["rank"].(float64) != 1 {
		t.Errorf("ranking item = %v", first)
	}
	if _, ok := first["stats"]; !ok {
		t.Error("ranking item should be enriched with stats")
	}
}

func TestRankings_InvalidCategory(t *testing.T) {
	srv, _, _ := newServer(t)
	code, _, _ := getJSON(t, srv.URL+"/rankings/bogus")
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}

func TestPlatformMetrics_HitAndEmpty(t *testing.T) {
	srv, _, rdb := newServer(t)

	// Missing -> empty object.
	code, m, _ := getJSON(t, srv.URL+"/platform/metrics")
	if code != 200 || len(m) != 0 {
		t.Fatalf("empty metrics: code=%d body=%v", code, m)
	}

	_ = rdb.Set(context.Background(), "platform:metrics", `{"totalVolume":"999"}`, 0).Err()
	code, m, _ = getJSON(t, srv.URL+"/platform/metrics")
	if code != 200 || m["totalVolume"] != "999" {
		t.Fatalf("metrics = %v", m)
	}
}

func TestTokenBFF_Aggregates(t *testing.T) {
	srv, pool, rdb := newServer(t)
	ctx := context.Background()
	insertStats(t, pool, poolAddr, "7", 2)
	_, _ = pool.Exec(ctx, `
		INSERT INTO stats.pool_holders (pool_address, holder_address, balance, pct_of_supply, last_updated)
		VALUES ($1,'0xh','1000','50',1)`, poolAddr)
	_ = rdb.Set(ctx, "pressure:"+poolAddr, `{"buy":"1"}`, 0).Err()
	_ = rdb.Set(ctx, "reactions:"+poolAddr, `{"fire":3}`, 0).Err()

	code, m, _ := getJSON(t, srv.URL+"/bff/token/"+poolAddr)
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	if m["pool"] != poolAddr {
		t.Errorf("pool = %v", m["pool"])
	}
	if m["stats"] == nil {
		t.Error("bff stats should be present")
	}
	holders, ok := m["holders"].([]any)
	if !ok || len(holders) != 1 {
		t.Errorf("bff holders = %v", m["holders"])
	}
	if m["pressure"] == nil {
		t.Error("bff pressure should be present")
	}
}

func TestTokenBFF_InvalidPool(t *testing.T) {
	srv, _, _ := newServer(t)
	code, _, _ := getJSON(t, srv.URL+"/bff/token/0xshort")
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}

func TestTokenBFF_EmptyFallbacks(t *testing.T) {
	srv, _, _ := newServer(t)
	// No data at all: stats null, holders [], reactions {}.
	code, m, _ := getJSON(t, srv.URL+"/bff/token/"+poolAddr)
	if code != 200 {
		t.Fatalf("status = %d", code)
	}
	if m["stats"] != nil {
		t.Errorf("stats should be null, got %v", m["stats"])
	}
	if h, ok := m["holders"].([]any); !ok || len(h) != 0 {
		t.Errorf("holders should be empty array, got %v", m["holders"])
	}
	reactions, ok := m["reactions"].(map[string]any)
	if !ok || len(reactions) != 0 {
		t.Errorf("reactions should be empty object, got %v", m["reactions"])
	}
}
