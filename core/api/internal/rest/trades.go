package rest

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/cache"
	"github.com/Sidiora-Technologies/KindleLaunch/core/api/internal/store"
)

// recentTrades serves GET /bff/token/:poolAddress/trades — a one-shot bootstrap
// snapshot of the most-recent swaps for a pool, so the token-page trades list is
// populated before the first live swap arrives over the push stream (Bug 3). It
// is singleflight-cached for a short TTL; live deltas still ride the WS/SSE
// multiplexer, so this is NOT a polling source.
func recentTrades(st *store.Store, c *cache.Cache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pool := chi.URLParam(r, "poolAddress")
		if len(pool) != 42 {
			sharedhttp.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid pool address"})
			return
		}
		key := "bff:trades:" + pool
		body, _, err := c.GetOrFetch(r.Context(), key, ttlBFF, func(ctx context.Context) ([]byte, error) {
			trades, err := st.RecentTrades(ctx, pool, 0) // store applies its default cap
			if err != nil {
				return nil, err
			}
			return json.Marshal(map[string]any{"pool": pool, "trades": trades})
		})
		if err != nil {
			sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "trades snapshot failed")
			return
		}
		cache.ServeJSON(w, r, body, ttlBFF)
	}
}
