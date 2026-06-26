package social

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/pkg/types"
)

// report lets an authenticated user (actor) report a message for moderation.
func (h *Handlers) report(w http.ResponseWriter, r *http.Request) {
	act, ok := actor(r)
	if !ok {
		sharedhttp.WriteError(w, http.StatusUnauthorized, "Unauthorized", "missing or invalid "+actorHeader)
		return
	}
	var req types.ReportRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, bodyLimit)).Decode(&req); err != nil {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.MessageID) == "" || strings.TrimSpace(req.Reason) == "" {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "message_id and reason are required")
		return
	}
	id := generateID(h.clock())
	if err := h.q.InsertReport(r.Context(), sqlcdb.InsertReportParams{
		ID:         id,
		MessageID:  strings.TrimSpace(req.MessageID),
		ReportedBy: act,
		Reason:     strings.TrimSpace(req.Reason),
		CreatedAt:  h.clock().Unix(),
	}); err != nil {
		h.fail(w, "insert report", err)
		return
	}
	sharedhttp.WriteJSON(w, http.StatusOK, types.CreatedResponse{Success: true, ID: id})
}

// ── Admin (CHAT_ADMIN_API_KEY-gated) ──────────────────────────────────────────

func (h *Handlers) adminDeleteMessage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "messageId")
	if err := h.q.SoftDeletePoolMessage(r.Context(), id); err != nil {
		h.fail(w, "admin delete message", err)
		return
	}
	sharedhttp.WriteJSON(w, http.StatusOK, types.OKResponse{OK: true})
}

func (h *Handlers) adminCreateBan(w http.ResponseWriter, r *http.Request) {
	var req types.BanRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, bodyLimit)).Decode(&req); err != nil {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "invalid JSON body")
		return
	}
	wallet := normalizeAddr(req.Wallet)
	bannedBy := normalizeAddr(req.BannedBy)
	if !addrRe.MatchString(wallet) || !addrRe.MatchString(bannedBy) {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "wallet and banned_by must be valid addresses")
		return
	}
	pool := strToTextPtr(req.PoolAddress)
	now := h.clock().Unix()
	var expires *int64
	if req.DurationSeconds != nil && *req.DurationSeconds > 0 {
		e := now + *req.DurationSeconds
		expires = &e
	}
	id := generateID(h.clock())
	params := sqlcdb.InsertBanParams{
		ID:          id,
		Wallet:      wallet,
		PoolAddress: pool,
		Reason:      textValuePtr(req.Reason),
		BannedBy:    bannedBy,
		CreatedAt:   now,
	}
	if expires != nil {
		params.ExpiresAt = int8Value(*expires)
	}
	if err := h.q.InsertBan(r.Context(), params); err != nil {
		h.fail(w, "insert ban", err)
		return
	}
	sharedhttp.WriteJSON(w, http.StatusOK, types.BanResponse{
		OK: true,
		Ban: types.Ban{
			ID:          id,
			Wallet:      wallet,
			PoolAddress: pool,
			Reason:      req.Reason,
			BannedBy:    bannedBy,
			ExpiresAt:   expires,
			CreatedAt:   now,
		},
	})
}

func (h *Handlers) adminDeleteBan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "banId")
	if err := h.q.DeleteBan(r.Context(), id); err != nil {
		h.fail(w, "delete ban", err)
		return
	}
	sharedhttp.WriteJSON(w, http.StatusOK, types.OKResponse{OK: true})
}

func (h *Handlers) adminListBans(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListBans(r.Context())
	if err != nil {
		h.fail(w, "list bans", err)
		return
	}
	out := make([]types.Ban, 0, len(rows))
	for _, b := range rows {
		out = append(out, types.Ban{
			ID:          b.ID,
			Wallet:      b.Wallet,
			PoolAddress: b.PoolAddress,
			Reason:      reasonPtr(b.Reason),
			BannedBy:    b.BannedBy,
			ExpiresAt:   int8Ptr(b.ExpiresAt),
			CreatedAt:   b.CreatedAt,
		})
	}
	sharedhttp.WriteJSON(w, http.StatusOK, types.BansResponse{Bans: out})
}

func (h *Handlers) adminListReports(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}
	rows, err := h.q.ListReportsByStatus(r.Context(), status)
	if err != nil {
		h.fail(w, "list reports", err)
		return
	}
	out := make([]types.Report, 0, len(rows))
	for _, rep := range rows {
		out = append(out, types.Report{
			ID:         rep.ID,
			MessageID:  rep.MessageID,
			ReportedBy: rep.ReportedBy,
			Reason:     rep.Reason,
			Status:     rep.Status,
			CreatedAt:  rep.CreatedAt,
		})
	}
	sharedhttp.WriteJSON(w, http.StatusOK, types.ReportsResponse{Reports: out})
}

func (h *Handlers) adminResolveReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "reportId")
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, bodyLimit)).Decode(&body); err != nil {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "invalid JSON body")
		return
	}
	if body.Status != "resolved" && body.Status != "dismissed" {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", `status must be "resolved" or "dismissed"`)
		return
	}
	if err := h.q.UpdateReportStatus(r.Context(), sqlcdb.UpdateReportStatusParams{ID: id, Status: body.Status}); err != nil {
		h.fail(w, "update report", err)
		return
	}
	sharedhttp.WriteJSON(w, http.StatusOK, types.OKResponse{OK: true})
}
