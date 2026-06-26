// Package metadata implements the media/metadata HTTP handlers, porting the TS
// index.ts monolith into discrete routes: single + batch reads (Redis-cached),
// the EIP-191-gated multipart upsert (metadata JSON + logo/banner -> virus scan
// -> R2 bucket), and public byte-serving of logos/banners straight from R2.
//
// Storage is BUCKET-PRIMARY (R2): uploads stream to the bucket and reads are
// served back from it with immutable CDN cache headers.
package metadata

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	goredis "github.com/redis/go-redis/v9"

	sharedauth "github.com/Sidiora-Technologies/KindleLaunch/shared/auth"
	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"
	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"
	"github.com/Sidiora-Technologies/KindleLaunch/shared/storage"

	"github.com/Sidiora-Technologies/KindleLaunch/media/metadata/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/metadata/internal/image"
	"github.com/Sidiora-Technologies/KindleLaunch/media/metadata/pkg/types"
)

const (
	// totalSupply is the fixed launchpad supply surfaced in responses (parity
	// with the TS hardcoded value).
	totalSupply = "1000000000"
	// defaultDecimals matches the prior TS hardcoded decimals.
	defaultDecimals = 6
	// maxBatch caps the addresses accepted per /metadata/batch call.
	maxBatch = 100
	// jsonCacheTTL is the Redis TTL for cached public metadata responses.
	jsonCacheTTL = 60 * time.Second
	// multipartMaxMemory bounds in-memory multipart buffering before spilling.
	multipartMaxMemory = 32 << 20

	cacheKeyPrefix = "metadata:json:"
)

// ObjectStore is the subset of shared/storage.Client the handlers use. The
// concrete client (real R2 / MinIO in tests) satisfies it — no fakes.
type ObjectStore interface {
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	Get(ctx context.Context, key string) (*storage.Object, error)
}

// Scanner scans an uploaded buffer for malware.
type Scanner func(ctx context.Context, data []byte) sharedhttp.ScanResult

// Deps are the handler dependencies.
type Deps struct {
	Queries     sqlcdb.Querier
	Redis       *goredis.Client
	Store       ObjectStore
	PublicURL   string
	MaxLogoSize int64
	MaxBanner   int64
	Logger      *slog.Logger

	// Scan defaults to shared/http.ScanBuffer (clamd via $CLAMAV_HOST).
	Scan Scanner
	// Clock defaults to time.Now.
	Clock func() time.Time
	// PoolLookupAttempts retries the indexer.pools read to tolerate the
	// create-wizard race (indexer may not have seen the new pool yet). Defaults
	// to 5. Sleep is invoked between attempts (defaults to time.Sleep).
	PoolLookupAttempts int
	PoolLookupDelay    time.Duration
	Sleep              func(time.Duration)
}

// Handlers serves the metadata routes.
type Handlers struct {
	q           sqlcdb.Querier
	redis       *goredis.Client
	store       ObjectStore
	publicURL   string
	maxLogo     int64
	maxBanner   int64
	logger      *slog.Logger
	scan        Scanner
	clock       func() time.Time
	poolTries   int
	poolDelay   time.Duration
	sleep       func(time.Duration)
}

// New constructs Handlers, applying defaults for optional dependencies.
func New(d Deps) *Handlers {
	scan := d.Scan
	if scan == nil {
		scan = func(ctx context.Context, data []byte) sharedhttp.ScanResult {
			return sharedhttp.ScanBuffer(ctx, data, sharedhttp.ScanOptions{})
		}
	}
	clock := d.Clock
	if clock == nil {
		clock = time.Now
	}
	tries := d.PoolLookupAttempts
	if tries <= 0 {
		tries = 5
	}
	delay := d.PoolLookupDelay
	if delay <= 0 {
		delay = 3 * time.Second
	}
	sleep := d.Sleep
	if sleep == nil {
		sleep = time.Sleep
	}
	maxLogo := d.MaxLogoSize
	if maxLogo <= 0 {
		maxLogo = 2 << 20
	}
	maxBanner := d.MaxBanner
	if maxBanner <= 0 {
		maxBanner = 5 << 20
	}
	return &Handlers{
		q:         d.Queries,
		redis:     d.Redis,
		store:     d.Store,
		publicURL: strings.TrimRight(d.PublicURL, "/"),
		maxLogo:   maxLogo,
		maxBanner: maxBanner,
		logger:    d.Logger,
		scan:      scan,
		clock:     clock,
		poolTries: tries,
		poolDelay: delay,
		sleep:     sleep,
	}
}

// RegisterRoutes mounts the metadata endpoints onto r. Static segments
// (/metadata/batch) take priority over the {tokenAddress} param in chi.
func (h *Handlers) RegisterRoutes(r chi.Router) {
	r.Get("/metadata/batch", h.batch)
	r.Get("/metadata/{tokenAddress}", h.single)
	r.Post("/metadata/{tokenAddress}", h.upload)
	r.Get("/logo/{file}", h.serveImage(image.TypeLogo))
	r.Get("/banner/{file}", h.serveImage(image.TypeBanner))
}

// ── GET /metadata/{tokenAddress}  (also serves the ".json" alias) ────────────

func (h *Handlers) single(w http.ResponseWriter, r *http.Request) {
	addr := normalizeAddr(strings.TrimSuffix(chi.URLParam(r, "tokenAddress"), ".json"))
	ctx := r.Context()

	cacheKey := cacheKeyPrefix + addr
	if cached, found, err := sharedredis.CacheGet[types.PublicMetadata](ctx, h.redis, cacheKey); err == nil && found {
		w.Header().Set("Cache-Control", "public, max-age=60")
		sharedhttp.WriteJSON(w, http.StatusOK, cached)
		return
	}

	out, err := h.buildOne(ctx, addr, baseURL(h.publicURL, r))
	if err != nil {
		h.fail(w, "build metadata", err)
		return
	}
	if err := sharedredis.CacheSet(ctx, h.redis, cacheKey, out, jsonCacheTTL); err != nil {
		h.logErr("cache set", err)
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	sharedhttp.WriteJSON(w, http.StatusOK, out)
}

// buildOne assembles the public metadata for one token from pool + metadata +
// images. Absent rows yield null fields rather than an error (parity).
func (h *Handlers) buildOne(ctx context.Context, addr, base string) (types.PublicMetadata, error) {
	pool, err := h.q.GetPoolByToken(ctx, addr)
	hasPool := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return types.PublicMetadata{}, err
	}

	meta, err := h.q.GetTokenMetadata(ctx, addr)
	hasMeta := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return types.PublicMetadata{}, err
	}

	images, err := h.q.GetTokenImages(ctx, addr)
	if err != nil {
		return types.PublicMetadata{}, err
	}

	out := types.PublicMetadata{
		TokenAddress: addr,
		Decimals:     defaultDecimals,
		TotalSupply:  totalSupply,
		Tags:         []string{},
		Socials:      types.Socials{},
		Images:       buildImages(base, addr, images),
	}
	if hasPool {
		out.PoolAddress = strPtr(pool.PoolAddress)
		out.Creator = strPtr(pool.Creator)
	}
	if hasMeta {
		out.Name = textPtr(meta.Name)
		out.Symbol = textPtr(meta.Symbol)
		out.Description = textPtr(meta.Description)
		out.Decimals = meta.Decimals
		out.Socials = types.Socials{
			Website:  textPtr(meta.Website),
			Twitter:  textPtr(meta.Twitter),
			Telegram: textPtr(meta.Telegram),
			Discord:  textPtr(meta.Discord),
		}
		out.Tags = parseTags(meta.CustomTags)
		out.CreatedAt = int64Ptr(meta.CreatedAt)
		out.UpdatedAt = int64Ptr(meta.UpdatedAt)
	}
	return out, nil
}

// ── GET /metadata/batch?addresses=0xa,0xb&addresses=0xc ──────────────────────

func (h *Handlers) batch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requested := parseBatchAddresses(r.URL.Query()["addresses"])
	if len(requested) == 0 {
		w.Header().Set("Cache-Control", "public, max-age=10")
		sharedhttp.WriteJSON(w, http.StatusOK, map[string]types.PublicMetadata{})
		return
	}

	out := make(map[string]types.PublicMetadata, len(requested))
	var misses []string
	for _, addr := range requested {
		if cached, found, err := sharedredis.CacheGet[types.PublicMetadata](ctx, h.redis, cacheKeyPrefix+addr); err == nil && found {
			out[addr] = cached
		} else {
			misses = append(misses, addr)
		}
	}
	if len(misses) == 0 {
		w.Header().Set("Cache-Control", "public, max-age=30")
		sharedhttp.WriteJSON(w, http.StatusOK, out)
		return
	}

	pools, err := h.q.ListPoolsByTokenAddrs(ctx, misses)
	if err != nil {
		h.fail(w, "batch pools", err)
		return
	}
	metas, err := h.q.ListTokenMetadataByAddrs(ctx, misses)
	if err != nil {
		h.fail(w, "batch metadata", err)
		return
	}
	images, err := h.q.ListTokenImagesByAddrs(ctx, misses)
	if err != nil {
		h.fail(w, "batch images", err)
		return
	}

	poolByAddr := make(map[string]sqlcdb.IndexerPool, len(pools))
	for _, p := range pools {
		poolByAddr[strings.ToLower(p.TokenAddress)] = p
	}
	metaByAddr := make(map[string]sqlcdb.MetadataTokenMetadatum, len(metas))
	for _, m := range metas {
		metaByAddr[strings.ToLower(m.TokenAddress)] = m
	}
	imagesByAddr := make(map[string][]sqlcdb.MetadataTokenImage, len(images))
	for _, img := range images {
		k := strings.ToLower(img.TokenAddress)
		imagesByAddr[k] = append(imagesByAddr[k], img)
	}

	base := baseURL(h.publicURL, r)
	for _, addr := range misses {
		entry := h.assemble(addr, poolByAddr, metaByAddr, imagesByAddr, base)
		out[addr] = entry
		if err := sharedredis.CacheSet(ctx, h.redis, cacheKeyPrefix+addr, entry, jsonCacheTTL); err != nil {
			h.logErr("batch cache set", err)
		}
	}

	w.Header().Set("Cache-Control", "public, max-age=30")
	sharedhttp.WriteJSON(w, http.StatusOK, out)
}

func (h *Handlers) assemble(
	addr string,
	pools map[string]sqlcdb.IndexerPool,
	metas map[string]sqlcdb.MetadataTokenMetadatum,
	images map[string][]sqlcdb.MetadataTokenImage,
	base string,
) types.PublicMetadata {
	out := types.PublicMetadata{
		TokenAddress: addr,
		Decimals:     defaultDecimals,
		TotalSupply:  totalSupply,
		Tags:         []string{},
		Socials:      types.Socials{},
		Images:       buildImages(base, addr, images[addr]),
	}
	if pool, ok := pools[addr]; ok {
		out.PoolAddress = strPtr(pool.PoolAddress)
		out.Creator = strPtr(pool.Creator)
	}
	if meta, ok := metas[addr]; ok {
		out.Name = textPtr(meta.Name)
		out.Symbol = textPtr(meta.Symbol)
		out.Description = textPtr(meta.Description)
		out.Decimals = meta.Decimals
		out.Socials = types.Socials{
			Website:  textPtr(meta.Website),
			Twitter:  textPtr(meta.Twitter),
			Telegram: textPtr(meta.Telegram),
			Discord:  textPtr(meta.Discord),
		}
		out.Tags = parseTags(meta.CustomTags)
		out.CreatedAt = int64Ptr(meta.CreatedAt)
		out.UpdatedAt = int64Ptr(meta.UpdatedAt)
	}
	return out
}

// ── POST /metadata/{tokenAddress}  (multipart upsert) ────────────────────────

func (h *Handlers) upload(w http.ResponseWriter, r *http.Request) {
	addr := normalizeAddr(chi.URLParam(r, "tokenAddress"))
	ctx := r.Context()

	if err := r.ParseMultipartForm(multipartMaxMemory); err != nil {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "invalid multipart form")
		return
	}

	wallet := r.FormValue("wallet")
	signature := r.FormValue("signature")
	message := r.FormValue("message")
	metaRaw := r.FormValue("metadata")

	if wallet == "" {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "Missing required field: wallet")
		return
	}
	if signature == "" || message == "" {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "Missing signature or message")
		return
	}
	if !sharedauth.VerifyWalletSignature(wallet, message, signature) {
		sharedhttp.WriteError(w, http.StatusForbidden, "Forbidden", "Invalid signature")
		return
	}

	pool, ok, err := h.lookupPool(ctx, addr)
	if err != nil {
		h.fail(w, "lookup pool", err)
		return
	}
	if !ok {
		sharedhttp.WriteError(w, http.StatusNotFound, "Not Found", "Token not found in indexer")
		return
	}
	if !strings.EqualFold(pool.Creator, wallet) {
		sharedhttp.WriteError(w, http.StatusForbidden, "Forbidden", "Not pool creator")
		return
	}

	now := h.clock().Unix()
	resp := types.UploadResponse{}

	if metaRaw != "" {
		if err := h.upsertMetadata(ctx, addr, pool.PoolAddress, wallet, metaRaw, now); err != nil {
			if errors.Is(err, errBadMetadata) {
				resp.Errors = append(resp.Errors, "Invalid metadata JSON")
			} else {
				h.fail(w, "upsert metadata", err)
				return
			}
		} else {
			resp.MetadataUpdated = true
		}
	}

	base := baseURL(h.publicURL, r)
	if url, errs := h.handleImage(ctx, r, image.TypeLogo, addr, h.maxLogo, now, base); errs != "" {
		resp.Errors = append(resp.Errors, errs)
	} else if url != "" {
		resp.LogoURL = strPtr(url)
	}
	if url, errs := h.handleImage(ctx, r, image.TypeBanner, addr, h.maxBanner, now, base); errs != "" {
		resp.Errors = append(resp.Errors, errs)
	} else if url != "" {
		resp.BannerURL = strPtr(url)
	}

	if err := sharedredis.CacheInvalidate(ctx, h.redis, cacheKeyPrefix+addr); err != nil {
		h.logErr("cache invalidate", err)
	}

	resp.Success = len(resp.Errors) == 0
	sharedhttp.WriteJSON(w, http.StatusOK, resp)
}

var errBadMetadata = errors.New("bad metadata json")

func (h *Handlers) upsertMetadata(ctx context.Context, addr, poolAddr, wallet, raw string, now int64) error {
	var data types.UploadMetadata
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return errBadMetadata
	}
	tags := data.Tags
	if tags == nil {
		tags = []string{}
	}
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return errBadMetadata
	}
	decimals := int32(defaultDecimals)
	if data.Decimals != nil {
		decimals = *data.Decimals
	}
	return h.q.UpsertTokenMetadata(ctx, sqlcdb.UpsertTokenMetadataParams{
		TokenAddress: addr,
		PoolAddress:  strings.ToLower(poolAddr),
		Name:         strToText(data.Name),
		Symbol:       strToText(data.Symbol),
		Description:  strToText(data.Description),
		Website:      strToText(data.Website),
		Twitter:      strToText(data.Twitter),
		Telegram:     strToText(data.Telegram),
		Discord:      strToText(data.Discord),
		CustomTags:   pgtype.Text{String: string(tagsJSON), Valid: true},
		Decimals:     decimals,
		CreatedBy:    wallet,
		CreatedAt:    now,
		UpdatedAt:    now,
	})
}

// handleImage processes one optional uploaded image field (logo/banner). It
// returns the public URL on success, or a human-readable error string on a
// validation/scan/storage failure. An absent field is a no-op (both "").
func (h *Handlers) handleImage(ctx context.Context, r *http.Request, imageType, addr string, maxSize, now int64, base string) (url string, errMsg string) {
	if r.MultipartForm == nil {
		return "", ""
	}
	fhs := r.MultipartForm.File[imageType]
	if len(fhs) == 0 {
		return "", ""
	}
	fh := fhs[0]
	f, err := fh.Open()
	if err != nil {
		return "", imageType + " could not be read"
	}
	defer f.Close()
	buf, err := io.ReadAll(io.LimitReader(f, maxSize+1))
	if err != nil {
		return "", imageType + " could not be read"
	}
	if int64(len(buf)) > maxSize {
		return "", imageType + " too large"
	}
	mime := fh.Header.Get("Content-Type")
	if !image.AllowedMime(mime) {
		return "", imageType + " unsupported format: " + mime + ". Use webp, png, svg, or jpeg."
	}
	if image.IsSVG(mime) && !image.IsSVGSafe(buf) {
		return "", imageType + " SVG rejected: contains script, event handlers, or unsafe elements"
	}
	if res := h.scan(ctx, buf); !res.Clean {
		return "", imageType + " rejected by virus scanner: " + res.Reason
	}

	ext := image.ExtForMime(mime)
	storageKey := imageType + "s/" + imageType + "-" + addr + "." + ext
	if err := h.store.Put(ctx, storageKey, strings.NewReader(string(buf)), int64(len(buf)), mime); err != nil {
		h.logErr("store put", err)
		return "", imageType + " upload failed"
	}
	if err := h.q.UpsertTokenImage(ctx, sqlcdb.UpsertTokenImageParams{
		ID:           addr + "-" + imageType,
		TokenAddress: addr,
		ImageType:    imageType,
		StorageKey:   storageKey,
		MimeType:     mime,
		SizeBytes:    int32(len(buf)),
		UploadedAt:   now,
	}); err != nil {
		h.logErr("upsert image", err)
		return "", imageType + " metadata write failed"
	}
	return base + "/" + imageType + "/" + addr + "." + ext, ""
}

// lookupPool reads indexer.pools with bounded retries (create-wizard race).
func (h *Handlers) lookupPool(ctx context.Context, addr string) (sqlcdb.IndexerPool, bool, error) {
	for attempt := 1; attempt <= h.poolTries; attempt++ {
		pool, err := h.q.GetPoolByToken(ctx, addr)
		if err == nil {
			return pool, true, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return sqlcdb.IndexerPool{}, false, err
		}
		if attempt < h.poolTries {
			h.sleep(h.poolDelay)
		}
	}
	return sqlcdb.IndexerPool{}, false, nil
}

// ── GET /logo/{addr}.{ext} and /banner/{addr}.{ext} (serve bytes from R2) ────

func (h *Handlers) serveImage(imageType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		file := chi.URLParam(r, "file")
		addr := normalizeAddr(stripExt(file))
		ctx := r.Context()

		img, err := h.q.GetImageByType(ctx, sqlcdb.GetImageByTypeParams{TokenAddress: addr, ImageType: imageType})
		if errors.Is(err, pgx.ErrNoRows) {
			sharedhttp.WriteError(w, http.StatusNotFound, "Not Found", "No "+imageType+" found")
			return
		}
		if err != nil {
			h.fail(w, "get image", err)
			return
		}

		obj, err := h.store.Get(ctx, img.StorageKey)
		if errors.Is(err, storage.ErrNotFound) {
			sharedhttp.WriteError(w, http.StatusNotFound, "Not Found", "Image not found in storage")
			return
		}
		if err != nil {
			h.fail(w, "store get", err)
			return
		}
		defer obj.Body.Close()

		w.Header().Set("Content-Type", img.MimeType)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("CDN-Cache-Control", "public, max-age=31536000")
		w.Header().Set("Vary", "Accept-Encoding")
		if img.SizeBytes > 0 {
			w.Header().Set("Content-Length", itoa64(int64(img.SizeBytes)))
		}
		w.WriteHeader(http.StatusOK)
		if _, err := io.Copy(w, obj.Body); err != nil {
			h.logErr("stream image", err)
		}
	}
}

// ── error helpers ────────────────────────────────────────────────────────────

func (h *Handlers) fail(w http.ResponseWriter, op string, err error) {
	h.logErr(op, err)
	sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "")
}

func (h *Handlers) logErr(op string, err error) {
	if h.logger != nil {
		h.logger.Error("metadata handler error", slog.String("op", op), slog.String("err", err.Error()))
	}
}
