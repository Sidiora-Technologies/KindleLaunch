// Package upload is the gateway's token-create wizard upload edge. It enforces
// the public-ingress guards (a hard body-size cap, the image MIME allowlist,
// SVG sanitisation, and a clamd virus scan) and then FORWARDS the validated
// multipart to media/metadata, which remains the single authoritative writer
// (scan -> R2 bucket -> metadata row, EIP-191 gated). The gateway deliberately
// owns no metadata schema or bucket; it is a guarded reverse proxy for the write
// path, mirroring how it fronts media/social for the realtime path.
package upload

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	sharedhttp "github.com/Sidiora-Technologies/KindleLaunch/shared/http"

	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/common"
	"github.com/Sidiora-Technologies/KindleLaunch/media/gateway/internal/image"
)

// imageFields are the multipart file fields the create wizard may send.
var imageFields = []string{"logo", "banner"}

// multipartMaxMemory bounds in-memory multipart buffering before spilling to a
// temp file during parsing.
const multipartMaxMemory = 8 << 20

// Scanner scans an uploaded buffer for malware. Defaults to shared clamd.
type Scanner func(ctx context.Context, data []byte) sharedhttp.ScanResult

// Handler guards + forwards create-wizard uploads to media/metadata.
type Handler struct {
	client      *http.Client
	metadataURL string
	maxBytes    int64
	scan        Scanner
	logger      *slog.Logger
}

// Deps configures New.
type Deps struct {
	// MetadataBaseURL is the internal base URL of media/metadata.
	MetadataBaseURL string
	// MaxBytes is the hard cap on the entire request body.
	MaxBytes int64
	// Timeout caps the forward round-trip to media/metadata.
	Timeout time.Duration
	// Scan defaults to shared/http.ScanBuffer (clamd via $CLAMAV_HOST).
	Scan   Scanner
	Logger *slog.Logger
}

// New constructs a Handler, applying defaults for optional dependencies.
func New(d Deps) *Handler {
	scan := d.Scan
	if scan == nil {
		scan = func(ctx context.Context, data []byte) sharedhttp.ScanResult {
			return sharedhttp.ScanBuffer(ctx, data, sharedhttp.ScanOptions{})
		}
	}
	timeout := d.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Handler{
		client:      &http.Client{Timeout: timeout},
		metadataURL: strings.TrimRight(d.MetadataBaseURL, "/"),
		maxBytes:    d.MaxBytes,
		scan:        scan,
		logger:      d.Logger,
	}
}

// RegisterRoutes mounts the upload endpoint onto r.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Post("/upload/token/{tokenAddress}", h.upload)
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	addr := common.NormalizeAddr(chi.URLParam(r, "tokenAddress"))
	if !common.IsAddr(addr) {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", "invalid token address")
		return
	}

	// Hard body-size cap (load-shed oversize uploads at the edge, i12). A read
	// past the limit surfaces as an error from ParseMultipartForm below.
	r.Body = http.MaxBytesReader(w, r.Body, h.maxBytes)
	if err := r.ParseMultipartForm(multipartMaxMemory); err != nil {
		sharedhttp.WriteError(w, http.StatusRequestEntityTooLarge, "Payload Too Large", "upload exceeds size limit or is malformed")
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	// Validate + buffer each provided image file at the edge.
	bufs, errMsg := h.validateImages(r)
	if errMsg != "" {
		sharedhttp.WriteError(w, http.StatusBadRequest, "Bad Request", errMsg)
		return
	}

	body, contentType, err := rebuildMultipart(r.MultipartForm.Value, bufs)
	if err != nil {
		h.fail(w, "rebuild multipart", err)
		return
	}

	h.forward(w, r, addr, body, contentType)
}

// fileBuf is a validated image file ready to be re-attached to the forward.
type fileBuf struct {
	field    string
	filename string
	mime     string
	data     []byte
}

// validateImages reads each present image field, enforcing the MIME allowlist,
// SVG safety, and a virus scan. It returns the buffered files, or a
// human-readable error message on the first rejection.
func (h *Handler) validateImages(r *http.Request) ([]fileBuf, string) {
	var out []fileBuf
	for _, field := range imageFields {
		fhs := r.MultipartForm.File[field]
		if len(fhs) == 0 {
			continue
		}
		fh := fhs[0]
		f, err := fh.Open()
		if err != nil {
			return nil, field + " could not be read"
		}
		data, err := io.ReadAll(f)
		_ = f.Close()
		if err != nil {
			return nil, field + " could not be read"
		}
		mime := fh.Header.Get("Content-Type")
		if !image.AllowedMime(mime) {
			return nil, field + " unsupported format: use webp, png, svg, or jpeg"
		}
		if image.IsSVG(mime) && !image.IsSVGSafe(data) {
			return nil, field + " SVG rejected: contains script, event handlers, or unsafe elements"
		}
		if res := h.scan(r.Context(), data); !res.Clean {
			return nil, field + " rejected by virus scanner: " + res.Reason
		}
		out = append(out, fileBuf{field: field, filename: fh.Filename, mime: mime, data: data})
	}
	return out, ""
}

// rebuildMultipart reconstructs a multipart body from the parsed text fields and
// the validated image buffers, returning the body and its Content-Type.
func rebuildMultipart(values map[string][]string, files []fileBuf) (*bytes.Buffer, string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for name, vals := range values {
		for _, v := range vals {
			if err := mw.WriteField(name, v); err != nil {
				return nil, "", err
			}
		}
	}
	for _, fb := range files {
		hdr := make(map[string][]string, 2)
		hdr["Content-Disposition"] = []string{`form-data; name="` + fb.field + `"; filename="` + escapeQuotes(fb.filename) + `"`}
		hdr["Content-Type"] = []string{fb.mime}
		part, err := mw.CreatePart(hdr)
		if err != nil {
			return nil, "", err
		}
		if _, err := part.Write(fb.data); err != nil {
			return nil, "", err
		}
	}
	if err := mw.Close(); err != nil {
		return nil, "", err
	}
	return &buf, mw.FormDataContentType(), nil
}

// forward posts the rebuilt multipart to media/metadata and copies the upstream
// response (status + body) back to the client verbatim.
func (h *Handler) forward(w http.ResponseWriter, r *http.Request, addr string, body *bytes.Buffer, contentType string) {
	target := h.metadataURL + "/metadata/" + addr
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, body)
	if err != nil {
		h.fail(w, "build forward request", err)
		return
	}
	req.Header.Set("Content-Type", contentType)

	resp, err := h.client.Do(req)
	if err != nil {
		h.logErr("forward to metadata", err)
		sharedhttp.WriteError(w, http.StatusBadGateway, "Bad Gateway", "metadata upstream unavailable")
		return
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		h.logErr("copy upstream response", err)
	}
}

func escapeQuotes(s string) string {
	return strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s)
}

func (h *Handler) fail(w http.ResponseWriter, op string, err error) {
	h.logErr(op, err)
	sharedhttp.WriteError(w, http.StatusInternalServerError, "Internal Server Error", "")
}

func (h *Handler) logErr(op string, err error) {
	if h.logger != nil {
		h.logger.Error("upload error", slog.String("op", op), slog.String("err", err.Error()))
	}
}
