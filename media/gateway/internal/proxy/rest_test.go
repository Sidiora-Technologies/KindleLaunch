package proxy

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/auth"
)

// captured records what the fake media/social upstream received.
type captured struct {
	path   string
	actor  string
	apiKey string
}

func newUpstream(t *testing.T, got *captured) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.path = r.URL.Path
		got.actor = r.Header.Get("X-Actor-Wallet")
		got.apiKey = r.Header.Get("X-API-Key")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newProxy(t *testing.T, target string) *REST {
	t.Helper()
	p, err := NewREST(RESTDeps{TargetBaseURL: target, Prefix: "/social", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("NewREST: %v", err)
	}
	return p
}

func TestREST_StripsPrefix_AndInjectsActor(t *testing.T) {
	var got captured
	up := newUpstream(t, &got)
	p := newProxy(t, up.URL)

	req := httptest.NewRequest(http.MethodGet, "/social/pools/0xabc/messages", nil)
	req = req.WithContext(auth.WithActor(req.Context(), "0xdeadbeef"))
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if got.path != "/pools/0xabc/messages" {
		t.Errorf("upstream path = %q, want /pools/0xabc/messages", got.path)
	}
	if got.actor != "0xdeadbeef" {
		t.Errorf("injected actor = %q, want 0xdeadbeef", got.actor)
	}
}

func TestREST_StripsClientSuppliedIdentityHeaders(t *testing.T) {
	var got captured
	up := newUpstream(t, &got)
	p := newProxy(t, up.URL)

	// Client tries to forge identity + reach admin; no session in context.
	req := httptest.NewRequest(http.MethodPost, "/social/pools/0xabc/messages", nil)
	req.Header.Set("X-Actor-Wallet", "0xforged")
	req.Header.Set("X-API-Key", "stolen-admin-key")
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)

	if got.actor != "" {
		t.Errorf("forged actor leaked through: %q", got.actor)
	}
	if got.apiKey != "" {
		t.Errorf("admin api key leaked through: %q", got.apiKey)
	}
}

func TestREST_BadGatewayOnUpstreamDown(t *testing.T) {
	// Point at a closed server.
	up := newUpstream(t, &captured{})
	addr := up.URL
	up.Close()
	p := newProxy(t, addr)

	req := httptest.NewRequest(http.MethodGet, "/social/health", nil)
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}

func TestSingleJoin(t *testing.T) {
	cases := map[[2]string]string{
		{"", ""}:      "/",
		{"", "/x"}:    "/x",
		{"/a", ""}:    "/a",
		{"/a/", "/b"}: "/a/b",
		{"/a", "b"}:   "/a/b",
		{"/a/", "b"}:  "/a/b",
	}
	for in, want := range cases {
		if got := singleJoin(in[0], in[1]); got != want {
			t.Errorf("singleJoin(%q,%q) = %q, want %q", in[0], in[1], got, want)
		}
	}
}
