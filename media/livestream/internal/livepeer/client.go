// Package livepeer is a thin REST client for the Livepeer Studio API, porting
// src/livepeer/client.ts. Every call is context-bound with a deadline (SECTION
// 17 context rule); response bodies are always closed (bodyclose).
package livepeer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// Stream is the Livepeer stream object (GET /stream/:id).
type Stream struct {
	ID         string `json:"id"`
	StreamKey  string `json:"streamKey"`
	PlaybackID string `json:"playbackId"`
	Name       string `json:"name"`
	IsActive   bool   `json:"isActive"`
	CreatedAt  int64  `json:"createdAt"`
}

// CreateResponse is the subset of POST /stream we consume.
type CreateResponse struct {
	ID         string `json:"id"`
	StreamKey  string `json:"streamKey"`
	PlaybackID string `json:"playbackId"`
	Name       string `json:"name"`
}

// Client talks to the Livepeer Studio REST API.
type Client struct {
	apiKey  string
	baseURL string
	http    *http.Client
	logger  *slog.Logger
}

// Option customises the Client (used by tests to inject an http.Client).
type Option func(*Client)

// WithHTTPClient overrides the default http.Client.
func WithHTTPClient(h *http.Client) Option {
	return func(c *Client) { c.http = h }
}

// New builds a Livepeer client. baseURL is e.g. https://livepeer.studio/api.
func New(apiKey, baseURL string, logger *slog.Logger, opts ...Option) *Client {
	c := &Client{
		apiKey:  apiKey,
		baseURL: baseURL,
		http:    &http.Client{Timeout: 10 * time.Second},
		logger:  logger,
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// streamProfile is one transcoding rendition sent with CreateStream.
type streamProfile struct {
	Name    string `json:"name"`
	Bitrate int    `json:"bitrate"`
	FPS     int    `json:"fps"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
}

// defaultProfiles mirrors the 720p/480p/360p ladder from client.ts.
var defaultProfiles = []streamProfile{
	{Name: "720p", Bitrate: 2000000, FPS: 30, Width: 1280, Height: 720},
	{Name: "480p", Bitrate: 1000000, FPS: 30, Width: 854, Height: 480},
	{Name: "360p", Bitrate: 500000, FPS: 30, Width: 640, Height: 360},
}

// CreateStream provisions a new Livepeer stream with the standard profile ladder.
func (c *Client) CreateStream(ctx context.Context, name string) (*CreateResponse, error) {
	payload := map[string]any{"name": name, "profiles": defaultProfiles}
	var out CreateResponse
	if err := c.do(ctx, http.MethodPost, "/stream", payload, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetStream fetches a stream by id.
func (c *Client) GetStream(ctx context.Context, streamID string) (*Stream, error) {
	var out Stream
	if err := c.do(ctx, http.MethodGet, "/stream/"+streamID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteStream removes a stream.
func (c *Client) DeleteStream(ctx context.Context, streamID string) error {
	return c.do(ctx, http.MethodDelete, "/stream/"+streamID, nil, nil)
}

// TerminateStream forcibly ends an in-progress stream.
func (c *Client) TerminateStream(ctx context.Context, streamID string) error {
	return c.do(ctx, http.MethodDelete, "/stream/"+streamID+"/terminate", nil, nil)
}

// PlaybackURL returns the HLS playback URL for a playback id.
func (c *Client) PlaybackURL(playbackID string) string {
	return "https://livepeercdn.studio/hls/" + playbackID + "/index.m3u8"
}

// RtmpURL returns the RTMP ingest URL for a stream key.
func (c *Client) RtmpURL(streamKey string) string {
	return "rtmp://rtmp.livepeer.studio/live/" + streamKey
}

// do performs an authenticated JSON request, decoding into out when non-nil.
func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("livepeer: encode %s %s: %w", method, path, err)
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("livepeer: build %s %s: %w", method, path, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("livepeer: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		if c.logger != nil {
			c.logger.Error("livepeer API error",
				slog.Int("status", resp.StatusCode),
				slog.String("path", path),
				slog.String("body", string(errBody)))
		}
		return fmt.Errorf("livepeer: %s %s returned %d: %s", method, path, resp.StatusCode, errBody)
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("livepeer: decode %s %s: %w", method, path, err)
	}
	return nil
}
