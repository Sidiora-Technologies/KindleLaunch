// Package streams implements the media/livestream HTTP handlers, porting
// routes/streams.ts 1:1: stream lifecycle (create/go-live/end), public reads
// (by id, by pool, all live), the Livepeer webhook callback, and Redis-backed
// viewer heartbeats. Owner-only mutations are EIP-191 gated (invariant i4).
package streams

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	goredis "github.com/redis/go-redis/v9"

	sharedauth "github.com/Sidiora-Technologies/KindleLaunch/shared/auth"
	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/internal/livepeer"
	"github.com/Sidiora-Technologies/KindleLaunch/media/livestream/pkg/types"
)

// Livepeer is the subset of the Livepeer client the handlers depend on (kept as
// an interface for clean wiring; the concrete client is exercised end-to-end via
// httptest in tests — no fakes).
type Livepeer interface {
	CreateStream(ctx context.Context, name string) (*livepeer.CreateResponse, error)
	TerminateStream(ctx context.Context, streamID string) error
	PlaybackURL(playbackID string) string
	RtmpURL(streamKey string) string
}

// Deps are the handler dependencies.
type Deps struct {
	Queries             sqlcdb.Querier
	Redis               *goredis.Client
	Livepeer            Livepeer
	MaxStreamsPerWallet int
	WebhookSecret       string
	Logger              *slog.Logger
	Clock               func() time.Time // optional; defaults to time.Now
}

// Handlers serves the stream routes.
type Handlers struct {
	q             sqlcdb.Querier
	redis         *goredis.Client
	livepeer      Livepeer
	maxStreams    int
	webhookSecret string
	logger        *slog.Logger
	clock         func() time.Time
}

// New constructs Handlers, applying defaults for optional dependencies.
func New(d Deps) *Handlers {
	clock := d.Clock
	if clock == nil {
		clock = time.Now
	}
	maxStreams := d.MaxStreamsPerWallet
	if maxStreams <= 0 {
		maxStreams = 3
	}
	return &Handlers{
		q:             d.Queries,
		redis:         d.Redis,
		livepeer:      d.Livepeer,
		maxStreams:    maxStreams,
		webhookSecret: d.WebhookSecret,
		logger:        d.Logger,
		clock:         clock,
	}
}

// RegisterRoutes mounts the stream endpoints onto r.
func (h *Handlers) RegisterRoutes(r chi.Router) {
	r.Post("/streams", h.create)
	r.Post("/streams/{id}/go-live", h.goLive)
	r.Post("/streams/{id}/end", h.end)
	r.Post("/streams/{id}/heartbeat", h.heartbeat)
	r.Get("/streams/live", h.listLive)
	r.Get("/streams/pool/{poolAddress}", h.listByPool)
	r.Get("/streams/{id}", h.getByID)
	r.Post("/webhooks/livepeer", h.webhook)
}

// ── POST /streams ───────────────────────────────────────────────────────────

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) {
	var body types.CreateStreamRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.PoolAddress == "" || body.Title == "" || body.Wallet == "" || body.Signature == "" || body.Message == "" {
		writeErr(w, http.StatusBadRequest, "Missing required fields")
		return
	}
	if !sharedauth.VerifyWalletSignature(body.Wallet, body.Message, body.Signature) {
		writeErr(w, http.StatusForbidden, "Invalid signature")
		return
	}

	ctx := r.Context()
	creator, err := h.q.GetPoolCreator(ctx, body.PoolAddress)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "Pool not found")
		return
	}
	if err != nil {
		h.fail(w, "get pool creator", err)
		return
	}
	if !strings.EqualFold(creator, body.Wallet) {
		writeErr(w, http.StatusForbidden, "Only pool creator can start a livestream")
		return
	}

	active, err := h.q.CountActiveStreamsByWallet(ctx, body.Wallet)
	if err != nil {
		h.fail(w, "count active streams", err)
		return
	}
	if int(active) >= h.maxStreams {
		writeErr(w, http.StatusTooManyRequests, fmt.Sprintf("Max %d concurrent streams", h.maxStreams))
		return
	}

	now := h.clock()
	poolPrefix := body.PoolAddress
	if len(poolPrefix) > 10 {
		poolPrefix = poolPrefix[:10]
	}
	name := fmt.Sprintf("sidiora-%s-%d", poolPrefix, now.UnixMilli())

	lp, err := h.livepeer.CreateStream(ctx, name)
	if err != nil {
		h.logErr("livepeer create stream", err)
		writeErr(w, http.StatusBadGateway, "Failed to create livestream")
		return
	}

	id := generateID(now)
	rtmpURL := h.livepeer.RtmpURL(lp.StreamKey)
	playbackURL := h.livepeer.PlaybackURL(lp.PlaybackID)
	createdAt := now.Unix()

	if err := h.q.CreateStream(ctx, sqlcdb.CreateStreamParams{
		ID:               id,
		PoolAddress:      body.PoolAddress,
		CreatorWallet:    body.Wallet,
		Title:            body.Title,
		LivepeerStreamID: lp.ID,
		StreamKey:        lp.StreamKey,
		PlaybackID:       lp.PlaybackID,
		RtmpUrl:          rtmpURL,
		PlaybackUrl:      playbackURL,
		CreatedAt:        createdAt,
	}); err != nil {
		h.fail(w, "insert stream", err)
		return
	}

	writeJSON(w, http.StatusOK, types.CreateStreamResponse{
		ID:          id,
		StreamKey:   lp.StreamKey,
		RtmpURL:     rtmpURL,
		PlaybackURL: playbackURL,
		PlaybackID:  lp.PlaybackID,
	})
}

// ── POST /streams/:id/go-live ───────────────────────────────────────────────

func (h *Handlers) goLive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	stream, ok := h.authStreamOwner(w, r, id)
	if !ok {
		return
	}
	now := h.clock().Unix()
	if err := h.q.SetStreamLive(r.Context(), sqlcdb.SetStreamLiveParams{ID: stream.ID, StartedAt: &now}); err != nil {
		h.fail(w, "set stream live", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ── POST /streams/:id/end ───────────────────────────────────────────────────

func (h *Handlers) end(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	stream, ok := h.authStreamOwner(w, r, id)
	if !ok {
		return
	}
	// Best-effort terminate on Livepeer — the stream may already be ended.
	if err := h.livepeer.TerminateStream(r.Context(), stream.LivepeerStreamID); err != nil {
		h.logErr("livepeer terminate stream", err)
	}
	now := h.clock().Unix()
	if err := h.q.EndStream(r.Context(), sqlcdb.EndStreamParams{ID: stream.ID, EndedAt: &now}); err != nil {
		h.fail(w, "end stream", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// authStreamOwner verifies the signed request and that the signer owns the
// stream, returning the loaded row. It writes the error response itself.
func (h *Handlers) authStreamOwner(w http.ResponseWriter, r *http.Request, id string) (sqlcdb.LivestreamStream, bool) {
	var body types.AuthRequest
	if !decodeJSON(w, r, &body) {
		return sqlcdb.LivestreamStream{}, false
	}
	if !sharedauth.VerifyWalletSignature(body.Wallet, body.Message, body.Signature) {
		writeErr(w, http.StatusForbidden, "Invalid signature")
		return sqlcdb.LivestreamStream{}, false
	}
	stream, err := h.q.GetStreamByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "Stream not found")
		return sqlcdb.LivestreamStream{}, false
	}
	if err != nil {
		h.fail(w, "get stream", err)
		return sqlcdb.LivestreamStream{}, false
	}
	if !strings.EqualFold(stream.CreatorWallet, body.Wallet) {
		writeErr(w, http.StatusForbidden, "Not stream owner")
		return sqlcdb.LivestreamStream{}, false
	}
	return stream, true
}

// ── GET /streams/pool/:poolAddress ──────────────────────────────────────────

func (h *Handlers) listByPool(w http.ResponseWriter, r *http.Request) {
	poolAddress := chi.URLParam(r, "poolAddress")
	liveOnly := r.URL.Query().Get("live") == "true"

	rows, err := h.q.ListPoolStreams(r.Context(), sqlcdb.ListPoolStreamsParams{
		PoolAddress: poolAddress,
		LiveOnly:    liveOnly,
	})
	if err != nil {
		h.fail(w, "list pool streams", err)
		return
	}
	out := make([]types.StreamView, 0, len(rows))
	for _, row := range rows {
		out = append(out, poolRowToView(row))
	}
	writeJSON(w, http.StatusOK, types.StreamListResponse{Streams: out})
}

// ── GET /streams/:id ────────────────────────────────────────────────────────

func (h *Handlers) getByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	stream, err := h.q.GetStreamByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "Stream not found")
		return
	}
	if err != nil {
		h.fail(w, "get stream", err)
		return
	}
	writeJSON(w, http.StatusOK, streamToView(stream))
}

// ── GET /streams/live ───────────────────────────────────────────────────────

func (h *Handlers) listLive(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListLiveStreams(r.Context())
	if err != nil {
		h.fail(w, "list live streams", err)
		return
	}
	out := make([]types.LiveStreamView, 0, len(rows))
	for _, row := range rows {
		out = append(out, liveRowToView(row))
	}
	writeJSON(w, http.StatusOK, types.LiveStreamListResponse{Streams: out})
}

// ── POST /webhooks/livepeer ─────────────────────────────────────────────────

func (h *Handlers) webhook(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "Invalid body")
		return
	}

	// Verify the Livepeer signature over the RAW body bytes (what the sender
	// signs) using a constant-time compare (L-1, SECTION 17 security).
	if h.webhookSecret != "" {
		sig := r.Header.Get("livepeer-signature")
		if sig == "" {
			writeErr(w, http.StatusUnauthorized, "Missing Livepeer signature")
			return
		}
		provided := strings.TrimPrefix(sig, "sha256=")
		if !validHMAC(h.webhookSecret, raw, provided) {
			writeErr(w, http.StatusUnauthorized, "Invalid Livepeer signature")
			return
		}
	}

	var body types.WebhookPayload
	if err := json.Unmarshal(raw, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	if body.Stream != nil {
		now := h.clock().Unix()
		switch body.Event {
		case "stream.started":
			if err := h.q.SetStreamLiveByLivepeerID(r.Context(), sqlcdb.SetStreamLiveByLivepeerIDParams{
				LivepeerStreamID: body.Stream.ID, StartedAt: &now,
			}); err != nil {
				h.fail(w, "webhook set live", err)
				return
			}
		case "stream.idle":
			if err := h.q.SetStreamIdleByLivepeerID(r.Context(), sqlcdb.SetStreamIdleByLivepeerIDParams{
				LivepeerStreamID: body.Stream.ID, EndedAt: &now,
			}); err != nil {
				h.fail(w, "webhook set idle", err)
				return
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]bool{"received": true})
}

// ── POST /streams/:id/heartbeat ─────────────────────────────────────────────

func (h *Handlers) heartbeat(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body types.HeartbeatRequest
	if r.Body != nil {
		// Body is optional; ignore EOF (empty body) but reject malformed JSON.
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
			writeErr(w, http.StatusBadRequest, "Invalid JSON body")
			return
		}
	}
	viewerID := body.ViewerID
	if viewerID == "" {
		viewerID = clientIP(r)
	}
	if viewerID == "" {
		writeErr(w, http.StatusBadRequest, "viewerId required")
		return
	}

	status, err := h.q.GetStreamLiveStatus(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "Stream not found")
		return
	}
	if err != nil {
		h.fail(w, "get stream status", err)
		return
	}
	if !status.IsLive {
		writeErr(w, http.StatusBadRequest, "Stream is not live")
		return
	}

	count, err := h.countViewers(r.Context(), id, viewerID)
	if err != nil {
		h.fail(w, "count viewers", err)
		return
	}
	writeJSON(w, http.StatusOK, types.HeartbeatResponse{ViewerCount: count})
}

// ── helpers ─────────────────────────────────────────────────────────────────

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeErr(w, http.StatusBadRequest, "Invalid JSON body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	sharedhttp.WriteJSON(w, status, v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	sharedhttp.WriteJSON(w, status, types.ErrorResponse{Error: msg})
}

// fail logs an internal error and returns a masked 500.
func (h *Handlers) fail(w http.ResponseWriter, op string, err error) {
	h.logErr(op, err)
	writeErr(w, http.StatusInternalServerError, "Internal server error")
}

func (h *Handlers) logErr(op string, err error) {
	if h.logger != nil {
		h.logger.Error("livestream handler error", slog.String("op", op), slog.String("err", err.Error()))
	}
}

func validHMAC(secret string, body []byte, providedHex string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := mac.Sum(nil)
	provided, err := hex.DecodeString(providedHex)
	if err != nil {
		return false
	}
	return hmac.Equal(expected, provided)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func poolRowToView(r sqlcdb.ListPoolStreamsRow) types.StreamView {
	return types.StreamView{
		ID:            r.ID,
		PoolAddress:   r.PoolAddress,
		CreatorWallet: r.CreatorWallet,
		Title:         r.Title,
		PlaybackURL:   r.PlaybackUrl,
		PlaybackID:    r.PlaybackID,
		IsLive:        r.IsLive,
		ViewerCount:   r.ViewerCount,
		StartedAt:     r.StartedAt,
		EndedAt:       r.EndedAt,
		CreatedAt:     r.CreatedAt,
	}
}

func streamToView(r sqlcdb.LivestreamStream) types.StreamView {
	return types.StreamView{
		ID:            r.ID,
		PoolAddress:   r.PoolAddress,
		CreatorWallet: r.CreatorWallet,
		Title:         r.Title,
		PlaybackURL:   r.PlaybackUrl,
		PlaybackID:    r.PlaybackID,
		IsLive:        r.IsLive,
		ViewerCount:   r.ViewerCount,
		StartedAt:     r.StartedAt,
		EndedAt:       r.EndedAt,
		CreatedAt:     r.CreatedAt,
	}
}

func liveRowToView(r sqlcdb.ListLiveStreamsRow) types.LiveStreamView {
	return types.LiveStreamView{
		ID:            r.ID,
		PoolAddress:   r.PoolAddress,
		CreatorWallet: r.CreatorWallet,
		Title:         r.Title,
		PlaybackURL:   r.PlaybackUrl,
		PlaybackID:    r.PlaybackID,
		IsLive:        r.IsLive,
		ViewerCount:   r.ViewerCount,
		StartedAt:     r.StartedAt,
		CreatedAt:     r.CreatedAt,
	}
}
