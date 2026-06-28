package rest

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/cache"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/store"
)

// errPoolNotFound is the sentinel the cached fetch returns so the handler can
// map a missing pool to 404 (singleflight fetchers can only signal via error).
var errPoolNotFound = errors.New("pool not found")

// tokenBFF serves GET /bff/token/:poolAddress — a single round-trip aggregation
// of the data a token-detail page needs, replacing several client fetches
// (parity with the TS /api/bff/token endpoint). It reads stats, top holders,
// pressure and reactions in parallel from Redis/Postgres, tolerating per-source
// misses with null/empty fallbacks, and is singleflight-cached for 5s.
func tokenBFF(st *store.Store, c *cache.Cache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pool := chi.URLParam(r, "poolAddress")
		if len(pool) != 42 {
			sharedhttp.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid pool address"})
			return
		}
		key := "bff:token:" + pool
		body, _, err := c.GetOrFetch(r.Context(), key, ttlBFF, func(ctx context.Context) ([]byte, error) {
			return buildTokenBFF(ctx, st, pool)
		})
		if err != nil {
			sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "token aggregation failed")
			return
		}
		cache.ServeJSON(w, r, body, ttlBFF)
	}
}

// creatorActivity serves GET /bff/token/:poolAddress/creator-activity — the
// pool creator's full historical buy/sell summary + transactions, surfaced from
// core/api's direct store read (the same aggregation stats-workers computes), so
// the token page seeds real counts instead of showing 0/0 (Bug 5). Money fields
// are text bigint; currentHoldingsPct is a human percent (single-point convert).
func creatorActivity(st *store.Store, c *cache.Cache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pool := chi.URLParam(r, "poolAddress")
		if len(pool) != 42 {
			sharedhttp.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid pool address"})
			return
		}
		key := "bff:creator-activity:" + pool
		body, _, err := c.GetOrFetch(r.Context(), key, ttlBFF, func(ctx context.Context) ([]byte, error) {
			res, found, err := st.CreatorActivity(ctx, pool)
			if err != nil {
				return nil, err
			}
			if !found {
				return nil, errPoolNotFound
			}
			return json.Marshal(res)
		})
		if errors.Is(err, errPoolNotFound) {
			sharedhttp.WriteError(w, http.StatusNotFound, "Not Found", "Pool not found")
			return
		}
		if err != nil {
			sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "creator activity failed")
			return
		}
		cache.ServeJSON(w, r, body, ttlBFF)
	}
}

func buildTokenBFF(ctx context.Context, st *store.Store, pool string) ([]byte, error) {
	var (
		statsRaw     json.RawMessage
		holders      []store.Holder
		pressureRaw  json.RawMessage
		reactionsRaw json.RawMessage
		wg           sync.WaitGroup
	)

	wg.Add(4)
	go func() {
		defer wg.Done()
		if raw, found, err := st.PoolStatsJSON(ctx, pool); err == nil && found {
			statsRaw = raw
		}
	}()
	go func() {
		defer wg.Done()
		if h, err := st.TopHolders(ctx, pool, 10); err == nil {
			holders = h
		}
	}()
	go func() {
		defer wg.Done()
		if raw, found, err := st.CachedJSON(ctx, "pressure:"+pool); err == nil && found {
			pressureRaw = raw
		}
	}()
	go func() {
		defer wg.Done()
		if raw, found, err := st.CachedJSON(ctx, "reactions:"+pool); err == nil && found {
			reactionsRaw = raw
		}
	}()
	wg.Wait()

	if holders == nil {
		holders = []store.Holder{}
	}
	reactions := reactionsRaw
	if reactions == nil {
		reactions = json.RawMessage("{}")
	}

	// Single-point bps->percent conversion (Bug 5): each holder keeps its bps
	// `pctOfSupply` string (unchanged, for parity/audit) and gains an explicit
	// human-percent `pctOfSupplyPct` number; the top-level `pct` object exposes
	// the concentration/creator-holdings percents parsed from the stats row.
	// The frontend renders these directly with no further ×100.
	holderViews := make([]map[string]any, 0, len(holders))
	for _, h := range holders {
		holderViews = append(holderViews, map[string]any{
			"holderAddress":  h.HolderAddress,
			"balance":        h.Balance,
			"pctOfSupply":    h.PctOfSupply, // bps string (unchanged)
			"pctOfSupplyPct": store.BpsToPct(h.PctOfSupply),
			"lastUpdated":    h.LastUpdated,
		})
	}

	pct := map[string]any{"top10Concentration": 0.0, "creatorHoldings": 0.0}
	if statsRaw != nil {
		var ps store.PoolStatsRow
		if err := json.Unmarshal(statsRaw, &ps); err == nil {
			pct["top10Concentration"] = store.BpsToPct(ps.Top10Concentration)
			pct["creatorHoldings"] = store.BpsToPct(ps.CreatorHoldingsPct)
		}
	}

	return json.Marshal(map[string]any{
		"pool":      pool,
		"stats":     statsRaw, // nil -> null, raw bps forwarded for /stats parity
		"holders":   holderViews,
		"pct":       pct,
		"pressure":  pressureRaw, // nil -> null
		"reactions": reactions,
	})
}
