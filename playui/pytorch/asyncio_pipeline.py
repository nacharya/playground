"""
AsyncIO Patterns for Data Pipelines
=====================================

This module demonstrates idiomatic asyncio patterns for building
high-throughput data pipelines in Python.

Patterns covered:
  1. Producer/Consumer with asyncio.Queue
  2. asyncio.gather() for concurrent fetching
  3. asyncio.Semaphore for rate limiting
  4. Async context managers (__aenter__ / __aexit__)
  5. Async generators (async def ... yield)
  6. asyncio.TaskGroup (Python 3.11+) for structured concurrency
  7. aiohttp session pooling (simulated with httpx)

The pipeline simulates:
  Producer → [Queue] → Processor → [Queue] → Consumer/Writer

Run:
  python playui/pytorch/asyncio_pipeline.py --producers 3 --items 20 --rate-limit 5
"""

import argparse
import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncGenerator, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d [%(levelname)-8s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("asyncio_pipeline")


# ─────────────────────────────────────────────────────────────────────────────
# Data types
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RawItem:
    """A raw data item fresh from the producer."""
    id: int
    source: str
    payload: str
    produced_at: float = field(default_factory=time.monotonic)


@dataclass
class ProcessedItem:
    """A processed item with enriched data."""
    id: int
    source: str
    result: str
    processing_time_ms: float


# ─────────────────────────────────────────────────────────────────────────────
# Rate Limiter using asyncio.Semaphore
# ─────────────────────────────────────────────────────────────────────────────

class RateLimiter:
    """
    Token bucket rate limiter using asyncio.Semaphore.

    asyncio.Semaphore(n) allows at most `n` concurrent coroutines in a section.
    Here we refill the "bucket" on a timer so it limits rate over time, not
    just peak concurrency.

    Usage:
      limiter = RateLimiter(max_rate=5)  # 5 operations/second
      async with limiter:
          await do_work()
    """

    def __init__(self, max_rate: int) -> None:
        self._rate = max_rate
        self._sem = asyncio.Semaphore(max_rate)
        self._refill_task: Optional[asyncio.Task] = None  # type: ignore[type-arg]

    async def __aenter__(self) -> "RateLimiter":
        # Async context manager: __aenter__ is awaited on entry
        await self._sem.acquire()
        return self

    async def __aexit__(self, *args: object) -> None:
        # Release semaphore after a 1/rate second delay to enforce rate
        interval = 1.0 / self._rate
        await asyncio.sleep(interval)
        self._sem.release()


# ─────────────────────────────────────────────────────────────────────────────
# Async Generator — Data Producer
# ─────────────────────────────────────────────────────────────────────────────

async def data_producer(
    producer_id: int,
    n_items: int,
    queue: "asyncio.Queue[Optional[RawItem]]",
    limiter: RateLimiter,
) -> None:
    """
    Produces n_items and puts them into the queue.

    Async generators (async def + yield) allow lazy production of data.
    Here we use a helper generator and feed its output into a queue.

    asyncio.Queue is the async equivalent of queue.Queue for thread-safe
    communication — except it coordinates coroutines, not threads.
    """
    async def generate_items() -> AsyncGenerator[RawItem, None]:
        """
        Async generator that yields items one at a time.
        The `yield` suspends this coroutine and hands the value to the caller.
        Callers use `async for item in generate_items()` to iterate.
        """
        for i in range(n_items):
            # Simulate variable-latency data source (e.g., reading from S3)
            await asyncio.sleep(random.uniform(0.01, 0.05))
            yield RawItem(
                id=producer_id * 1000 + i,
                source=f"producer-{producer_id}",
                payload=f"data-chunk-{producer_id}-{i}",
            )

    async for item in generate_items():
        async with limiter:  # Respect rate limit before putting to queue
            await queue.put(item)
            log.info("Producer %d: queued item %d", producer_id, item.id)

    log.info("Producer %d: finished", producer_id)


# ─────────────────────────────────────────────────────────────────────────────
# Data Processor
# ─────────────────────────────────────────────────────────────────────────────

async def data_processor(
    worker_id: int,
    input_queue: "asyncio.Queue[Optional[RawItem]]",
    output_queue: "asyncio.Queue[Optional[ProcessedItem]]",
) -> None:
    """
    Consumes from input_queue, processes, puts to output_queue.

    The None sentinel value signals "no more items" — a common pattern
    for graceful shutdown of producer/consumer pipelines.
    """
    while True:
        item = await input_queue.get()  # Await blocks until an item is available

        if item is None:
            # Poison pill: re-enqueue for other workers, then exit
            await input_queue.put(None)
            log.info("Processor worker-%d: received shutdown signal", worker_id)
            break

        start = time.monotonic()

        # Simulate CPU/IO work (e.g., parsing, enrichment, model inference)
        await asyncio.sleep(random.uniform(0.02, 0.1))
        result = item.payload.upper().replace("-", "_")  # Simplified "processing"

        elapsed_ms = (time.monotonic() - start) * 1000
        processed = ProcessedItem(
            id=item.id,
            source=item.source,
            result=result,
            processing_time_ms=elapsed_ms,
        )

        await output_queue.put(processed)
        input_queue.task_done()  # Signal that this item is fully handled

        log.info(
            "Processor worker-%d: processed item %d in %.1fms",
            worker_id, item.id, elapsed_ms,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Data Consumer / Writer
# ─────────────────────────────────────────────────────────────────────────────

async def data_consumer(
    output_queue: "asyncio.Queue[Optional[ProcessedItem]]",
    results: list[ProcessedItem],
) -> None:
    """
    Drains the output queue and collects results.

    In production this would write to a database, S3, Kafka, etc.
    Using asyncio file I/O:
      async with aiofiles.open("output.jsonl", "w") as f:
          await f.write(json.dumps(item.__dict__) + "\\n")
    """
    while True:
        item = await output_queue.get()

        if item is None:
            log.info("Consumer: received shutdown signal, stopping")
            break

        results.append(item)
        log.info("Consumer: stored item %d (result=%s)", item.id, item.result[:20])


# ─────────────────────────────────────────────────────────────────────────────
# asyncio.gather — Concurrent Fetching
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_metadata(item_id: int) -> dict:
    """
    Simulates fetching metadata from an external API.

    asyncio.gather() runs multiple coroutines concurrently and waits for all.
    If these were real HTTP calls, they'd all fly in parallel — one event loop
    iteration per response, zero threads needed.
    """
    await asyncio.sleep(random.uniform(0.01, 0.05))  # Simulated I/O
    return {"item_id": item_id, "metadata": f"meta-{item_id}", "fetched_at": datetime.utcnow().isoformat()}


async def batch_fetch(item_ids: list[int]) -> list[dict]:
    """
    Fetch metadata for multiple items concurrently using asyncio.gather().

    Sequential: would take sum(all_delays)
    Concurrent: takes max(all_delays) — huge speedup for I/O-bound work
    """
    # gather() takes coroutines (not Tasks) and runs them concurrently
    results = await asyncio.gather(*(fetch_metadata(id) for id in item_ids))
    return list(results)


# ─────────────────────────────────────────────────────────────────────────────
# Main Pipeline
# ─────────────────────────────────────────────────────────────────────────────

async def run_pipeline(
    n_producers: int,
    n_items_each: int,
    rate_limit: int,
    n_processors: int = 3,
) -> list[ProcessedItem]:
    """
    Assemble and run the full pipeline:

      [Producer 1] ──┐
      [Producer 2] ──┤──► [raw_queue] ──► [Processor 1] ──┐
      [Producer N] ──┘                    [Processor 2] ──┤──► [out_queue] ──► [Consumer]
                                          [Processor N] ──┘

    asyncio.TaskGroup (Python 3.11+) ensures all tasks in the group are
    awaited and any exception cancels the entire group (structured concurrency).
    """
    raw_queue: asyncio.Queue[Optional[RawItem]] = asyncio.Queue(maxsize=50)
    out_queue: asyncio.Queue[Optional[ProcessedItem]] = asyncio.Queue(maxsize=50)
    results: list[ProcessedItem] = []
    limiter = RateLimiter(max_rate=rate_limit)

    log.info("Pipeline starting: %d producers, %d items each, rate=%d/s, %d processors",
             n_producers, n_items_each, rate_limit, n_processors)

    # ── Demo: concurrent batch fetch ─────────────────────────────────────
    log.info("Demo: fetching metadata for 10 items concurrently...")
    t0 = time.monotonic()
    metadata = await batch_fetch(list(range(10)))
    elapsed = (time.monotonic() - t0) * 1000
    log.info("Fetched %d metadata records in %.0fms (concurrent)", len(metadata), elapsed)

    # ── Start all pipeline stages concurrently ────────────────────────────
    async with asyncio.TaskGroup() as tg:
        # Producers
        producer_tasks = [
            tg.create_task(
                data_producer(pid + 1, n_items_each, raw_queue, limiter),
                name=f"producer-{pid+1}",
            )
            for pid in range(n_producers)
        ]

        # Processors
        processor_tasks = [
            tg.create_task(
                data_processor(wid + 1, raw_queue, out_queue),
                name=f"processor-{wid+1}",
            )
            for wid in range(n_processors)
        ]

        # Consumer
        consumer_task = tg.create_task(
            data_consumer(out_queue, results),
            name="consumer",
        )

        # Wait for all producers to finish, then signal processors to stop
        # We do this by awaiting all producer tasks WITHIN the TaskGroup
        # and sending shutdown signals after they're done.
        # Note: TaskGroup awaits all tasks; we use a coordination coroutine.

        async def coordinate() -> None:
            # Wait for all producers
            await asyncio.gather(*producer_tasks)
            # Send one poison pill — processors re-enqueue it so all get it
            await raw_queue.put(None)
            # Wait for all processors to drain the raw queue
            await asyncio.gather(*processor_tasks)
            # Signal consumer to stop
            await out_queue.put(None)

        tg.create_task(coordinate(), name="coordinator")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# CLI Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="AsyncIO pipeline demo")
    parser.add_argument("--producers",   type=int, default=2,  help="Number of producer coroutines")
    parser.add_argument("--items",       type=int, default=10, help="Items per producer")
    parser.add_argument("--rate-limit",  type=int, default=5,  help="Max items/second into queue")
    args = parser.parse_args()

    t0 = time.monotonic()
    results = asyncio.run(
        run_pipeline(
            n_producers=args.producers,
            n_items_each=args.items,
            rate_limit=args.rate_limit,
        )
    )
    total = time.monotonic() - t0

    print(f"\n{'─'*50}")
    print(f"Pipeline complete: {len(results)} items processed in {total:.2f}s")
    print(f"Throughput: {len(results)/total:.1f} items/second")
    print(f"{'─'*50}")
    for item in results[:5]:
        print(f"  [{item.id}] {item.result} ({item.processing_time_ms:.0f}ms)")
    if len(results) > 5:
        print(f"  ... and {len(results)-5} more")


if __name__ == "__main__":
    main()
