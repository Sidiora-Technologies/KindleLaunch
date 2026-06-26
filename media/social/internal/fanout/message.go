package fanout

import (
	"context"
	"encoding/json"

	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/common"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/social/pkg/types"
)

// handleMessage parses and dispatches a single client frame. All identity comes
// from c.actor (set at upgrade from the trusted header); there is no auth frame.
func (h *Hub) handleMessage(c *conn, raw []byte) {
	var msg types.IncomingWS
	if err := json.Unmarshal(raw, &msg); err != nil {
		h.sendAck(c, types.WSAck{Type: "error", Message: "Invalid JSON"})
		return
	}

	switch msg.Type {
	case types.WSJoinPool:
		h.onJoinPool(c, msg)
	case types.WSLeavePool:
		h.onLeavePool(c, msg)
	case types.WSPoolMessage:
		h.onPoolMessage(c, msg)
	case types.WSDM:
		h.onDM(c, msg)
	case types.WSSubscribeDMs:
		h.subscribeDMs(c)
		h.sendAck(c, types.WSAck{Type: "subscribed_dms"})
	default:
		h.sendAck(c, types.WSAck{Type: "error", Message: "Unknown message type: " + msg.Type})
	}
}

func (h *Hub) onJoinPool(c *conn, msg types.IncomingWS) {
	pool := common.NormalizeAddr(msg.PoolAddress)
	if !common.IsAddr(pool) {
		h.sendAck(c, types.WSAck{Type: "error", Message: "invalid pool address"})
		return
	}
	h.joinRoom(c, pool)
	h.sendAck(c, types.WSAck{Type: "joined_pool", PoolAddress: pool})
}

func (h *Hub) onLeavePool(c *conn, msg types.IncomingWS) {
	pool := common.NormalizeAddr(msg.PoolAddress)
	if !common.IsAddr(pool) {
		h.sendAck(c, types.WSAck{Type: "error", Message: "invalid pool address"})
		return
	}
	h.leaveRoom(c, pool)
	h.sendAck(c, types.WSAck{Type: "left_pool", PoolAddress: pool})
}

func (h *Hub) onPoolMessage(c *conn, msg types.IncomingWS) {
	ctx := context.Background()
	pool := common.NormalizeAddr(msg.PoolAddress)
	if !common.IsAddr(pool) {
		h.sendAck(c, types.WSAck{Type: "error", Message: "invalid pool address"})
		return
	}
	content := common.Sanitize(msg.Content)
	if content == "" || len(content) > h.maxMsgLen {
		h.sendAck(c, types.WSAck{Type: "error", Message: "Message must be 1-" + itoa(h.maxMsgLen) + " chars"})
		return
	}
	if !h.allow(ctx, c.actor, "pool", h.maxPoolMsgs) {
		h.sendAck(c, types.WSAck{Type: "error", Message: "Rate limited"})
		return
	}
	if h.isBanned(ctx, c.actor, pool) {
		h.sendAck(c, types.WSAck{Type: "error", Message: "You are banned from this room"})
		return
	}

	now := h.clock()
	id := common.GenerateID(now)
	if err := h.q.InsertPoolMessage(ctx, sqlcdb.InsertPoolMessageParams{
		ID:          id,
		PoolAddress: pool,
		Sender:      c.actor,
		Content:     content,
		ReplyToID:   textOrNull(msg.ReplyToID),
		CreatedAt:   now.Unix(),
	}); err != nil {
		h.logErr("insert pool message", err)
		h.sendAck(c, types.WSAck{Type: "error", Message: "Failed to send"})
		return
	}

	out := h.marshal(types.OutgoingPoolMessage{
		Type:        types.WSPoolMessage,
		ID:          id,
		PoolAddress: pool,
		Sender:      c.actor,
		Content:     content,
		ReplyToID:   msg.ReplyToID,
		CreatedAt:   now.Unix(),
	})
	if out == nil {
		return
	}
	if err := h.pub.Publish(ctx, poolChannelPrefix+pool, out).Err(); err != nil {
		h.logErr("publish pool message", err)
	}
}

func (h *Hub) onDM(c *conn, msg types.IncomingWS) {
	ctx := context.Background()
	to := common.NormalizeAddr(msg.To)
	if !common.IsAddr(to) {
		h.sendAck(c, types.WSAck{Type: "error", Message: "invalid recipient"})
		return
	}
	if to == c.actor {
		h.sendAck(c, types.WSAck{Type: "error", Message: "Cannot DM yourself"})
		return
	}
	content := common.Sanitize(msg.Content)
	if content == "" || len(content) > h.maxMsgLen {
		h.sendAck(c, types.WSAck{Type: "error", Message: "Message must be 1-" + itoa(h.maxMsgLen) + " chars"})
		return
	}
	if !h.allow(ctx, c.actor, "dm", h.maxDmMsgs) {
		h.sendAck(c, types.WSAck{Type: "error", Message: "Rate limited"})
		return
	}

	now := h.clock()
	convID := common.CanonicalConversationID(c.actor, to)
	walletA, walletB := common.SortedPair(c.actor, to)
	if err := h.q.UpsertDmConversation(ctx, sqlcdb.UpsertDmConversationParams{
		ID:            convID,
		WalletA:       walletA,
		WalletB:       walletB,
		LastMessageAt: optInt8(now.Unix()),
	}); err != nil {
		h.logErr("upsert dm conversation", err)
		h.sendAck(c, types.WSAck{Type: "error", Message: "Failed to send"})
		return
	}
	msgID := common.GenerateID(now)
	if err := h.q.InsertDmMessage(ctx, sqlcdb.InsertDmMessageParams{
		ID:             msgID,
		ConversationID: convID,
		Sender:         c.actor,
		Content:        content,
		CreatedAt:      now.Unix(),
	}); err != nil {
		h.logErr("insert dm message", err)
		h.sendAck(c, types.WSAck{Type: "error", Message: "Failed to send"})
		return
	}

	out := h.marshal(types.OutgoingDM{
		Type:           types.WSDM,
		ID:             msgID,
		ConversationID: convID,
		Sender:         c.actor,
		Content:        content,
		CreatedAt:      now.Unix(),
	})
	if out == nil {
		return
	}
	// Publish to both participants' DM channels (sender sees their own echo).
	if err := h.pub.Publish(ctx, dmChannelPrefix+c.actor, out).Err(); err != nil {
		h.logErr("publish dm self", err)
	}
	if err := h.pub.Publish(ctx, dmChannelPrefix+to, out).Err(); err != nil {
		h.logErr("publish dm peer", err)
	}
}

// isBanned reports whether wallet has an active ban (global or for pool). Fails
// open on a DB error (logged) so a transient outage doesn't mute everyone.
func (h *Hub) isBanned(ctx context.Context, wallet, pool string) bool {
	var poolArg *string
	if pool != "" {
		p := pool
		poolArg = &p
	}
	bans, err := h.q.ActiveBans(ctx, sqlcdb.ActiveBansParams{
		Wallet:      wallet,
		Now:         optInt8(h.clock().Unix()),
		PoolAddress: poolArg,
	})
	if err != nil {
		h.logErr("active bans", err)
		return false
	}
	return len(bans) > 0
}

// sendAck enqueues a control/ack frame to a single connection.
func (h *Hub) sendAck(c *conn, ack types.WSAck) {
	if b := h.marshal(ack); b != nil {
		c.enqueue(b)
	}
}

func itoa(v int) string {
	// small, allocation-free for the tiny values used here
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
