// Package http is the shared HTTP layer built on chi v5 (D1/L10), porting
// shared/src/http: server bootstrap + CORS, health/readiness, JSON error
// handling, rate limiting, API-key auth, and clamd virus scanning.
//
// Consumers that also import net/http should alias this package, e.g.
// `sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"`.
package http

import (
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// ServerOptions configures NewRouter.
type ServerOptions struct {
	// CORSOrigins is a comma-separated allowlist, or "*"/empty for all (dev).
	// Defaults to the value passed; callers typically pass CORS_ALLOWED_ORIGINS.
	CORSOrigins string
	// Health wires readiness dependency checks.
	Health HealthDeps
}

// NewRouter builds a chi router with the standard middleware stack (request id,
// real IP, panic recovery, CORS) and the health endpoints registered.
func NewRouter(opts ServerOptions) *chi.Mux {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   resolveOrigins(opts.CORSOrigins),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	RegisterHealth(r, opts.Health)
	return r
}

// resolveOrigins mirrors the TS resolveOrigins: empty or "*" allows all,
// otherwise a trimmed comma-split allowlist.
func resolveOrigins(in string) []string {
	raw := strings.TrimSpace(in)
	if raw == "" || raw == "*" {
		return []string{"*"}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return []string{"*"}
	}
	return out
}
