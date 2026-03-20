// goffj/examples/channels/pipeline.go
//
// Channel Pipeline Pattern — Composable Concurrency
// ==================================================
//
// Run this example:
//   go run goffj/examples/channels/pipeline.go
//
// The pipeline pattern connects a series of processing stages using channels.
// Each stage is a function that:
//   1. Receives values from an input channel
//   2. Transforms or filters them
//   3. Sends results to an output channel
//   4. Runs in its own goroutine
//
// This is Go's idiomatic answer to Unix pipes (ls | grep | awk | sort).
// Just like Unix pipes, Go pipelines compose naturally:
//
//   nums := generate(1, 2, 3, ... 20)
//   squared := square(nums)
//   filtered := filter(squared, func(n int) bool { return n > 50 })
//   results := collect(filtered)
//
// Key Go concepts:
//   - Direction-typed channels: <-chan (receive-only), chan<- (send-only)
//   - The "done" pattern for cancellation (before context.Context)
//   - select for non-blocking operations with timeouts
//   - Semaphore pattern using buffered channels
//   - Merge/multiplexer: fan-in from multiple channels

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Generator (Source)
// ─────────────────────────────────────────────────────────────────────────────
// A generator converts a variadic list into a channel stream.
// The caller gets a receive-only channel — they can't accidentally send to it.
//
// Pattern: "Convert boring data into a channel" — enables lazy evaluation.
// The goroutine sends values lazily; if the consumer is slow, the sender blocks.

func generate(done <-chan struct{}, nums ...int) <-chan int {
	out := make(chan int)

	go func() {
		defer close(out) // Always close the output when done sending

		for _, n := range nums {
			select {
			case out <- n: // Send value downstream
			case <-done: // Cancelled — exit cleanly without leaking goroutine
				return
			}
		}
	}()

	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Transform (Square)
// ─────────────────────────────────────────────────────────────────────────────
// Each stage takes a receive-only channel and returns a new one.
// This "plumbing" model makes stages reusable and testable in isolation.

func square(done <-chan struct{}, in <-chan int) <-chan int {
	out := make(chan int)

	go func() {
		defer close(out)

		for n := range in { // range over channel — loops until channel closes
			select {
			case out <- n * n:
			case <-done:
				return
			}
		}
	}()

	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Filter
// ─────────────────────────────────────────────────────────────────────────────
// A generic filter stage takes a predicate function.
// In Go 1.18+, this could be filter[T any](pred func(T) bool) — but we keep
// it concrete here for clarity.

func filter(done <-chan struct{}, in <-chan int, pred func(int) bool) <-chan int {
	out := make(chan int)

	go func() {
		defer close(out)

		for n := range in {
			if pred(n) { // Only forward values that pass the predicate
				select {
				case out <- n:
				case <-done:
					return
				}
			}
		}
	}()

	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: Sink (Collect)
// ─────────────────────────────────────────────────────────────────────────────
// The sink stage collects all channel values into a slice.
// Unlike source/transform stages, it returns a value (not a channel).
// This is where the pipeline "terminates" and we get concrete data back.

func collect(in <-chan int) []int {
	var results []int
	for n := range in { // Drains channel until closed
		results = append(results, n)
	}
	return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Select with Timeout
// ─────────────────────────────────────────────────────────────────────────────
// select is like a switch statement for channel operations.
// It blocks until ONE of its cases can proceed, then executes that case.
//
// time.After(d) returns a channel that receives after duration d.
// Combined with select, it creates non-blocking operations with timeouts.

func readWithTimeout(ch <-chan int, timeout time.Duration) (int, bool) {
	select {
	case v := <-ch:
		// Value available — read it immediately
		return v, true

	case <-time.After(timeout):
		// No value arrived within the timeout window
		fmt.Printf("  Timeout after %v waiting for value\n", timeout)
		return 0, false
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge (Fan-in)
// ─────────────────────────────────────────────────────────────────────────────
// Fan-in is the opposite of fan-out: multiple input channels → one output.
// Use case: you have parallel workers each producing results on their own
// channel, and you want to process results in a single loop.
//
// Implementation: start one goroutine per input channel, each forwarding
// to the output. A WaitGroup tracks when all inputs are exhausted.

func merge(done <-chan struct{}, channels ...<-chan int) <-chan int {
	out := make(chan int)
	var wg sync.WaitGroup

	// forward drains one channel into out
	forward := func(ch <-chan int) {
		defer wg.Done()
		for n := range ch {
			select {
			case out <- n:
			case <-done:
				return
			}
		}
	}

	wg.Add(len(channels))
	for _, ch := range channels {
		go forward(ch)
	}

	// Close out once all inputs are drained
	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Semaphore using a Buffered Channel
// ─────────────────────────────────────────────────────────────────────────────
// A semaphore limits concurrent access to a resource.
// A buffered channel of capacity N acts as a semaphore:
//   - "Acquire" = send to channel (blocks when full = N goroutines running)
//   - "Release" = receive from channel (makes room for another goroutine)
//
// This is used to limit concurrency without a full worker pool.
// Simpler than sync.Semaphore for many use cases.

type Semaphore chan struct{}

// NewSemaphore creates a semaphore allowing `n` concurrent holders.
func NewSemaphore(n int) Semaphore {
	return make(Semaphore, n)
}

// Acquire blocks until a slot is available (sends an empty struct).
func (s Semaphore) Acquire() { s <- struct{}{} }

// Release frees a slot (receives from the channel).
func (s Semaphore) Release() { <-s }

// limitedConcurrent demonstrates the semaphore: process N jobs but
// allow at most `concurrency` to run simultaneously.
func limitedConcurrent(jobs []int, concurrency int) []int {
	sem := NewSemaphore(concurrency)
	results := make([]int, len(jobs))
	var wg sync.WaitGroup

	for i, job := range jobs {
		wg.Add(1)
		go func(idx, j int) {
			defer wg.Done()

			sem.Acquire()         // Block until a slot is free
			defer sem.Release()   // Always release, even on panic

			// Simulate work
			time.Sleep(time.Duration(rand.Intn(50)) * time.Millisecond)
			results[idx] = j * j
		}(i, job)
	}

	wg.Wait()
	return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

func main() {
	fmt.Println("╔══════════════════════════════════════════╗")
	fmt.Println("║    Channel Pipeline Pattern Demo (Go)    ║")
	fmt.Println("╚══════════════════════════════════════════╝")

	// ── Demo 1: Basic Pipeline ─────────────────────────────────────────────
	fmt.Println("\n── 1. Basic Pipeline: generate → square → filter → collect")

	done := make(chan struct{}) // Cancellation signal
	defer close(done)

	nums := generate(done, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
	squared := square(done, nums)
	bigOnes := filter(done, squared, func(n int) bool { return n > 25 })
	result := collect(bigOnes)

	fmt.Printf("   Numbers 1..10 → squared → filter(>25): %v\n", result)

	// ── Demo 2: Select with Timeout ────────────────────────────────────────
	fmt.Println("\n── 2. Select with Timeout")

	slowCh := make(chan int, 1)
	go func() {
		time.Sleep(200 * time.Millisecond) // Slow producer
		slowCh <- 42
	}()

	// Try to read with a 50ms timeout — will timeout
	if v, ok := readWithTimeout(slowCh, 50*time.Millisecond); ok {
		fmt.Printf("   Got value: %d\n", v)
	}

	// Try again with a 300ms timeout — will succeed this time
	go func() {
		time.Sleep(100 * time.Millisecond)
		slowCh <- 99
	}()
	if v, ok := readWithTimeout(slowCh, 300*time.Millisecond); ok {
		fmt.Printf("   Got value after wait: %d\n", v)
	}

	// ── Demo 3: Fan-in (Merge) ─────────────────────────────────────────────
	fmt.Println("\n── 3. Fan-in: Merge 3 parallel streams")

	done2 := make(chan struct{})
	defer close(done2)

	// Three independent generators running concurrently
	stream1 := generate(done2, 1, 4, 7)
	stream2 := generate(done2, 2, 5, 8)
	stream3 := generate(done2, 3, 6, 9)

	// Merge all three into one — order is non-deterministic (goroutines race)
	merged := merge(done2, stream1, stream2, stream3)
	mergedResult := collect(merged)
	fmt.Printf("   Merged (order non-deterministic): %v\n", mergedResult)

	// ── Demo 4: Semaphore ─────────────────────────────────────────────────
	fmt.Println("\n── 4. Semaphore: limit concurrency to 3")

	jobs := make([]int, 10)
	for i := range jobs {
		jobs[i] = i + 1
	}
	semResults := limitedConcurrent(jobs, 3) // Max 3 goroutines at a time
	fmt.Printf("   Results (1²..10²): %v\n", semResults)

	// ── Demo 5: Early Cancellation ────────────────────────────────────────
	fmt.Println("\n── 5. Pipeline cancellation via done channel")

	cancelDone := make(chan struct{})
	bigNums := generate(cancelDone, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)

	var partial []int
	for n := range bigNums {
		partial = append(partial, n)
		if n == 5 {
			close(cancelDone) // Cancel after reading 5
			break
		}
	}
	fmt.Printf("   Read %d values before cancellation: %v\n", len(partial), partial)

	fmt.Println("\n✓ All pipeline demos complete")
}
