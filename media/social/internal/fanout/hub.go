// Package fanout implements the media/social realtime hub: an authenticated
// WebSocket endpoint plus Redis pub/sub fan-out for pool chat rooms and direct
// messages. It is designed for the 500K-concurrency bar (invariant i11):
//
//   - every connection has a BOUNDED outbound queue; a client that can't keep up
//     is evicted (slow-client eviction) rather than growing memory without bound;
//   - Redis channels are subscribed lazily (refcounted) and unsubscribed when the
//     last local subscriber leaves, so a single subscriber connection multiplexes
//     all rooms;
//   - sends are persisted then published to Redis, and EVERY instance (including
//     the publisher) fans the message out to its local subscribers via the Redis
//     loopback, keeping a single delivery path.
//
// Identity is sign-free: the actor wallet is read from the trusted X-Actor-Wallet
// header that media/gateway injects at upgrade time. No in-band auth frame.
package fanout

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgtype"
	goredis "github.com/redis/go-redis/v9"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/common"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/db/sqlcdb"
)

const (
	poolChannelPrefix = "pool:"
	dmChannelPrefix   = "dm:wallet:"
)

// Deps are the hub dependencies.
type Deps struct {
	Queries sqlcdb.Querier
	// Pub publishes fan-out messages and backs the rate limiter.
	Pub *goredis.Client
	// Sub is a DEDICATED client for the pub/sub subscriber (a subscribed
	// connection cannot issue other commands).
	Sub *goredis.Client

	MaxMessageLength int
	RateWindow       time.Duration
	MaxPoolMsgs      int
	MaxDmMsgs        int

	SendBuffer int
	WriteWait  time.Duration
	ReadLimit  int64

	Logger *slog.Logger
	Clock  func() time.Time
	// CheckOrigin overrides the upgrader origin check (gateway terminates origin
	// policy; defaults to allow-all behind the gateway).
	CheckOrigin func(*http.Request) bool
}

type metrics struct {
	connected atomic.Int64
	evicted   atomic.Int64
}

// Hub is the realtime fan-out hub.
type Hub struct {
	q     sqlcdb.Querier
	pub   *goredis.Client
	sub   *goredis.Client
	ps    *goredis.PubSub
	upg   websocket.Upgrader
	log   *slog.Logger
	clock func() time.Time

	maxMsgLen   int
	rateWindow  time.Duration
	maxPoolMsgs int
	maxDmMsgs   int

	sendBuffer int
	writeWait  time.Duration
	readLimit  int64

	mu           sync.RWMutex
	poolRooms    map[string]map[*conn]struct{}
	walletConns  map[string]map[*conn]struct{}
	poolChanRefs map[string]int
	dmChanRefs   map[string]int

	metrics metrics
}

// New constructs a Hub. The dedicated subscriber PubSub is created eagerly (with
// no channels) so rooms can be subscribed lazily as clients join.
func New(d Deps) *Hub {
	clock := d.Clock
	if clock == nil {
		clock = time.Now
	}
	checkOrigin := d.CheckOrigin
	if checkOrigin == nil {
		checkOrigin = func(*http.Request) bool { return true }
	}
	h := &Hub{
		q:            d.Queries,
		pub:          d.Pub,
		sub:          d.Sub,
		log:          d.Logger,
		clock:        clock,
		maxMsgLen:    orDefault(d.MaxMessageLength, 500),
		rateWindow:   orDefaultDur(d.RateWindow, 10*time.Second),
		maxPoolMsgs:  orDefault(d.MaxPoolMsgs, 5),
		maxDmMsgs:    orDefault(d.MaxDmMsgs, 5),
		sendBuffer:   orDefault(d.SendBuffer, 64),
		writeWait:    orDefaultDur(d.WriteWait, 10*time.Second),
		readLimit:    int64(orDefault(int(d.ReadLimit), 4096)),
		poolRooms:    make(map[string]map[*conn]struct{}),
		walletConns:  make(map[string]map[*conn]struct{}),
		poolChanRefs: make(map[string]int),
		dmChanRefs:   make(map[string]int),
		upg: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     checkOrigin,
		},
	}
	h.ps = d.Sub.Subscribe(context.Background())
	return h
}

func orDefault(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

func orDefaultDur(v, def time.Duration) time.Duration {
	if v <= 0 {
		return def
	}
	return v
}

// Run drives the Redis subscriber loop until ctx is cancelled, then closes the
// subscriber connection.
func (h *Hub) Run(ctx context.Context) error {
	ch := h.ps.Channel()
	for {
		select {
		case <-ctx.Done():
			return h.ps.Close()
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			h.dispatch(msg.Channel, []byte(msg.Payload))
		}
	}
}

// ServeWS is the GET /ws handler: it authenticates via the trusted actor header,
// upgrades the connection, and starts its read/write pumps.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	act := common.NormalizeAddr(r.Header.Get("X-Actor-Wallet"))
	if !common.IsAddr(act) {
		sharedhttp.WriteError(w, http.StatusUnauthorized, "Unauthorized", "missing or invalid X-Actor-Wallet")
		return
	}
	ws, err := h.upg.Upgrade(w, r, nil)
	if err != nil {
		return // upgrader already wrote the error
	}
	c := newConn(h, ws, act)
	h.addConn(c)
	h.metrics.connected.Add(1)
	go c.writePump()
	go c.readPump()
}

// ── connection registry ───────────────────────────────────────────────────────

func (h *Hub) addConn(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.walletConns[c.actor]
	if set == nil {
		set = make(map[*conn]struct{})
		h.walletConns[c.actor] = set
	}
	set[c] = struct{}{}
}

// removeConn detaches a connection from every room and the wallet registry,
// unsubscribing Redis channels that have no remaining local subscribers.
func (h *Hub) removeConn(c *conn) {
	pools := c.joinedPools()
	dmSub := c.isDMSubscribed()

	var toUnsubPool []string
	var toUnsubDM string

	h.mu.Lock()
	for _, p := range pools {
		if room := h.poolRooms[p]; room != nil {
			if _, ok := room[c]; ok {
				delete(room, c)
				h.poolChanRefs[p]--
				if h.poolChanRefs[p] <= 0 {
					delete(h.poolChanRefs, p)
					delete(h.poolRooms, p)
					toUnsubPool = append(toUnsubPool, poolChannelPrefix+p)
				}
			}
		}
	}
	if set := h.walletConns[c.actor]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.walletConns, c.actor)
		}
	}
	if dmSub {
		h.dmChanRefs[c.actor]--
		if h.dmChanRefs[c.actor] <= 0 {
			delete(h.dmChanRefs, c.actor)
			toUnsubDM = dmChannelPrefix + c.actor
		}
	}
	h.mu.Unlock()

	h.metrics.connected.Add(-1)
	for _, ch := range toUnsubPool {
		h.redisUnsubscribe(ch)
	}
	if toUnsubDM != "" {
		h.redisUnsubscribe(toUnsubDM)
	}
}

// joinRoom adds c to a pool room, subscribing the Redis channel on first join.
// Returns false if c was already a member.
func (h *Hub) joinRoom(c *conn, pool string) bool {
	var subscribe bool
	h.mu.Lock()
	room := h.poolRooms[pool]
	if room == nil {
		room = make(map[*conn]struct{})
		h.poolRooms[pool] = room
	}
	if _, ok := room[c]; ok {
		h.mu.Unlock()
		return false
	}
	room[c] = struct{}{}
	h.poolChanRefs[pool]++
	if h.poolChanRefs[pool] == 1 {
		subscribe = true
	}
	h.mu.Unlock()

	c.addPool(pool)
	if subscribe {
		h.redisSubscribe(poolChannelPrefix + pool)
	}
	return true
}

// leaveRoom removes c from a pool room, unsubscribing the Redis channel when the
// last local member leaves.
func (h *Hub) leaveRoom(c *conn, pool string) {
	var unsubscribe bool
	h.mu.Lock()
	if room := h.poolRooms[pool]; room != nil {
		if _, ok := room[c]; ok {
			delete(room, c)
			h.poolChanRefs[pool]--
			if h.poolChanRefs[pool] <= 0 {
				delete(h.poolChanRefs, pool)
				delete(h.poolRooms, pool)
				unsubscribe = true
			}
		}
	}
	h.mu.Unlock()

	c.removePool(pool)
	if unsubscribe {
		h.redisUnsubscribe(poolChannelPrefix + pool)
	}
}

// subscribeDMs marks c as a DM receiver and subscribes the wallet's Redis DM
// channel on first subscription for that wallet.
func (h *Hub) subscribeDMs(c *conn) {
	if c.isDMSubscribed() {
		return
	}
	c.setDMSubscribed()
	var subscribe bool
	h.mu.Lock()
	h.dmChanRefs[c.actor]++
	if h.dmChanRefs[c.actor] == 1 {
		subscribe = true
	}
	h.mu.Unlock()
	if subscribe {
		h.redisSubscribe(dmChannelPrefix + c.actor)
	}
}

func (h *Hub) redisSubscribe(channel string) {
	if err := h.ps.Subscribe(context.Background(), channel); err != nil {
		h.logErr("redis subscribe", err)
	}
}

func (h *Hub) redisUnsubscribe(channel string) {
	if err := h.ps.Unsubscribe(context.Background(), channel); err != nil {
		h.logErr("redis unsubscribe", err)
	}
}

// dispatch routes a Redis message to the correct local subscribers.
func (h *Hub) dispatch(channel string, payload []byte) {
	switch {
	case len(channel) > len(poolChannelPrefix) && channel[:len(poolChannelPrefix)] == poolChannelPrefix:
		pool := channel[len(poolChannelPrefix):]
		h.mu.RLock()
		room := h.poolRooms[pool]
		conns := make([]*conn, 0, len(room))
		for c := range room {
			conns = append(conns, c)
		}
		h.mu.RUnlock()
		for _, c := range conns {
			c.enqueue(payload)
		}
	case len(channel) > len(dmChannelPrefix) && channel[:len(dmChannelPrefix)] == dmChannelPrefix:
		wallet := channel[len(dmChannelPrefix):]
		h.mu.RLock()
		set := h.walletConns[wallet]
		conns := make([]*conn, 0, len(set))
		for c := range set {
			conns = append(conns, c)
		}
		h.mu.RUnlock()
		for _, c := range conns {
			if c.isDMSubscribed() {
				c.enqueue(payload)
			}
		}
	}
}

func (h *Hub) logErr(op string, err error) {
	if h.log != nil {
		h.log.Error("fanout hub error", slog.String("op", op), slog.String("err", err.Error()))
	}
}

// ── rate limiting (per-actor sliding window via Redis) ─────────────────────────

func (h *Hub) allow(ctx context.Context, actor, kind string, max int) bool {
	key := "ratelimit:" + kind + ":" + actor + ":ws"
	n, err := h.pub.Incr(ctx, key).Result()
	if err != nil {
		// Fail open on a transient Redis error rather than muting the user.
		return true
	}
	if n == 1 {
		_ = h.pub.Expire(ctx, key, h.rateWindow).Err()
	}
	return n <= int64(max)
}

// marshal returns the JSON encoding of v, or nil on error (logged).
func (h *Hub) marshal(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		h.logErr("marshal", err)
		return nil
	}
	return b
}

// optInt8 builds a non-null pgtype.Int8.
func optInt8(v int64) pgtype.Int8 { return pgtype.Int8{Int64: v, Valid: true} }

// textOrNull builds a pgtype.Text from an optional string (nil/"" => NULL).
func textOrNull(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{Valid: false}
	}
	t := *s
	if t == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: t, Valid: true}
}
