// Package chain wraps go-ethereum's ethclient with primary+fallback RPC
// failover and the Paxeer network config, porting shared/src/chain. Contract
// handles (chain/contracts.go) bind the protocol/ abigen bindings.
package chain

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/ethclient"
)

// NetworkConfig describes an EVM network (parity with TS paxeerNetwork).
type NetworkConfig struct {
	ChainID        int64
	Name           string
	NativeName     string
	NativeSymbol   string
	NativeDecimals int
}

// PaxeerNetwork is the Paxeer Network chain config (chain id 125).
var PaxeerNetwork = NetworkConfig{
	ChainID:        125,
	Name:           "Paxeer Network",
	NativeName:     "PAXEER",
	NativeSymbol:   "PAX",
	NativeDecimals: 18,
}

// Client is an ethclient with optional fallback RPC. Read calls try the primary
// first and transparently fail over to the fallback on error (resilience —
// SECTION 17).
type Client struct {
	primary  *ethclient.Client
	fallback *ethclient.Client
}

// NewClient dials the primary RPC and, if provided, the fallback RPC.
func NewClient(ctx context.Context, rpcURL, fallbackURL string) (*Client, error) {
	if rpcURL == "" {
		return nil, fmt.Errorf("chain: rpc url is required")
	}
	p, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("chain: dial primary: %w", err)
	}
	c := &Client{primary: p}
	if fallbackURL != "" {
		f, err := ethclient.DialContext(ctx, fallbackURL)
		if err != nil {
			p.Close()
			return nil, fmt.Errorf("chain: dial fallback: %w", err)
		}
		c.fallback = f
	}
	return c, nil
}

// Eth returns the underlying primary ethclient for advanced use (e.g. log
// filtering in the indexer).
func (c *Client) Eth() *ethclient.Client { return c.primary }

// Close releases both RPC connections.
func (c *Client) Close() {
	c.primary.Close()
	if c.fallback != nil {
		c.fallback.Close()
	}
}

// ChainID returns the network's EVM chain id (failover-aware).
func (c *Client) ChainID(ctx context.Context) (*big.Int, error) {
	return callWithFailover(c, func(e *ethclient.Client) (*big.Int, error) {
		return e.ChainID(ctx)
	})
}

// BlockNumber returns the latest block height (failover-aware).
func (c *Client) BlockNumber(ctx context.Context) (uint64, error) {
	return callWithFailover(c, func(e *ethclient.Client) (uint64, error) {
		return e.BlockNumber(ctx)
	})
}

// callWithFailover runs fn against the primary client; on error it retries the
// fallback (when configured). A free generic function because Go methods may not
// declare their own type parameters.
func callWithFailover[T any](c *Client, fn func(*ethclient.Client) (T, error)) (T, error) {
	v, err := fn(c.primary)
	if err != nil && c.fallback != nil {
		return fn(c.fallback)
	}
	return v, err
}
