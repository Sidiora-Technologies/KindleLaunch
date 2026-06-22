package auth

import (
	"strings"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
)

// VerifyWalletSignature reports whether signature is a valid EIP-191
// (personal_sign) signature of message by address. It mirrors the TS
// verifyWalletSignature (viem verifyMessage): the address comparison is
// case-insensitive and any malformed input yields false rather than an error
// (invariant i4).
func VerifyWalletSignature(address, message, signature string) bool {
	sig, err := hexutil.Decode(signature)
	if err != nil || len(sig) != 65 {
		return false
	}
	// Normalize the recovery id: accept 27/28 (Ethereum) -> 0/1 (secp256k1).
	switch sig[64] {
	case 27, 28:
		sig[64] -= 27
	case 0, 1:
	default:
		return false
	}

	hash := accounts.TextHash([]byte(message))
	pub, err := crypto.SigToPub(hash, sig)
	if err != nil {
		return false
	}
	recovered := crypto.PubkeyToAddress(*pub)
	return strings.EqualFold(recovered.Hex(), strings.TrimSpace(address))
}
