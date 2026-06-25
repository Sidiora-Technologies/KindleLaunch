// Package pnlmath holds the pure, money-exact PnL cost-basis math for
// core/pnl-tracker. Everything here is computed with math/big on decimal strings
// — never float (invariant i1, HARD rule). Realized PnL is SIGNED (it can go
// negative); all other quantities are non-negative uint256 raw amounts:
//
//   - USDL raw  (6 decimals):  totalUsdlSpent/Received, realizedPnlUsdl, usdlAmount
//   - token raw (18 decimals): totalTokensBought/Sold, currentHoldings, tokenAmount
//   - WAD       (18 decimals): avgCostBasis, priceWad
//
// The fold uses the average-cost-basis method: each buy re-derives the average
// cost (totalUsdlSpent * WAD / totalTokensBought) and each sell realises
// proceeds minus the average cost of the sold tokens. This matches the client's
// computeTotalPnlUsdl/computeMultiple helpers (pnl.ts) exactly so the data the
// UI derives is internally consistent.
package pnlmath

import (
	"fmt"
	"math/big"
)

// wad is the 1e18 fixed-point scale shared by price and cost basis.
var wad = new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)

// Position is the accumulated state of a (user, pool) position. Money fields are
// decimal strings (RealizedPnlUsdl is signed; the rest are non-negative).
type Position struct {
	TotalUsdlSpent    string
	TotalTokensBought string
	TotalUsdlReceived string
	TotalTokensSold   string
	AvgCostBasis      string // WAD
	CurrentHoldings   string
	RealizedPnlUsdl   string // signed
	FirstBuyTs        *int64
	LastTradeTs       int64
	TradeCount        int
}

// Trade is one folded swap leg, normalised to USDL/token amounts (a buy spends
// USDL for tokens; a sell receives USDL for tokens).
type Trade struct {
	IsBuy       bool
	UsdlAmount  string
	TokenAmount string
	Ts          int64
}

// parse turns a decimal string into a *big.Int, treating "" as 0. A leading '-'
// is accepted (realized PnL is signed); a nil/empty position field is the zero
// value, so freshly-seen positions fold cleanly.
func parse(name, s string) (*big.Int, error) {
	if s == "" {
		return new(big.Int), nil
	}
	v, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return nil, fmt.Errorf("pnlmath: %s %q is not a valid integer string", name, s)
	}
	return v, nil
}

// Fold returns the position after applying trade to prior. It is pure (no I/O)
// and idempotent at the caller's layer: the store only calls Fold when a trade
// row is newly inserted, so redelivery never double-counts.
func Fold(prior Position, t Trade) (Position, error) {
	spent, err := parse("totalUsdlSpent", prior.TotalUsdlSpent)
	if err != nil {
		return Position{}, err
	}
	bought, err := parse("totalTokensBought", prior.TotalTokensBought)
	if err != nil {
		return Position{}, err
	}
	received, err := parse("totalUsdlReceived", prior.TotalUsdlReceived)
	if err != nil {
		return Position{}, err
	}
	sold, err := parse("totalTokensSold", prior.TotalTokensSold)
	if err != nil {
		return Position{}, err
	}
	avgCost, err := parse("avgCostBasis", prior.AvgCostBasis)
	if err != nil {
		return Position{}, err
	}
	holdings, err := parse("currentHoldings", prior.CurrentHoldings)
	if err != nil {
		return Position{}, err
	}
	realized, err := parse("realizedPnlUsdl", prior.RealizedPnlUsdl)
	if err != nil {
		return Position{}, err
	}

	usdl, err := parse("usdlAmount", t.UsdlAmount)
	if err != nil {
		return Position{}, err
	}
	tok, err := parse("tokenAmount", t.TokenAmount)
	if err != nil {
		return Position{}, err
	}
	if usdl.Sign() < 0 || tok.Sign() < 0 {
		return Position{}, fmt.Errorf("pnlmath: trade amounts must be non-negative")
	}

	firstBuy := prior.FirstBuyTs

	if t.IsBuy {
		spent.Add(spent, usdl)
		bought.Add(bought, tok)
		holdings.Add(holdings, tok)
		// avgCostBasis = totalUsdlSpent * WAD / totalTokensBought (truncating).
		if bought.Sign() > 0 {
			num := new(big.Int).Mul(spent, wad)
			avgCost = num.Quo(num, bought)
		}
		if firstBuy == nil {
			ts := t.Ts
			firstBuy = &ts
		}
	} else {
		// costOfSold = avgCostBasis * tokenAmount / WAD (USDL raw).
		costOfSold := new(big.Int).Mul(avgCost, tok)
		costOfSold.Quo(costOfSold, wad)
		// realizedPnl += proceeds - costOfSold (signed).
		gain := new(big.Int).Sub(usdl, costOfSold)
		realized.Add(realized, gain)

		received.Add(received, usdl)
		sold.Add(sold, tok)
		holdings.Sub(holdings, tok)
		if holdings.Sign() < 0 {
			holdings.SetInt64(0)
		}
	}

	lastTrade := prior.LastTradeTs
	if t.Ts > lastTrade {
		lastTrade = t.Ts
	}

	return Position{
		TotalUsdlSpent:    spent.String(),
		TotalTokensBought: bought.String(),
		TotalUsdlReceived: received.String(),
		TotalTokensSold:   sold.String(),
		AvgCostBasis:      avgCost.String(),
		CurrentHoldings:   holdings.String(),
		RealizedPnlUsdl:   realized.String(),
		FirstBuyTs:        firstBuy,
		LastTradeTs:       lastTrade,
		TradeCount:        prior.TradeCount + 1,
	}, nil
}

// HoldingValue returns priceWad * holdings / WAD — the mark-to-market USDL value
// of a token balance. Empty inputs (or a zero price) yield "0".
func HoldingValue(priceWad, holdings string) (string, error) {
	price, err := parse("priceWad", priceWad)
	if err != nil {
		return "", err
	}
	h, err := parse("currentHoldings", holdings)
	if err != nil {
		return "", err
	}
	if price.Sign() == 0 || h.Sign() == 0 {
		return "0", nil
	}
	v := new(big.Int).Mul(price, h)
	return v.Quo(v, wad).String(), nil
}

// TotalPnl returns the signed total PnL in USDL raw:
// realizedPnlUsdl + (unrealizedMark - remainingCost), where
// unrealizedMark = priceWad*holdings/WAD and remainingCost = avgCostBasis*holdings/WAD.
// A nil/empty priceWad marks the position purely on realised PnL.
func TotalPnl(realizedPnlUsdl, avgCostBasis, holdings, priceWad string) (string, error) {
	realized, err := parse("realizedPnlUsdl", realizedPnlUsdl)
	if err != nil {
		return "", err
	}
	avg, err := parse("avgCostBasis", avgCostBasis)
	if err != nil {
		return "", err
	}
	h, err := parse("currentHoldings", holdings)
	if err != nil {
		return "", err
	}
	price, err := parse("priceWad", priceWad)
	if err != nil {
		return "", err
	}

	unrealized := new(big.Int)
	if price.Sign() != 0 && h.Sign() != 0 {
		unrealized.Mul(price, h)
		unrealized.Quo(unrealized, wad)
	}
	remainingCost := new(big.Int)
	if avg.Sign() != 0 && h.Sign() != 0 {
		remainingCost.Mul(avg, h)
		remainingCost.Quo(remainingCost, wad)
	}

	total := new(big.Int).Add(realized, new(big.Int).Sub(unrealized, remainingCost))
	return total.String(), nil
}
