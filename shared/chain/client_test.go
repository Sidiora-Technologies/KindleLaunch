package chain

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// rpcServer is a minimal JSON-RPC responder: it maps method -> result hex.
func rpcServer(t *testing.T, results map[string]string, failAll bool) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failAll {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		var method string
		for m := range results {
			if strings.Contains(s, `"`+m+`"`) {
				method = m
				break
			}
		}
		w.Header().Set("Content-Type", "application/json")
		if method == "" {
			_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method not found"}}`)
			return
		}
		_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":"`+results[method]+`"}`)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestPaxeerNetworkConfig(t *testing.T) {
	t.Parallel()
	if PaxeerNetwork.ChainID != 125 || PaxeerNetwork.NativeSymbol != "PAX" || PaxeerNetwork.NativeDecimals != 18 {
		t.Errorf("PaxeerNetwork = %+v", PaxeerNetwork)
	}
}

func TestNewClientRequiresURL(t *testing.T) {
	t.Parallel()
	if _, err := NewClient(context.Background(), "", ""); err == nil {
		t.Fatal("empty rpc url should error")
	}
}

func TestChainIDAndBlockNumber(t *testing.T) {
	t.Parallel()
	srv := rpcServer(t, map[string]string{
		"eth_chainId":     "0x7d",  // 125
		"eth_blockNumber": "0x1a4", // 420
	}, false)

	c, err := NewClient(context.Background(), srv.URL, "")
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer c.Close()

	id, err := c.ChainID(context.Background())
	if err != nil || id.Int64() != 125 {
		t.Fatalf("ChainID = %v, err %v", id, err)
	}
	bn, err := c.BlockNumber(context.Background())
	if err != nil || bn != 420 {
		t.Fatalf("BlockNumber = %d, err %v", bn, err)
	}
}

func TestFailoverToSecondary(t *testing.T) {
	t.Parallel()
	primary := rpcServer(t, nil, true) // always 500
	fallback := rpcServer(t, map[string]string{"eth_chainId": "0x7d"}, false)

	c, err := NewClient(context.Background(), primary.URL, fallback.URL)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer c.Close()

	id, err := c.ChainID(context.Background())
	if err != nil || id.Int64() != 125 {
		t.Fatalf("failover ChainID = %v, err %v", id, err)
	}
}

func TestEthAccessor(t *testing.T) {
	t.Parallel()
	srv := rpcServer(t, map[string]string{"eth_chainId": "0x7d"}, false)
	c, err := NewClient(context.Background(), srv.URL, "")
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if c.Eth() == nil {
		t.Fatal("Eth() returned nil")
	}
}
