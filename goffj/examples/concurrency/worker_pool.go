// goffj/examples/concurrency/worker_pool.go
//
// Worker Pool Pattern — Bounded Concurrency in Go
// =================================================
//
// Run this example:
//   go run goffj/examples/concurrency/worker_pool.go
//
// The worker pool pattern solves a fundamental concurrency problem:
// "How do I process N items concurrently without spawning N goroutines?"
//
// Spawning one goroutine per item is fine for small N, but with thousands
// of items it becomes expensive (each goroutine uses ~2KB stack by default).
// A fixed-size pool reuses a bounded set of goroutines.
//
// Visual model:
//
//   Submitter           Workers (goroutines)         Results
//   ─────────          ──────────────────────       ────────
//   job1 ──┐           ┌── worker1 ──────────┐      result1
//   job2 ──┤  channel  │   worker2 ──────────┤      result2
//   job3 ──┼──────────►│   worker3 ──────────┼─────►result3
//   ...    │  (buffer) │   worker4 ──────────┤      ...
//   jobN ──┘           └── worker5 ──────────┘
//
// Key Go concepts:
//   - Buffered channels as work queues
//   - sync.WaitGroup for coordinating goroutine completion
//   - Context for cancellation propagation
//   - Closing channels to signal "no more work"

package main

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Job represents a unit of work to be processed by the pool.
type Job struct {
	ID       int
	Payload  string
	Priority int // Higher = more important (informational here; for priority queues see heap)
}

// Result holds the outcome of a processed Job.
type Result struct {
	JobID    int
	Output   string
	Error    error
	Duration time.Duration
}

// WorkerPool manages a fixed set of goroutines processing jobs from a queue.
type WorkerPool struct {
	jobs    chan Job    // Buffered channel acting as the work queue
	results chan Result // Channel through which workers send results back
	wg      sync.WaitGroup
	size    int
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Pool implementation
// ─────────────────────────────────────────────────────────────────────────────

// NewWorkerPool creates a pool of `size` goroutines with a job queue of `queueSize`.
//
// Choose queueSize based on:
//   - Small (e.g., size*2): backpressure — submitter blocks when workers are busy
//   - Large (e.g., 1000): buffering — submitter rarely blocks
func NewWorkerPool(ctx context.Context, size, queueSize int) *WorkerPool {
	p := &WorkerPool{
		jobs:    make(chan Job, queueSize),
		results: make(chan Result, queueSize),
		size:    size,
	}

	// Start worker goroutines. Each runs until the jobs channel is closed.
	for i := 0; i < size; i++ {
		workerID := i + 1
		p.wg.Add(1)

		go func(id int) {
			defer p.wg.Done()
			p.worker(ctx, id)
		}(workerID)
	}

	// Drain the results channel after all workers finish
	go func() {
		p.wg.Wait()       // Wait for all workers to complete their current job
		close(p.results)  // Signal to results consumers: no more results
	}()

	return p
}

// worker is the function each goroutine runs. It reads from the jobs channel
// until it's closed, or until the context is cancelled.
func (p *WorkerPool) worker(ctx context.Context, id int) {
	for {
		select {
		// Context cancelled: the caller wants us to stop
		case <-ctx.Done():
			fmt.Printf("  worker-%d: context cancelled, stopping\n", id)
			return

		// A job is available: process it
		case job, ok := <-p.jobs:
			if !ok {
				// Channel closed: no more work, worker exits cleanly
				fmt.Printf("  worker-%d: job queue closed, exiting\n", id)
				return
			}

			start := time.Now()
			output, err := processJob(job)
			elapsed := time.Since(start)

			fmt.Printf("  worker-%d processed job-%d in %v\n", id, job.ID, elapsed)

			// Send result (non-blocking if results buffer is full, we'd block here)
			p.results <- Result{
				JobID:    job.ID,
				Output:   output,
				Error:    err,
				Duration: elapsed,
			}
		}
	}
}

// processJob simulates doing real work: parsing, API calls, transformations, etc.
// Replace this with your actual business logic.
func processJob(job Job) (string, error) {
	// Simulate variable work duration (10–100ms)
	time.Sleep(time.Duration(10+rand.Intn(90)) * time.Millisecond)

	if strings.Contains(job.Payload, "fail") {
		return "", fmt.Errorf("job-%d: simulated error for payload %q", job.ID, job.Payload)
	}

	return fmt.Sprintf("processed: %s", strings.ToUpper(job.Payload)), nil
}

// Submit adds a job to the queue. Blocks if the queue is full (backpressure).
// Returns false if the context was cancelled before the job could be queued.
func (p *WorkerPool) Submit(ctx context.Context, job Job) bool {
	select {
	case p.jobs <- job:
		return true
	case <-ctx.Done():
		return false
	}
}

// Close signals that no more jobs will be submitted.
// Workers will finish their current job and exit.
// Must be called after all Submit calls, before ranging over Results().
func (p *WorkerPool) Close() {
	close(p.jobs)
}

// Results returns the channel for reading processed results.
// Range over this until the channel is closed:
//
//	for result := range pool.Results() { ... }
func (p *WorkerPool) Results() <-chan Result {
	return p.results
}

// ─────────────────────────────────────────────────────────────────────────────
// Fan-out / Fan-in
// ─────────────────────────────────────────────────────────────────────────────
// Fan-out: one channel feeds multiple goroutines (the pool above does this).
// Fan-in:  multiple channels merge into one. Useful when you have separate
//          streams of results and want to process them in a single loop.

// merge combines multiple result channels into one.
// Each input channel runs in its own goroutine, forwarding to the output.
// The output channel closes when ALL input channels are exhausted.
func merge(channels ...<-chan Result) <-chan Result {
	out := make(chan Result, 10)
	var wg sync.WaitGroup

	// forward reads from one channel into out
	forward := func(ch <-chan Result) {
		defer wg.Done()
		for r := range ch {
			out <- r
		}
	}

	wg.Add(len(channels))
	for _, ch := range channels {
		go forward(ch)
	}

	// Close out once all forwarders are done
	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter using time.Ticker
// ─────────────────────────────────────────────────────────────────────────────
// A Ticker fires at regular intervals. By requiring workers to "take a tick"
// before processing each job, we control throughput.

// rateLimitedSubmit submits jobs at a maximum rate of `perSecond` jobs/second.
// This prevents overwhelming downstream services (databases, external APIs).
func rateLimitedSubmit(ctx context.Context, pool *WorkerPool, jobs []Job, perSecond int) {
	// Ticker fires every 1/perSecond seconds
	interval := time.Second / time.Duration(perSecond)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for _, job := range jobs {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pool.Submit(ctx, job)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

func main() {
	fmt.Println("╔══════════════════════════════════════════╗")
	fmt.Println("║    Worker Pool Pattern Demo (Go)         ║")
	fmt.Println("╚══════════════════════════════════════════╝")
	fmt.Println()

	// Context with a 5-second timeout: the entire demo must finish in 5s
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Create a pool of 5 workers, queue capacity 20
	const numWorkers = 5
	const numJobs = 20
	pool := NewWorkerPool(ctx, numWorkers, numJobs)

	fmt.Printf("Started pool with %d workers\n", numWorkers)
	fmt.Printf("Submitting %d jobs...\n\n", numJobs)

	// Build jobs (one of them will fail to show error handling)
	jobs := make([]Job, numJobs)
	for i := range jobs {
		payload := fmt.Sprintf("data-chunk-%d", i)
		if i == 7 {
			payload = "fail-intentionally" // trigger error in processJob
		}
		jobs[i] = Job{ID: i + 1, Payload: payload, Priority: rand.Intn(10)}
	}

	// Submit all jobs using rate limiter (10 jobs/second max)
	go func() {
		rateLimitedSubmit(ctx, pool, jobs, 10)
		pool.Close() // No more jobs — workers will drain and exit
	}()

	// Collect results
	var (
		succeeded int
		failed    int
		totalTime time.Duration
	)

	for result := range pool.Results() {
		if result.Error != nil {
			fmt.Printf("  ✗ job-%d FAILED: %v\n", result.JobID, result.Error)
			failed++
		} else {
			fmt.Printf("  ✓ job-%d → %q (%v)\n", result.JobID, result.Output, result.Duration)
			succeeded++
		}
		totalTime += result.Duration
	}

	fmt.Println()
	fmt.Println("─── Summary ────────────────────────────────")
	fmt.Printf("  Jobs submitted : %d\n", numJobs)
	fmt.Printf("  Succeeded      : %d\n", succeeded)
	fmt.Printf("  Failed         : %d\n", failed)
	fmt.Printf("  Total CPU time : %v\n", totalTime)
	fmt.Printf("  Workers        : %d\n", numWorkers)
	fmt.Printf("  Speedup (est.) : ~%.1fx vs sequential\n", float64(totalTime)/float64(totalTime/time.Duration(numWorkers)))
	fmt.Println("────────────────────────────────────────────")

	// Demo: fan-in merge
	fmt.Println("\n─── Fan-in Demo ────────────────────────────")
	ch1 := make(chan Result, 2)
	ch2 := make(chan Result, 2)
	merged := merge(ch1, ch2)

	ch1 <- Result{JobID: 100, Output: "from-stream-A"}
	ch2 <- Result{JobID: 200, Output: "from-stream-B"}
	ch1 <- Result{JobID: 101, Output: "also-from-stream-A"}
	close(ch1)
	close(ch2)

	for r := range merged {
		fmt.Printf("  merged result: job-%d → %s\n", r.JobID, r.Output)
	}
}
