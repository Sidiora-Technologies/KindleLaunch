package metadata_test

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sharedredis "github.com/Sidiora-Technologies/KindleLaunch/shared/redis"
	"github.com/Sidiora-Technologies/KindleLaunch/shared/storage"

	"github.com/Sidiora-Technologies/KindleLaunch/media/metadata/internal/db/sqlcdb"
	"github.com/Sidiora-Technologies/KindleLaunch/media/metadata/internal/internaltest"
	"github.com/Sidiora-Technologies/KindleLaunch/media/metadata/internal/metadata"
	"github.com/Sidiora-Technologies/KindleLaunch/media/metadata/pkg/types"
)

const publicURL = "https://cdn.test"

type harness struct {
	baseURL string
	pool    *pgxpool.Pool
	store   *storage.Client
	key     *ecdsa.PrivateKey
	wallet  string // checksum address of key
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	pool := internaltest.NewPostgres(t)
	redisURL := internaltest.NewRedisURL(t)
	rdb, err := sharedredis.NewClient(redisURL)
	if err != nil {
		t.Fatalf("redis client: %v", err)
	}
	t.Cleanup(func() { _ = rdb.Close() })
	store := internaltest.NewStore(t, "token-assets")

	h := metadata.New(metadata.Deps{
		Queries:            sqlcdb.New(pool),
		Redis:              rdb,
		Store:              store,
		PublicURL:          publicURL,
		MaxLogoSize:        2 << 20,
		MaxBanner:          5 << 20,
		PoolLookupAttempts: 1,
		Sleep:              func(time.Duration) {},
	})
	r := chi.NewRouter()
	h.RegisterRoutes(r)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)

	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatalf("gen key: %v", err)
	}
	return &harness{
		baseURL: srv.URL,
		pool:    pool,
		store:   store,
		key:     key,
		wallet:  crypto.PubkeyToAddress(key.PublicKey).Hex(),
	}
}

func (h *harness) sign(t *testing.T, msg string) string {
	t.Helper()
	sig, err := crypto.Sign(accounts.TextHash([]byte(msg)), h.key)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return hexutil.Encode(sig)
}

// uploadForm posts a multipart upsert and returns the decoded response + status.
func (h *harness) upload(t *testing.T, addr string, fields map[string]string, files map[string]uploadFile) (types.UploadResponse, int) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		if err := mw.WriteField(k, v); err != nil {
			t.Fatalf("write field: %v", err)
		}
	}
	for field, f := range files {
		hdr := textproto.MIMEHeader{}
		hdr.Set("Content-Disposition", fmt.Sprintf(`form-data; name=%q; filename=%q`, field, f.name))
		hdr.Set("Content-Type", f.contentType)
		part, err := mw.CreatePart(hdr)
		if err != nil {
			t.Fatalf("create part: %v", err)
		}
		if _, err := part.Write(f.data); err != nil {
			t.Fatalf("write part: %v", err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, h.baseURL+"/metadata/"+addr, &body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	var out types.UploadResponse
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out, resp.StatusCode
}

type uploadFile struct {
	name        string
	contentType string
	data        []byte
}

func (h *harness) signedFields(t *testing.T, metaJSON string) map[string]string {
	msg := "sign-in"
	return map[string]string{
		"wallet":    h.wallet,
		"message":   msg,
		"signature": h.sign(t, msg),
		"metadata":  metaJSON,
	}
}

func tokenAddr(n int) string { return fmt.Sprintf("0x%040x", n) }

func pngFile() uploadFile {
	return uploadFile{name: "logo.png", contentType: "image/png", data: []byte("\x89PNG\r\n\x1a\nfakepngbytes")}
}

func getJSON(t *testing.T, url string, dst any) int {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("get %s: %v", url, err)
	}
	defer resp.Body.Close()
	if dst != nil {
		_ = json.NewDecoder(resp.Body).Decode(dst)
	}
	return resp.StatusCode
}

func TestMetadataService(t *testing.T) {
	h := newHarness(t)

	t.Run("upload full flow, read, serve", func(t *testing.T) {
		addr := tokenAddr(1)
		poolAddr := tokenAddr(1001)
		internaltest.SeedPool(t, h.pool, poolAddr, addr, h.wallet)

		metaJSON := `{"name":"Doge","symbol":"DOGE","description":"such wow","website":"https://d.fun","twitter":"@doge","decimals":9,"tags":["meme","dog"]}`
		fields := h.signedFields(t, metaJSON)
		resp, code := h.upload(t, addr, fields, map[string]uploadFile{
			"logo":   pngFile(),
			"banner": {name: "b.webp", contentType: "image/webp", data: []byte("RIFFfakewebp")},
		})
		if code != http.StatusOK {
			t.Fatalf("upload status = %d, want 200 (errors=%v)", code, resp.Errors)
		}
		if !resp.Success || !resp.MetadataUpdated {
			t.Fatalf("resp = %+v, want success+metadata_updated", resp)
		}
		if resp.LogoURL == nil || *resp.LogoURL != publicURL+"/logo/"+addr+".png" {
			t.Errorf("logo_url = %v", resp.LogoURL)
		}
		if resp.BannerURL == nil || *resp.BannerURL != publicURL+"/banner/"+addr+".webp" {
			t.Errorf("banner_url = %v", resp.BannerURL)
		}

		var pm types.PublicMetadata
		if code := getJSON(t, h.baseURL+"/metadata/"+addr, &pm); code != http.StatusOK {
			t.Fatalf("read status = %d", code)
		}
		if pm.Name == nil || *pm.Name != "Doge" {
			t.Errorf("name = %v", pm.Name)
		}
		if pm.Decimals != 9 {
			t.Errorf("decimals = %d, want 9", pm.Decimals)
		}
		if pm.TotalSupply != "1000000000" {
			t.Errorf("total_supply = %q", pm.TotalSupply)
		}
		if pm.Creator == nil || !strings.EqualFold(*pm.Creator, h.wallet) {
			t.Errorf("creator = %v, want %s", pm.Creator, h.wallet)
		}
		if len(pm.Tags) != 2 || pm.Tags[0] != "meme" {
			t.Errorf("tags = %v", pm.Tags)
		}
		if pm.Images.Logo == nil || *pm.Images.Logo != publicURL+"/logo/"+addr+".png" {
			t.Errorf("images.logo = %v", pm.Images.Logo)
		}

		// Serve the logo bytes straight from R2.
		ir, err := http.Get(h.baseURL + "/logo/" + addr + ".png")
		if err != nil {
			t.Fatalf("serve logo: %v", err)
		}
		defer ir.Body.Close()
		if ir.StatusCode != http.StatusOK {
			t.Fatalf("serve logo status = %d", ir.StatusCode)
		}
		if ct := ir.Header.Get("Content-Type"); ct != "image/png" {
			t.Errorf("serve content-type = %q", ct)
		}
		if cc := ir.Header.Get("Cache-Control"); !strings.Contains(cc, "immutable") {
			t.Errorf("cache-control = %q, want immutable", cc)
		}
		got, _ := io.ReadAll(ir.Body)
		if !bytes.Equal(got, pngFile().data) {
			t.Errorf("served bytes mismatch")
		}
	})

	t.Run("json alias strips suffix", func(t *testing.T) {
		addr := tokenAddr(2)
		internaltest.SeedPool(t, h.pool, tokenAddr(1002), addr, h.wallet)
		fields := h.signedFields(t, `{"name":"Alias","symbol":"AL"}`)
		if _, code := h.upload(t, addr, fields, nil); code != http.StatusOK {
			t.Fatalf("upload status = %d", code)
		}
		var pm types.PublicMetadata
		if code := getJSON(t, h.baseURL+"/metadata/"+addr+".json", &pm); code != http.StatusOK {
			t.Fatalf(".json status = %d", code)
		}
		if pm.TokenAddress != addr || pm.Name == nil || *pm.Name != "Alias" {
			t.Errorf("json alias = %+v", pm)
		}
	})

	t.Run("single unknown returns null fields", func(t *testing.T) {
		var pm types.PublicMetadata
		if code := getJSON(t, h.baseURL+"/metadata/"+tokenAddr(999), &pm); code != http.StatusOK {
			t.Fatalf("status = %d", code)
		}
		if pm.Name != nil || pm.PoolAddress != nil {
			t.Errorf("expected nulls, got %+v", pm)
		}
		if pm.Decimals != 6 {
			t.Errorf("default decimals = %d, want 6", pm.Decimals)
		}
		if pm.Tags == nil {
			t.Error("tags should be [] not null")
		}
	})

	t.Run("batch read + cache + filtering", func(t *testing.T) {
		a, b := tokenAddr(10), tokenAddr(11)
		internaltest.SeedPool(t, h.pool, tokenAddr(1010), a, h.wallet)
		internaltest.SeedPool(t, h.pool, tokenAddr(1011), b, h.wallet)
		for _, addr := range []string{a, b} {
			if _, code := h.upload(t, addr, h.signedFields(t, `{"name":"B"}`), nil); code != http.StatusOK {
				t.Fatalf("seed upload status = %d", code)
			}
		}
		// includes one invalid + one unknown-but-valid address
		url := h.baseURL + "/metadata/batch?addresses=" + a + "," + b + ",not-an-addr," + tokenAddr(12)
		out := map[string]types.PublicMetadata{}
		if code := getJSON(t, url, &out); code != http.StatusOK {
			t.Fatalf("batch status = %d", code)
		}
		if len(out) != 3 { // a, b, and the valid-but-unknown 0x..0c
			t.Fatalf("batch len = %d, want 3 (%v)", len(out), keys(out))
		}
		if out[a].Name == nil || *out[a].Name != "B" {
			t.Errorf("batch[a].name = %v", out[a].Name)
		}
		// Second call should be served from cache (same result).
		out2 := map[string]types.PublicMetadata{}
		getJSON(t, url, &out2)
		if len(out2) != 3 {
			t.Errorf("cached batch len = %d, want 3", len(out2))
		}
	})

	t.Run("batch empty", func(t *testing.T) {
		out := map[string]types.PublicMetadata{}
		if code := getJSON(t, h.baseURL+"/metadata/batch", &out); code != http.StatusOK {
			t.Fatalf("status = %d", code)
		}
		if len(out) != 0 {
			t.Errorf("empty batch len = %d", len(out))
		}
	})

	t.Run("missing wallet 400", func(t *testing.T) {
		_, code := h.upload(t, tokenAddr(3), map[string]string{"metadata": "{}"}, nil)
		if code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", code)
		}
	})

	t.Run("missing signature 400", func(t *testing.T) {
		_, code := h.upload(t, tokenAddr(4), map[string]string{"wallet": h.wallet}, nil)
		if code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", code)
		}
	})

	t.Run("invalid signature 403", func(t *testing.T) {
		fields := map[string]string{"wallet": h.wallet, "message": "m", "signature": "0xdeadbeef"}
		_, code := h.upload(t, tokenAddr(5), fields, nil)
		if code != http.StatusForbidden {
			t.Errorf("status = %d, want 403", code)
		}
	})

	t.Run("pool not found 404", func(t *testing.T) {
		_, code := h.upload(t, tokenAddr(6), h.signedFields(t, "{}"), nil)
		if code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", code)
		}
	})

	t.Run("not pool creator 403", func(t *testing.T) {
		addr := tokenAddr(7)
		internaltest.SeedPool(t, h.pool, tokenAddr(1007), addr, "0x000000000000000000000000000000000000dEaD")
		_, code := h.upload(t, addr, h.signedFields(t, "{}"), nil)
		if code != http.StatusForbidden {
			t.Errorf("status = %d, want 403", code)
		}
	})

	t.Run("disallowed mime collects error", func(t *testing.T) {
		addr := tokenAddr(8)
		internaltest.SeedPool(t, h.pool, tokenAddr(1008), addr, h.wallet)
		resp, code := h.upload(t, addr, h.signedFields(t, `{"name":"X"}`), map[string]uploadFile{
			"logo": {name: "x.gif", contentType: "image/gif", data: []byte("GIF89a")},
		})
		if code != http.StatusOK {
			t.Fatalf("status = %d", code)
		}
		if resp.Success || len(resp.Errors) == 0 {
			t.Errorf("expected errors, got %+v", resp)
		}
		if !resp.MetadataUpdated {
			t.Error("metadata should still update despite image error")
		}
	})

	t.Run("unsafe svg collects error", func(t *testing.T) {
		addr := tokenAddr(9)
		internaltest.SeedPool(t, h.pool, tokenAddr(1009), addr, h.wallet)
		resp, _ := h.upload(t, addr, h.signedFields(t, "{}"), map[string]uploadFile{
			"logo": {name: "x.svg", contentType: "image/svg+xml", data: []byte(`<svg onload="alert(1)"></svg>`)},
		})
		if resp.Success || len(resp.Errors) == 0 {
			t.Errorf("expected svg rejection, got %+v", resp)
		}
	})

	t.Run("oversized logo collects error", func(t *testing.T) {
		addr := tokenAddr(13)
		internaltest.SeedPool(t, h.pool, tokenAddr(1013), addr, h.wallet)
		big := bytes.Repeat([]byte("a"), (2<<20)+10)
		resp, _ := h.upload(t, addr, h.signedFields(t, "{}"), map[string]uploadFile{
			"logo": {name: "big.png", contentType: "image/png", data: big},
		})
		if resp.Success || len(resp.Errors) == 0 {
			t.Errorf("expected oversize rejection, got %+v", resp)
		}
	})

	t.Run("bad metadata json collects error", func(t *testing.T) {
		addr := tokenAddr(14)
		internaltest.SeedPool(t, h.pool, tokenAddr(1014), addr, h.wallet)
		resp, code := h.upload(t, addr, h.signedFields(t, `{not json`), nil)
		if code != http.StatusOK {
			t.Fatalf("status = %d", code)
		}
		if resp.Success || len(resp.Errors) == 0 {
			t.Errorf("expected bad-json error, got %+v", resp)
		}
	})

	t.Run("serve image not found 404", func(t *testing.T) {
		resp, err := http.Get(h.baseURL + "/logo/" + tokenAddr(900) + ".png")
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404", resp.StatusCode)
		}
	})

	t.Run("serve image storage-missing 404", func(t *testing.T) {
		addr := tokenAddr(15)
		internaltest.SeedPool(t, h.pool, tokenAddr(1015), addr, h.wallet)
		if _, code := h.upload(t, addr, h.signedFields(t, "{}"), map[string]uploadFile{"logo": pngFile()}); code != http.StatusOK {
			t.Fatalf("upload status = %d", code)
		}
		// Delete the object from the bucket out from under the DB row.
		if err := h.store.Delete(context.Background(), "logos/logo-"+addr+".png"); err != nil {
			t.Fatalf("delete object: %v", err)
		}
		resp, err := http.Get(h.baseURL + "/logo/" + addr + ".png")
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404", resp.StatusCode)
		}
	})
}

func keys(m map[string]types.PublicMetadata) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
