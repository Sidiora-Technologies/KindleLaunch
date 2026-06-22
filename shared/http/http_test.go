package http

import (
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	goredis "github.com/redis/go-redis/v9"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
)

func TestNewRouterHealth(t *testing.T) {
	t.Parallel()
	r := NewRouter(ServerOptions{})
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("/health status = %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"status":"ok"`) {
		t.Errorf("/health body = %s", body)
	}
}

func TestCORSHeader(t *testing.T) {
	t.Parallel()
	r := NewRouter(ServerOptions{CORSOrigins: "https://sidiora.fun"})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://sidiora.fun")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://sidiora.fun" {
		t.Errorf("ACAO = %q", got)
	}
}

func TestResolveOrigins(t *testing.T) {
	t.Parallel()
	if got := resolveOrigins(""); len(got) != 1 || got[0] != "*" {
		t.Errorf("empty -> %v", got)
	}
	if got := resolveOrigins("*"); got[0] != "*" {
		t.Errorf("star -> %v", got)
	}
	if got := resolveOrigins(" a.com , b.com "); len(got) != 2 || got[0] != "a.com" || got[1] != "b.com" {
		t.Errorf("list -> %v", got)
	}
	if got := resolveOrigins(" , "); len(got) != 1 || got[0] != "*" {
		t.Errorf("blank list -> %v", got)
	}
}

func TestReadyHealthy(t *testing.T) {
	t.Parallel()
	r := NewRouter(ServerOptions{Health: HealthDeps{
		DB:    func(context.Context) error { return nil },
		Redis: func(context.Context) error { return nil },
		Custom: map[string]Check{
			"upstream": func(context.Context) error { return nil },
		},
	}})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("ready status = %d, body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"database":"ok"`) {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestReadyDegraded(t *testing.T) {
	t.Parallel()
	r := NewRouter(ServerOptions{Health: HealthDeps{
		DB: func(context.Context) error { return errors.New("down") },
	}})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("ready status = %d, want 503", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"status":"degraded"`) {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestReadyCustomCheckFails(t *testing.T) {
	t.Parallel()
	r := NewRouter(ServerOptions{Health: HealthDeps{
		DB: func(context.Context) error { return nil },
		Custom: map[string]Check{
			"upstream": func(context.Context) error { return errors.New("upstream down") },
		},
	}})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("custom-fail ready = %d, want 503", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"upstream":"failed"`) {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestWriteErrorMasks5xx(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	WriteError(rec, http.StatusInternalServerError, "secret detail", "leaky message")
	if strings.Contains(rec.Body.String(), "leaky") || strings.Contains(rec.Body.String(), "secret detail") {
		t.Errorf("5xx leaked internals: %s", rec.Body.String())
	}
	rec2 := httptest.NewRecorder()
	WriteError(rec2, http.StatusBadRequest, "Bad Request", "field x invalid")
	if !strings.Contains(rec2.Body.String(), "field x invalid") {
		t.Errorf("4xx should keep message: %s", rec2.Body.String())
	}
}

func TestNotFoundAndMethodHandlers(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	NotFoundHandler()(rec, httptest.NewRequest(http.MethodGet, "/nope", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("notfound = %d", rec.Code)
	}
	rec2 := httptest.NewRecorder()
	MethodNotAllowedHandler()(rec2, httptest.NewRequest(http.MethodPost, "/x", nil))
	if rec2.Code != http.StatusMethodNotAllowed {
		t.Errorf("methodnotallowed = %d", rec2.Code)
	}
}

func TestRateLimitInMemory(t *testing.T) {
	t.Parallel()
	mw := RateLimit(RateLimitOptions{Max: 2, Window: time.Minute})
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	codes := make([]int, 0, 3)
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "1.2.3.4:5678"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		codes = append(codes, rec.Code)
		if i == 0 && rec.Header().Get("X-RateLimit-Limit") != "2" {
			t.Errorf("limit header = %q", rec.Header().Get("X-RateLimit-Limit"))
		}
	}
	if codes[0] != 200 || codes[1] != 200 || codes[2] != http.StatusTooManyRequests {
		t.Fatalf("codes = %v, want [200 200 429]", codes)
	}
}

func TestRateLimitRoutePrefixBypass(t *testing.T) {
	t.Parallel()
	mw := RateLimit(RateLimitOptions{Max: 1, Window: time.Minute, RoutePrefix: "/api/"})
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/public", nil)
		req.RemoteAddr = "9.9.9.9:1"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("non-prefixed route should bypass limit, got %d", rec.Code)
		}
	}
}

func TestAPIKeyAuth(t *testing.T) {
	t.Parallel()
	if _, err := APIKeyAuth(APIKeyOptions{}); err == nil {
		t.Fatal("empty key should error")
	}
	mw, err := APIKeyAuth(APIKeyOptions{APIKey: "s3cr3t"})
	if err != nil {
		t.Fatal(err)
	}
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	// health bypass
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("/health bypass = %d", rec.Code)
	}
	// missing
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/admin", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("missing key = %d, want 401", rec.Code)
	}
	// wrong
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-API-Key", "wrong")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("wrong key = %d, want 403", rec.Code)
	}
	// correct
	req = httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-API-Key", "s3cr3t")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("correct key = %d, want 200", rec.Code)
	}
}

func TestScanBufferNotConfigured(t *testing.T) {
	t.Parallel()
	res := ScanBuffer(context.Background(), []byte("data"), ScanOptions{})
	if !res.Clean || res.Reason != "clamav-not-configured" {
		t.Errorf("unconfigured scan = %+v", res)
	}
}

func TestScanBufferUnreachable(t *testing.T) {
	t.Parallel()
	// Port 1 is not listening -> best-effort clean.
	res := ScanBuffer(context.Background(), []byte("data"), ScanOptions{Host: "127.0.0.1", Port: 1, Timeout: 500 * time.Millisecond})
	if !res.Clean {
		t.Errorf("unreachable scan should be best-effort clean: %+v", res)
	}
}

// fakeClamd starts a TCP server speaking enough of the clamd INSTREAM protocol
// to reply with a fixed response, then returns its host and port.
func fakeClamd(t *testing.T, reply string) (string, int) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		// Drain the INSTREAM frames until the zero-length terminator.
		hdr := []byte("zINSTREAM\x00")
		buf := make([]byte, len(hdr))
		_, _ = io.ReadFull(conn, buf)
		for {
			var sz [4]byte
			if _, err := io.ReadFull(conn, sz[:]); err != nil {
				break
			}
			n := binary.BigEndian.Uint32(sz[:])
			if n == 0 {
				break
			}
			chunk := make([]byte, n)
			if _, err := io.ReadFull(conn, chunk); err != nil {
				break
			}
		}
		_, _ = conn.Write([]byte(reply))
	}()
	addr := ln.Addr().(*net.TCPAddr)
	return "127.0.0.1", addr.Port
}

func TestScanBufferClean(t *testing.T) {
	t.Parallel()
	host, port := fakeClamd(t, "stream: OK\x00")
	res := ScanBuffer(context.Background(), []byte("safe data"), ScanOptions{Host: host, Port: port, Timeout: 2 * time.Second})
	if !res.Clean {
		t.Errorf("expected clean, got %+v", res)
	}
}

func TestScanBufferInfected(t *testing.T) {
	t.Parallel()
	host, port := fakeClamd(t, "stream: Win.Test.EICAR_HDB-1 FOUND\x00")
	res := ScanBuffer(context.Background(), []byte("eicar"), ScanOptions{Host: host, Port: port, Timeout: 2 * time.Second})
	if res.Clean {
		t.Errorf("expected infected, got %+v", res)
	}
	if !strings.Contains(res.Reason, "FOUND") {
		t.Errorf("reason = %q", res.Reason)
	}
}

func TestRateLimitRedis(t *testing.T) {
	ctx := context.Background()
	ctr, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("start redis: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })
	url, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatal(err)
	}
	opt, err := goredis.ParseURL(url)
	if err != nil {
		t.Fatal(err)
	}
	rdb := goredis.NewClient(opt)
	defer rdb.Close()

	mw := RateLimit(RateLimitOptions{Max: 2, Window: time.Minute, Redis: rdb})
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	var codes []int
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "5.6.7.8:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		codes = append(codes, rec.Code)
	}
	if codes[0] != 200 || codes[1] != 200 || codes[2] != http.StatusTooManyRequests {
		t.Fatalf("redis-backed codes = %v, want [200 200 429]", codes)
	}
}

func TestClientIP(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "8.8.8.8:443"
	if got := clientIP(req); got != "8.8.8.8" {
		t.Errorf("clientIP = %q", got)
	}
	req.RemoteAddr = "no-port"
	if got := clientIP(req); got != "no-port" {
		t.Errorf("clientIP fallback = %q", got)
	}
}
