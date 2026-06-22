// Package queue wraps hibiken/asynq (Redis-backed) for the background job
// system, replacing the Node-specific BullMQ (D3/L12). Producers and consumers
// for a given queue move to Go together. Queue names come from the shared
// constants package.
package queue

import (
	"fmt"

	"github.com/hibiken/asynq"
)

// DefaultConcurrency mirrors the TS BullMQ worker default.
const DefaultConcurrency = 5

// ParseRedisConn turns a redis:// URL into an asynq RedisConnOpt.
func ParseRedisConn(redisURL string) (asynq.RedisConnOpt, error) {
	opt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return nil, fmt.Errorf("queue: parse redis uri: %w", err)
	}
	return opt, nil
}

// NewClient builds an asynq client for enqueuing tasks.
func NewClient(redisURL string) (*asynq.Client, error) {
	opt, err := ParseRedisConn(redisURL)
	if err != nil {
		return nil, err
	}
	return asynq.NewClient(opt), nil
}

// NewInspector builds an asynq inspector (queue introspection / metrics).
func NewInspector(redisURL string) (*asynq.Inspector, error) {
	opt, err := ParseRedisConn(redisURL)
	if err != nil {
		return nil, err
	}
	return asynq.NewInspector(opt), nil
}

// ServerOptions configures NewServer.
type ServerOptions struct {
	// Concurrency caps in-flight tasks. Zero uses DefaultConcurrency.
	Concurrency int
	// Queues maps queue name -> priority weight. Empty uses the default queue.
	Queues map[string]int
}

// NewServer builds an asynq server (the worker) with bounded concurrency
// (backpressure, invariant i11).
func NewServer(redisURL string, opts ServerOptions) (*asynq.Server, error) {
	opt, err := ParseRedisConn(redisURL)
	if err != nil {
		return nil, err
	}
	concurrency := opts.Concurrency
	if concurrency <= 0 {
		concurrency = DefaultConcurrency
	}
	cfg := asynq.Config{Concurrency: concurrency}
	if len(opts.Queues) > 0 {
		cfg.Queues = opts.Queues
	}
	return asynq.NewServer(opt, cfg), nil
}
