package rest

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/cache"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/store"
)

// validCategories is the ranking-category allowlist (parity with ranking-algo).
var validCategories = map[string]struct{}{
	"trending": {}, "breakout": {}, "new": {}, "top_volume": {}, "unusual": {}, "movers": {},
}

var allCategories = []string{"trending", "breakout", "new", "top_volume", "unusual", "movers"}

// statsSubsetKeys are the cached-stats fields echoed into each enriched ranking
// item (parity with the ranking-algo enrichment projection).
var statsSubsetKeys = []string{
	"price",
	"priceChange1m", "priceChange5m", "priceChange15m", "priceChange1h", "priceChange24h",
	"priceChangeDollar1m", "priceChangeDollar5m", "priceChangeDollar15m",
	"priceChangeDollar1h", "priceChangeDollar24h",
	"volume24h", "volume1h", "volume5m", "marketCap", "holderCount",
}

// statsByPool serves GET /stats/:poolAddress from the read-through cache/DB.
func statsByPool(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pool := chi.URLParam(r, "poolAddress")
		raw, found, err := st.PoolStatsJSON(r.Context(), pool)
		if err != nil {
			sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "stats lookup failed")
			return
		}
		if !found {
			sharedhttp.WriteError(w, http.StatusNotFound, "Not Found", "Pool not found")
			return
		}
		cache.ServeJSON(w, r, raw, ttlStats)
	}
}

// statsBatch serves GET /stats/batch?pools=0xA,0xB as a map keyed by pool.
func statsBatch(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pools := splitNonEmpty(r.URL.Query().Get("pools"))
		res, err := st.StatsBatch(r.Context(), pools)
		if err != nil {
			sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "stats batch failed")
			return
		}
		sharedhttp.WriteJSON(w, http.StatusOK, res)
	}
}

// rankingsByCategory serves GET /rankings/:category, paginated + stats-enriched,
// singleflight-cached for 30s.
func rankingsByCategory(st *store.Store, c *cache.Cache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		category := chi.URLParam(r, "category")
		if _, ok := validCategories[category]; !ok {
			sharedhttp.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"error": "Invalid category",
				"valid": allCategories,
			})
			return
		}
		limit := clampNonNeg(parseIntDefault(r.URL.Query().Get("limit"), 50))
		offset := clampNonNeg(parseIntDefault(r.URL.Query().Get("offset"), 0))

		key := "rankings:" + category + ":" + strconv.Itoa(offset) + ":" + strconv.Itoa(limit)
		body, _, err := c.GetOrFetch(r.Context(), key, ttlRankings, func(ctx context.Context) ([]byte, error) {
			return buildRankings(ctx, st, category, offset, limit)
		})
		if err != nil {
			sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "ranking query failed")
			return
		}
		cache.ServeJSON(w, r, body, ttlRankings)
	}
}

// buildRankings reads the ZSET page and enriches each item with a cached-stats
// subset (parity with ranking-algo's rankings route).
func buildRankings(ctx context.Context, st *store.Store, category string, offset, limit int) ([]byte, error) {
	ranked, total, err := st.Rankings(ctx, category, offset, limit)
	if err != nil {
		return nil, err
	}

	pools := make([]string, 0, len(ranked))
	for _, it := range ranked {
		pools = append(pools, it.PoolAddress)
	}
	statsByAddr, err := st.StatsBatch(ctx, pools)
	if err != nil {
		// Enrichment is best-effort: a stats read failure must not drop the
		// ranked list (parity with the TS pipeline tolerating misses).
		statsByAddr = nil
	}

	items := make([]map[string]any, 0, len(ranked))
	for _, it := range ranked {
		item := map[string]any{
			"poolAddress": it.PoolAddress,
			"score":       it.Score,
			"rank":        it.Rank,
		}
		if raw, ok := statsByAddr[it.PoolAddress]; ok {
			item["stats"] = statsSubset(raw)
		}
		items = append(items, item)
	}

	return json.Marshal(map[string]any{
		"category": category,
		"items":    items,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// statsSubset extracts the projection fields from a full cached-stats JSON.
func statsSubset(raw json.RawMessage) map[string]any {
	var full map[string]any
	if err := json.Unmarshal(raw, &full); err != nil {
		return nil
	}
	subset := make(map[string]any, len(statsSubsetKeys))
	for _, k := range statsSubsetKeys {
		if v, ok := full[k]; ok {
			subset[k] = v
		}
	}
	return subset
}

// platformMetrics serves GET /platform/metrics from the Redis cache the stats
// service precomputes (empty object when not yet computed).
func platformMetrics(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, found, err := st.CachedJSON(r.Context(), "platform:metrics")
		if err != nil {
			sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "platform metrics failed")
			return
		}
		if !found {
			raw = json.RawMessage("{}")
		}
		cache.ServeJSON(w, r, raw, ttlPlatform)
	}
}

func splitNonEmpty(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func clampNonNeg(n int) int {
	if n < 0 {
		return 0
	}
	return n
}
