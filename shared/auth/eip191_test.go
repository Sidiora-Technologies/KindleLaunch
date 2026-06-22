package auth

import "testing"

// Golden EIP-191 signature produced by viem (privateKeyToAccount.signMessage)
// for the well-known test key 0x59c6...690d.
const (
	goldenAddr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
	goldenMsg  = "Sign in to Sidiora: nonce=12345"
	goldenSig  = "0x5df38481e3af68d125f6c0fbbc719708bb9ebacbdb473ceec2321b55a03e32a500e79921ba9c0eb4b9f84496e17757917db8e5a25d03f00040154a86c44b18851c"
)

func TestVerifyWalletSignatureValid(t *testing.T) {
	t.Parallel()
	if !VerifyWalletSignature(goldenAddr, goldenMsg, goldenSig) {
		t.Fatal("valid signature rejected")
	}
}

func TestVerifyWalletSignatureCaseInsensitiveAddress(t *testing.T) {
	t.Parallel()
	// Lowercased address must still verify (parity with viem's lowercased compare).
	if !VerifyWalletSignature("0x70997970c51812dc3a010c7d01b50e0d17dc79c8", goldenMsg, goldenSig) {
		t.Fatal("lowercased address rejected")
	}
}

func TestVerifyWalletSignatureRejects(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name           string
		addr, msg, sig string
	}{
		{"wrong address", "0x0000000000000000000000000000000000000001", goldenMsg, goldenSig},
		{"tampered message", goldenAddr, goldenMsg + "x", goldenSig},
		{"not hex sig", goldenAddr, goldenMsg, "0xnothex"},
		{"short sig", goldenAddr, goldenMsg, "0x1234"},
		{"empty sig", goldenAddr, goldenMsg, ""},
		{"bad recovery id", goldenAddr, goldenMsg, "0x" + goldenSig[2:128] + "05"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if VerifyWalletSignature(c.addr, c.msg, c.sig) {
				t.Error("expected verification to fail")
			}
		})
	}
}
