package http

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
)

// APIKeyOptions configures the API-key middleware (parity with TS
// api-key-auth.ts). /health* is always allowed.
type APIKeyOptions struct {
	APIKey      string
	HeaderName  string
	RoutePrefix string
}

// APIKeyAuth returns a middleware that requires a matching API key (compared in
// constant time, SECTION 17). Missing key -> 401, mismatch -> 403.
func APIKeyAuth(opts APIKeyOptions) (func(http.Handler) http.Handler, error) {
	if opts.APIKey == "" {
		return nil, errors.New("http: APIKeyAuth requires APIKey (set ADMIN_API_KEY)")
	}
	header := opts.HeaderName
	if header == "" {
		header = "X-API-Key"
	}
	expected := []byte(opts.APIKey)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/health") {
				next.ServeHTTP(w, r)
				return
			}
			if opts.RoutePrefix != "" && !strings.HasPrefix(r.URL.Path, opts.RoutePrefix) {
				next.ServeHTTP(w, r)
				return
			}
			provided := r.Header.Get(header)
			if provided == "" {
				WriteError(w, http.StatusUnauthorized, "Unauthorized", "missing API key")
				return
			}
			if subtle.ConstantTimeCompare([]byte(provided), expected) != 1 {
				WriteError(w, http.StatusForbidden, "Forbidden", "invalid API key")
				return
			}
			next.ServeHTTP(w, r)
		})
	}, nil
}
