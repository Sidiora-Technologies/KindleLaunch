package rest

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/cache"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/store"
)

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

	return json.Marshal(map[string]any{
		"pool":      pool,
		"stats":     statsRaw, // nil -> null
		"holders":   holders,
		"pressure":  pressureRaw, // nil -> null
		"reactions": reactions,
	})
}
