package http

import (
	"context"
	"encoding/binary"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

// ScanResult reports whether a buffer is clean (parity with TS virus-scan.ts).
type ScanResult struct {
	Clean  bool
	Reason string
}

// ScanOptions configures ScanBuffer. Empty Host falls back to $CLAMAV_HOST.
type ScanOptions struct {
	Host    string
	Port    int
	Timeout time.Duration
}

// ScanBuffer scans data via ClamAV's clamd INSTREAM TCP protocol. It is
// best-effort: if clamd is not configured or unreachable, the upload is allowed
// (Clean=true with a reason), matching the TS behaviour.
func ScanBuffer(ctx context.Context, data []byte, opts ScanOptions) ScanResult {
	host := opts.Host
	if host == "" {
		host = os.Getenv("CLAMAV_HOST")
	}
	if host == "" {
		return ScanResult{Clean: true, Reason: "clamav-not-configured"}
	}
	port := opts.Port
	if port == 0 {
		if p, err := strconv.Atoi(os.Getenv("CLAMAV_PORT")); err == nil && p > 0 {
			port = p
		} else {
			port = 3310
		}
	}
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	d := net.Dialer{Timeout: timeout}
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return ScanResult{Clean: true, Reason: "clamav-unreachable"}
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(timeout))

	// INSTREAM: "zINSTREAM\0", then [uint32 BE len][data], then [uint32 0].
	if _, err := conn.Write([]byte("zINSTREAM\x00")); err != nil {
		return ScanResult{Clean: true, Reason: "clamav-unreachable"}
	}
	var sizeHdr [4]byte
	binary.BigEndian.PutUint32(sizeHdr[:], uint32(len(data)))
	if _, err := conn.Write(sizeHdr[:]); err != nil {
		return ScanResult{Clean: true, Reason: "clamav-unreachable"}
	}
	if _, err := conn.Write(data); err != nil {
		return ScanResult{Clean: true, Reason: "clamav-unreachable"}
	}
	var endHdr [4]byte // zero length terminates the stream
	if _, err := conn.Write(endHdr[:]); err != nil {
		return ScanResult{Clean: true, Reason: "clamav-unreachable"}
	}

	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil && n == 0 {
		if ne, ok := err.(net.Error); ok && ne.Timeout() {
			return ScanResult{Clean: true, Reason: "clamav-timeout"}
		}
		return ScanResult{Clean: true, Reason: "clamav-unreachable"}
	}
	resp := strings.TrimRight(strings.TrimSpace(string(buf[:n])), "\x00")
	if strings.Contains(resp, "OK") {
		return ScanResult{Clean: true}
	}
	return ScanResult{Clean: false, Reason: resp}
}
