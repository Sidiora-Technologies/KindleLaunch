// Package serve is the gateway's R2 CDN edge: GET /media/{bucket}/{key...} reads
// an object straight from the appropriate Cloudflare R2 bucket and serves it
// with immutable cache headers, ETag/304 revalidation, and HTTP range support.
// Small objects are cached in Redis (internal/cache) for an origin-free hit;
// large objects stream straight through with bounded memory (no full buffering).
//
// The edge is intentionally schema-free: it serves by raw object key, so it owns
// no database and never resolves token/user addresses — media/metadata and
// media/user return fully-qualified gateway URLs that point here.
package serve

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"
	"github.com/Sidiora-Technologies/KindleLaunch/shared/storage"

	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/cache"
)

// immutableCacheControl is sent for served objects. Media keys are
// content-addressed/versioned by the writing service, so a long immutable TTL is
// safe and offloads the vast majority of reads to the CDN/browser.
const immutableCacheControl = "public, max-age=31536000, immutable"

// Reader is the read surface of shared/storage.Client used by the handler (the
// real client / a real MinIO client in tests satisfies it — no fakes).
type Reader interface {
	Get(ctx context.Context, key string) (*storage.Object, error)
}

// Handler serves media bytes from one or more R2 buckets.
type Handler struct {
	buckets      map[string]Reader
	cache        *cache.Cache
	cacheMaxSize int64
	logger       *slog.Logger
}

// Deps configures New.
type Deps struct {
	// Buckets maps a logical name (e.g. "token", "user", "og") to its R2 reader.
	Buckets map[string]Reader
	// Cache is the Redis hot-cache; nil disables caching (always origin reads).
	Cache *cache.Cache
	// CacheMaxSize is the largest object body eligible for the Redis cache.
	CacheMaxSize int64
	Logger       *slog.Logger
}

// New constructs a Handler.
func New(d Deps) *Handler {
	return &Handler{
		buckets:      d.Buckets,
		cache:        d.Cache,
		cacheMaxSize: d.CacheMaxSize,
		logger:       d.Logger,
	}
}

// RegisterRoutes mounts the media-serving endpoint onto r.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/media/{bucket}/*", h.serve)
}

func (h *Handler) serve(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	reader, ok := h.buckets[bucket]
	if !ok {
		sharedhttp.WriteError(w, http.StatusNotFound, "Not Found", "unknown media bucket")
		return
	}
	key := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	if !validKey(key) {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "invalid object key")
		return
	}

	if h.cache != nil {
		if obj, found, err := h.cache.Get(r.Context(), bucket, key); err == nil && found {
			h.write(w, r, obj.ContentType, obj.ETag, bytes.NewReader(obj.Body), int64(len(obj.Body)))
			return
		} else if err != nil {
			h.logErr("cache get", err)
		}
	}

	obj, err := reader.Get(r.Context(), key)
	if errors.Is(err, storage.ErrNotFound) {
		sharedhttp.WriteError(w, http.StatusNotFound, "Not Found", "object not found")
		return
	}
	if err != nil {
		h.logErr("origin get", err)
		sharedhttp.WriteError(w, http.StatusBadGateway, "Bad Gateway", "origin unavailable")
		return
	}
	defer obj.Body.Close()

	// Small objects: buffer, cache, and serve with full range/304 support.
	if h.cache != nil && obj.Size >= 0 && obj.Size <= h.cacheMaxSize {
		body, err := io.ReadAll(io.LimitReader(obj.Body, h.cacheMaxSize+1))
		if err != nil {
			h.logErr("origin read", err)
			sharedhttp.WriteError(w, http.StatusBadGateway, "Bad Gateway", "origin read failed")
			return
		}
		if int64(len(body)) <= h.cacheMaxSize {
			if err := h.cache.Set(r.Context(), bucket, key, cache.Object{ContentType: obj.ContentType, ETag: obj.ETag, Body: body}); err != nil {
				h.logErr("cache set", err)
			}
			h.write(w, r, obj.ContentType, obj.ETag, bytes.NewReader(body), int64(len(body)))
			return
		}
		// Raced past the cap (size was unknown/under-reported): stream the rest.
		h.stream(w, obj.ContentType, obj.ETag, io.MultiReader(bytes.NewReader(body), obj.Body), -1)
		return
	}

	h.stream(w, obj.ContentType, obj.ETag, obj.Body, obj.Size)
}

// write serves a fully-buffered body via http.ServeContent, which handles
// conditional requests (If-None-Match -> 304) and Range requests for free.
func (h *Handler) write(w http.ResponseWriter, r *http.Request, contentType, etag string, body *bytes.Reader, _ int64) {
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	if etag != "" {
		w.Header().Set("ETag", quoteETag(etag))
	}
	w.Header().Set("Cache-Control", immutableCacheControl)
	w.Header().Set("CDN-Cache-Control", "public, max-age=31536000")
	w.Header().Set("Vary", "Accept-Encoding")
	// Zero modtime disables Last-Modified handling; ServeContent still does
	// ETag/If-None-Match and Range based on the headers set above.
	http.ServeContent(w, r, "", time.Time{}, body)
}

// stream serves a body without buffering (large objects). Range is not offered
// on this path; the immutable cache headers make repeat full reads rare.
func (h *Handler) stream(w http.ResponseWriter, contentType, etag string, body io.Reader, size int64) {
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	if etag != "" {
		w.Header().Set("ETag", quoteETag(etag))
	}
	w.Header().Set("Cache-Control", immutableCacheControl)
	w.Header().Set("CDN-Cache-Control", "public, max-age=31536000")
	w.Header().Set("Vary", "Accept-Encoding")
	if size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, body); err != nil {
		h.logErr("stream", err)
	}
}

// validKey rejects empty keys and any path-traversal attempt.
func validKey(key string) bool {
	if key == "" || len(key) > 1024 {
		return false
	}
	if strings.Contains(key, "..") {
		return false
	}
	for _, seg := range strings.Split(key, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return false
		}
	}
	return true
}

// quoteETag wraps a bare ETag value in the quotes the HTTP spec requires.
func quoteETag(etag string) string {
	if strings.HasPrefix(etag, `"`) || strings.HasPrefix(etag, `W/`) {
		return etag
	}
	return `"` + etag + `"`
}

func (h *Handler) logErr(op string, err error) {
	if h.logger != nil {
		h.logger.Error("media serve error", slog.String("op", op), slog.String("err", err.Error()))
	}
}
