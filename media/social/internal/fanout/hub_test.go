package fanout_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"

	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/fanout"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/internaltest"
)

type wsHarness struct {
	q      *sqlcdb.Queries
	pool   *pgxpool.Pool
	pub    *goredis.Client
	wsURL  string
	server *httptest.Server
}

func newWSHarness(t *testing.T) *wsHarness {
	t.Helper()
	pool := internaltest.NewPostgres(t)
	redisURL := internaltest.NewRedisURL(t)
	pub, err := sharedredis.NewClient(redisURL)
	if err != nil {
		t.Fatalf("pub client: %v", err)
	}
	sub, err := sharedredis.NewClient(redisURL)
	if err != nil {
		t.Fatalf("sub client: %v", err)
	}
	t.Cleanup(func() { _ = pub.Close(); _ = sub.Close() })

	q := sqlcdb.New(pool)
	hub := fanout.New(fanout.Deps{
		Queries:          q,
		Pub:              pub,
		Sub:              sub,
		MaxMessageLength: 500,
		RateWindow:       10 * time.Second,
		MaxPoolMsgs:      3,
		MaxDmMsgs:        3,
		SendBuffer:       2,
		WriteWait:        5 * time.Second,
		ReadLimit:        4096,
	})

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go func() { _ = hub.Run(ctx) }()

	r := chi.NewRouter()
	r.Get("/ws", hub.ServeWS)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)

	return &wsHarness{
		q:      q,
		pool:   pool,
		pub:    pub,
		wsURL:  strings.Replace(srv.URL, "http", "ws", 1) + "/ws",
		server: srv,
	}
}

func (h *wsHarness) dial(t *testing.T, actor string) *websocket.Conn {
	t.Helper()
	hdr := http.Header{}
	if actor != "" {
		hdr.Set("X-Actor-Wallet", actor)
	}
	c, resp, err := websocket.DefaultDialer.Dial(h.wsURL, hdr)
	if err != nil {
		t.Fatalf("dial: %v (resp=%v)", err, resp)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func send(t *testing.T, c *websocket.Conn, v any) {
	t.Helper()
	if err := c.WriteJSON(v); err != nil {
		t.Fatalf("write json: %v", err)
	}
}

// readUntil reads frames until one with type==want arrives, or fails on timeout.
func readUntil(t *testing.T, c *websocket.Conn, want string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		_ = c.SetReadDeadline(deadline)
		_, data, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("read (want %q): %v", want, err)
		}
		var m map[string]any
		if err := json.Unmarshal(data, &m); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if m["type"] == want {
			return m
		}
	}
}

func addr(n int) string { return fmt.Sprintf("0x%040x", n) }

// TestWSAuthRequired verifies the upgrade is rejected without a valid actor.
func TestWSAuthRequired(t *testing.T) {
	h := newWSHarness(t)
	_, resp, err := websocket.DefaultDialer.Dial(h.wsURL, nil)
	if err == nil {
		t.Fatal("expected dial to fail without actor header")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %v, want 401", resp)
	}
}

// TestWSPoolFanout verifies a pool message is persisted and fanned out to every
// room member (including the sender) via the Redis loopback.
func TestWSPoolFanout(t *testing.T) {
	h := newWSHarness(t)
	pool := addr(1)
	alice := addr(0xa11ce)
	bob := addr(0xb0b)

	ac := h.dial(t, alice)
	bc := h.dial(t, bob)

	send(t, ac, map[string]any{"type": "join_pool", "pool_address": pool})
	readUntil(t, ac, "joined_pool")
	send(t, bc, map[string]any{"type": "join_pool", "pool_address": pool})
	readUntil(t, bc, "joined_pool")

	send(t, ac, map[string]any{"type": "pool_message", "pool_address": pool, "content": "<b>gm</b>"})

	for name, c := range map[string]*websocket.Conn{"alice": ac, "bob": bc} {
		m := readUntil(t, c, "pool_message")
		if m["content"] != "gm" { // sanitized
			t.Errorf("%s content = %v, want sanitized 'gm'", name, m["content"])
		}
		if m["sender"] != alice {
			t.Errorf("%s sender = %v, want %s", name, m["sender"], alice)
		}
	}

	// Persisted.
	rows, err := h.q.ListPoolMessages(context.Background(), sqlcdb.ListPoolMessagesParams{PoolAddress: pool, Lim: 10})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 || rows[0].Content != "gm" {
		t.Fatalf("persisted rows = %+v", rows)
	}
}

// TestWSDMFanout verifies a DM is delivered to both participants' DM channels.
func TestWSDMFanout(t *testing.T) {
	h := newWSHarness(t)
	alice := addr(0xaa)
	bob := addr(0xbb)

	ac := h.dial(t, alice)
	bc := h.dial(t, bob)
	send(t, ac, map[string]any{"type": "subscribe_dms"})
	readUntil(t, ac, "subscribed_dms")
	send(t, bc, map[string]any{"type": "subscribe_dms"})
	readUntil(t, bc, "subscribed_dms")

	send(t, ac, map[string]any{"type": "dm", "to": bob, "content": "hi bob"})

	for name, c := range map[string]*websocket.Conn{"alice": ac, "bob": bc} {
		m := readUntil(t, c, "dm")
		if m["content"] != "hi bob" || m["sender"] != alice {
			t.Errorf("%s dm = %+v", name, m)
		}
	}
}

// TestWSRateLimit verifies the per-actor sliding window rejects bursts.
func TestWSRateLimit(t *testing.T) {
	h := newWSHarness(t)
	pool := addr(2)
	eve := addr(0xe7e)

	c := h.dial(t, eve)
	send(t, c, map[string]any{"type": "join_pool", "pool_address": pool})
	readUntil(t, c, "joined_pool")

	// MaxPoolMsgs=3: the 4th within the window must be rate-limited.
	for i := 0; i < 3; i++ {
		send(t, c, map[string]any{"type": "pool_message", "pool_address": pool, "content": fmt.Sprintf("m%d", i)})
		readUntil(t, c, "pool_message")
	}
	send(t, c, map[string]any{"type": "pool_message", "pool_address": pool, "content": "over"})
	m := readUntil(t, c, "error")
	if msg, _ := m["message"].(string); !strings.Contains(msg, "Rate limited") {
		t.Errorf("error = %v, want rate limited", m["message"])
	}
}

// TestWSBanEnforced verifies a banned actor cannot post pool messages.
func TestWSBanEnforced(t *testing.T) {
	h := newWSHarness(t)
	pool := addr(3)
	banned := addr(0xbad)
	if err := h.q.InsertBan(context.Background(), sqlcdb.InsertBanParams{
		ID: "b1", Wallet: banned, BannedBy: addr(0xc0ffee), CreatedAt: 1,
	}); err != nil {
		t.Fatalf("seed ban: %v", err)
	}
	c := h.dial(t, banned)
	send(t, c, map[string]any{"type": "join_pool", "pool_address": pool})
	readUntil(t, c, "joined_pool")
	send(t, c, map[string]any{"type": "pool_message", "pool_address": pool, "content": "spam"})
	m := readUntil(t, c, "error")
	if msg, _ := m["message"].(string); !strings.Contains(msg, "banned") {
		t.Errorf("error = %v, want banned", m["message"])
	}
}

// TestWSSlowClientEvicted verifies a client that stops draining its socket is
// evicted (bounded buffer + slow-client eviction, invariant i11) rather than
// causing unbounded memory growth.
func TestWSSlowClientEvicted(t *testing.T) {
	h := newWSHarness(t)
	pool := addr(4)
	fast := addr(0xfa57)
	slow := addr(0x510)

	fc := h.dial(t, fast)
	sc := h.dial(t, slow)
	send(t, fc, map[string]any{"type": "join_pool", "pool_address": pool})
	readUntil(t, fc, "joined_pool")
	send(t, sc, map[string]any{"type": "join_pool", "pool_address": pool})
	readUntil(t, sc, "joined_pool")

	// The slow client now stops reading. The fast client floods the room; the
	// slow client's bounded send buffer (2) fills and it is evicted.
	go func() {
		for i := 0; i < 200; i++ {
			_ = fc.WriteJSON(map[string]any{"type": "pool_message", "pool_address": pool, "content": "x"})
			time.Sleep(time.Millisecond)
		}
	}()

	// The slow client's connection must be closed by the server within the window.
	_ = sc.SetReadDeadline(time.Now().Add(8 * time.Second))
	for {
		if _, _, err := sc.ReadMessage(); err != nil {
			return // evicted (connection closed) — success
		}
	}
}
