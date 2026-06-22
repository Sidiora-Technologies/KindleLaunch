package http

import (
	"context"
	"net/http"
	"runtime"
	"time"

	"github.com/go-chi/chi/v5"
)

// Check is a readiness probe returning nil when the dependency is healthy.
type Check func(ctx context.Context) error

// HealthDeps wires the readiness checks (parity with TS HealthDependencies).
// Decoupled from concrete pgx/redis types so http stays dependency-light.
type HealthDeps struct {
	DB     Check
	Redis  Check
	Custom map[string]Check
}

// RegisterHealth registers /health, /health/live (liveness) and /health/ready
// (deep readiness). Ready returns 503 when any dependency check fails (i6).
func RegisterHealth(r chi.Router, deps HealthDeps) {
	r.Get("/health", liveHandler)
	r.Get("/health/live", liveHandler)
	r.Get("/health/ready", readyHandler(deps))
}

func liveHandler(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func readyHandler(deps HealthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		checks := map[string]string{}
		healthy := true
		run := func(name string, c Check) {
			if c == nil {
				return
			}
			if err := c(ctx); err != nil {
				checks[name] = "failed"
				healthy = false
			} else {
				checks[name] = "ok"
			}
		}
		run("database", deps.DB)
		run("redis", deps.Redis)
		for name, c := range deps.Custom {
			run(name, c)
		}

		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)
		checks["memory_alloc_mb"] = formatMB(mem.Alloc)

		status := "ok"
		code := http.StatusOK
		if !healthy {
			status = "degraded"
			code = http.StatusServiceUnavailable
		}
		WriteJSON(w, code, map[string]any{
			"status":    status,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"checks":    checks,
		})
	}
}

func formatMB(b uint64) string {
	const mb = 1024 * 1024
	v := b / mb
	return itoa(v) + "MB"
}

func itoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}
