// Package ogrender renders shareable PnL card images (OG cards) to PNG using
// github.com/fogleman/gg. Inter *.ttf faces are loaded at runtime from a
// configurable font directory; when a face is missing the renderer falls back to
// the built-in basic font so rendering never fails (and tests need no bundled
// binaries). The renderer is purely presentational — all money math and number
// formatting happen upstream (invariant i1) and arrive here as display strings.
package ogrender

import (
	"bytes"
	"fmt"
	"path/filepath"

	"github.com/fogleman/gg"
	"golang.org/x/image/font/basicfont"
)

// Card dimensions: the standard Open Graph image size.
const (
	width  = 1200
	height = 630
)

// Palette (minimal, dark, single accent — no gradients/glow/borders).
const (
	colorBG     = "#0B0B0F"
	colorAccent = "#004CED"
	colorText   = "#FFFFFF"
	colorMuted  = "#A1A1AA"
	colorGain   = "#16A34A"
	colorLoss   = "#DC2626"
)

// Font face files (loaded from the configured dir when present).
const (
	fontBold    = "Inter-Bold.ttf"
	fontRegular = "Inter-Regular.ttf"
)

// Renderer draws PnL cards. It is safe for concurrent use (each Render builds its
// own drawing context).
type Renderer struct {
	fontDir string
}

// New builds a Renderer that loads fonts from fontDir (may be empty, which forces
// the basic-font fallback).
func New(fontDir string) *Renderer { return &Renderer{fontDir: fontDir} }

// Input is the flat, already-formatted content drawn onto a card.
type Input struct {
	Title       string // headline, e.g. token name / "$SYMBOL"
	Multiple    string // e.g. "2.5x"
	Pnl         string // e.g. "+$3.50" or "-$6.00"
	PnlPositive bool
	Holdings    string // e.g. "1.50 SYMBOL held"
	Footer      string // e.g. "sidiora.fun/pnl/abc123"
}

// Render draws in onto a 1200x630 PNG and returns the encoded bytes.
func (r *Renderer) Render(in Input) ([]byte, error) {
	dc := gg.NewContext(width, height)

	// Background + top accent bar.
	dc.SetHexColor(colorBG)
	dc.Clear()
	dc.SetHexColor(colorAccent)
	dc.DrawRectangle(0, 0, float64(width), 14)
	dc.Fill()

	// Headline.
	r.setFace(dc, fontBold, 64)
	dc.SetHexColor(colorText)
	dc.DrawStringAnchored(truncate(in.Title, 28), 80, 150, 0, 0.5)

	// Multiple (the hero number).
	r.setFace(dc, fontBold, 130)
	dc.DrawStringAnchored(in.Multiple, 80, 330, 0, 0.5)

	// Signed PnL, coloured by sign.
	r.setFace(dc, fontBold, 76)
	if in.PnlPositive {
		dc.SetHexColor(colorGain)
	} else {
		dc.SetHexColor(colorLoss)
	}
	dc.DrawStringAnchored(in.Pnl, 80, 450, 0, 0.5)

	// Holdings + footer.
	dc.SetHexColor(colorMuted)
	r.setFace(dc, fontRegular, 36)
	dc.DrawStringAnchored(truncate(in.Holdings, 48), 80, 530, 0, 0.5)
	dc.DrawStringAnchored(truncate(in.Footer, 48), 80, 588, 0, 0.5)

	var buf bytes.Buffer
	if err := dc.EncodePNG(&buf); err != nil {
		return nil, fmt.Errorf("ogrender: encode png: %w", err)
	}
	return buf.Bytes(), nil
}

// setFace loads the requested Inter face at the given size, falling back to the
// built-in basic font when the directory is unset or the file can't be loaded.
func (r *Renderer) setFace(dc *gg.Context, file string, points float64) {
	if r.fontDir != "" {
		if err := dc.LoadFontFace(filepath.Join(r.fontDir, file), points); err == nil {
			return
		}
	}
	dc.SetFontFace(basicfont.Face7x13)
}

// truncate bounds a label to n runes, appending an ellipsis when clipped.
func truncate(s string, n int) string {
	rs := []rune(s)
	if len(rs) <= n {
		return s
	}
	if n <= 1 {
		return string(rs[:n])
	}
	return string(rs[:n-1]) + "\u2026"
}
