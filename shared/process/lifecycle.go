// Package process provides graceful-shutdown lifecycle handling, porting the TS
// shared registerProcessHandlers (shared/src/process/lifecycle.ts): on SIGTERM/
// SIGINT (or parent context cancellation) it runs the shutdown hook bounded by a
// timeout, so in-flight work drains before exit (invariant i7).
package process

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// DefaultTimeout matches the TS default (SH-2: raised from 10s to 30s).
const DefaultTimeout = 30 * time.Second

// ShutdownFunc drains in-flight work and closes resources. The context carries
// the shutdown deadline.
type ShutdownFunc func(context.Context) error

// Options configures Run.
type Options struct {
	// Logger is required; nil disables logging.
	Logger *slog.Logger
	// OnShutdown is invoked once a shutdown trigger fires. Required.
	OnShutdown ShutdownFunc
	// Timeout bounds OnShutdown. Zero uses DefaultTimeout.
	Timeout time.Duration
	// Signals overrides the default trigger set (SIGTERM, SIGINT).
	Signals []os.Signal
}

func (o Options) timeout() time.Duration {
	if o.Timeout <= 0 {
		return DefaultTimeout
	}
	return o.Timeout
}

func (o Options) signals() []os.Signal {
	if len(o.Signals) == 0 {
		return []os.Signal{syscall.SIGTERM, syscall.SIGINT}
	}
	return o.Signals
}

// Run blocks until a shutdown signal is received or ctx is cancelled, then runs
// OnShutdown under a timeout-bounded context. It returns the shutdown hook's
// error, or context.DeadlineExceeded if the hook overruns the timeout. Run never
// calls os.Exit, leaving the exit code to the caller (testable).
func Run(ctx context.Context, opts Options) error {
	sigCtx, stop := signal.NotifyContext(ctx, opts.signals()...)
	defer stop()

	<-sigCtx.Done()
	if opts.Logger != nil {
		opts.Logger.Info("received shutdown trigger, draining")
	}

	shutCtx, cancel := context.WithTimeout(context.Background(), opts.timeout())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- opts.OnShutdown(shutCtx) }()

	select {
	case err := <-done:
		if opts.Logger != nil {
			if err != nil {
				opts.Logger.Error("error during shutdown", slog.Any("err", err))
			} else {
				opts.Logger.Info("graceful shutdown complete")
			}
		}
		return err
	case <-shutCtx.Done():
		if opts.Logger != nil {
			opts.Logger.Error("graceful shutdown timed out")
		}
		return shutCtx.Err()
	}
}
