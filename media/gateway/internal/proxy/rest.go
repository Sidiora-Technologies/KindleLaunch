// Package proxy fronts media/social: a REST reverse proxy and a WebSocket tunnel.
// Both establish the trusted actor identity for the sign-free social service by
// (1) ALWAYS stripping any client-supplied X-Actor-Wallet and X-API-Key headers
// (a client must never be able to forge identity or reach admin routes through
// the public edge) and (2) injecting X-Actor-Wallet from the gateway session
// when the caller is authenticated.
package proxy

import (
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/auth"
)

// actorHeader is the trusted identity header media/social reads.
const actorHeader = "X-Actor-Wallet"

// adminHeader gates social's /admin routes; it must never cross the public edge.
const adminHeader = "X-API-Key"

// REST is a reverse proxy to media/social's HTTP surface.
type REST struct {
	rp     *httputil.ReverseProxy
	prefix string
}

// RESTDeps configures NewREST.
type RESTDeps struct {
	// TargetBaseURL is the internal base URL of media/social (e.g.
	// http://social:3000).
	TargetBaseURL string
	// Prefix is the public mount path stripped before forwarding (e.g.
	// "/social").
	Prefix string
	// Timeout caps the upstream round-trip.
	Timeout time.Duration
	Logger  *slog.Logger
}

// NewREST builds a REST proxy. It returns an error if the target URL is invalid.
func NewREST(d RESTDeps) (*REST, error) {
	target, err := url.Parse(strings.TrimRight(d.TargetBaseURL, "/"))
	if err != nil {
		return nil, err
	}
	prefix := strings.TrimRight(d.Prefix, "/")

	rp := &httputil.ReverseProxy{
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			MaxIdleConns:          256,
			MaxIdleConnsPerHost:   64,
			IdleConnTimeout:       90 * time.Second,
			ResponseHeaderTimeout: d.Timeout,
			ExpectContinueTimeout: time.Second,
		},
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.Out.URL.Path = singleJoin(target.Path, strings.TrimPrefix(pr.In.URL.Path, prefix))
			pr.Out.Host = target.Host
			// Identity is gateway-controlled: drop anything the client sent.
			pr.Out.Header.Del(actorHeader)
			pr.Out.Header.Del(adminHeader)
			if wallet := auth.Actor(pr.In.Context()); wallet != "" {
				pr.Out.Header.Set(actorHeader, wallet)
			}
			pr.SetXForwarded()
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			if d.Logger != nil {
				d.Logger.Error("social proxy upstream error", slog.String("err", err.Error()))
			}
			sharedhttp.WriteError(w, http.StatusBadGateway, "Bad Gateway", "social upstream unavailable")
		},
	}
	return &REST{rp: rp, prefix: prefix}, nil
}

// ServeHTTP proxies the request to media/social.
func (p *REST) ServeHTTP(w http.ResponseWriter, r *http.Request) { p.rp.ServeHTTP(w, r) }

// singleJoin joins two URL path segments with exactly one slash.
func singleJoin(a, b string) string {
	switch {
	case a == "":
		if b == "" {
			return "/"
		}
		return b
	case b == "":
		return a
	}
	as := strings.HasSuffix(a, "/")
	bs := strings.HasPrefix(b, "/")
	switch {
	case as && bs:
		return a + b[1:]
	case !as && !bs:
		return a + "/" + b
	default:
		return a + b
	}
}
