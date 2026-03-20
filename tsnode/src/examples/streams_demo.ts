/**
 * Node.js Streams — Efficient I/O
 * ================================
 *
 * Streams process data chunk-by-chunk instead of loading everything into memory.
 * A 10GB CSV can be processed with ~10MB memory using streams.
 *
 * Stream types:
 *   Readable  — source (file, HTTP response, database cursor)
 *   Writable  — sink  (file, HTTP request, stdout)
 *   Transform — both (compression, encryption, parsing, JSON serialization)
 *   Duplex    — simultaneously readable and writable (TCP socket)
 *
 * Key concept: Backpressure
 *   If the consumer is slower than the producer, the buffer fills up.
 *   Node.js signals this by having writable.write() return `false`.
 *   The producer should pause until the 'drain' event fires.
 *   Proper backpressure handling prevents OOM crashes on large files.
 *
 * Run: npx tsx src/examples/streams_demo.ts
 */

import { Transform, TransformCallback, pipeline, Readable, Writable } from "stream";
import { promisify } from "util";
import { EventEmitter } from "events";

const pipelineAsync = promisify(pipeline);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Custom Transform: CSV Parser
// ─────────────────────────────────────────────────────────────────────────────
// A Transform stream takes chunks in, transforms them, pushes chunks out.
// The _transform method is called for each input chunk.

interface CSVRow { [field: string]: string; }

class CSVParser extends Transform {
  /**
   * CSVParser — converts raw CSV text into parsed JavaScript objects.
   *
   * Challenge: chunks don't align with line boundaries.
   * A single chunk might split mid-line. We buffer incomplete lines
   * and only emit complete ones.
   *
   * Input:  Buffer/string chunks of CSV text
   * Output: JavaScript objects (in objectMode)
   */
  private buffer = "";
  private headers: string[] | null = null;

  constructor() {
    super({ readableObjectMode: true }); // output is objects, not buffers
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    // Accumulate data and split on newlines
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split("\n");

    // The last element may be an incomplete line — keep it in the buffer
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!this.headers) {
        // First line is the header row
        this.headers = trimmed.split(",").map(h => h.trim());
      } else {
        // Parse data row into an object
        const values = trimmed.split(",").map(v => v.trim());
        const row: CSVRow = {};
        this.headers.forEach((header, i) => {
          row[header] = values[i] ?? "";
        });
        this.push(row); // Send to next stage in pipeline
      }
    }

    callback(); // Signal: ready for the next chunk
  }

  _flush(callback: TransformCallback): void {
    // Process any remaining data when the input stream ends
    if (this.buffer.trim() && this.headers) {
      const values = this.buffer.trim().split(",").map(v => v.trim());
      const row: CSVRow = {};
      this.headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
      this.push(row);
    }
    callback();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Transform: JSON Lines Serializer
// ─────────────────────────────────────────────────────────────────────────────

class JSONLinesSerializer extends Transform {
  /**
   * Converts JavaScript objects to JSON Lines format (one JSON per line).
   * JSON Lines is better than a JSON array for streaming because each line
   * is independently parseable — you don't need the full file to start processing.
   *
   * Input:  Objects (objectMode)
   * Output: Buffer (JSON string + newline)
   */
  constructor() {
    super({ writableObjectMode: true }); // input is objects
  }

  _transform(obj: unknown, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      const line = JSON.stringify(obj) + "\n";
      this.push(Buffer.from(line, "utf8"));
      callback();
    } catch (err) {
      callback(err as Error); // Propagate errors through the pipeline
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Transform: Batch Collector
// ─────────────────────────────────────────────────────────────────────────────

class BatchCollector<T = unknown> extends Transform {
  /**
   * Collects items into batches before emitting.
   * Useful for bulk database inserts, API batch calls, etc.
   * Emits one array of N items instead of N individual items.
   *
   * Input:  Individual items (objectMode)
   * Output: Arrays of items (objectMode)
   */
  private batch: T[] = [];

  constructor(private readonly size: number) {
    super({ objectMode: true });
  }

  _transform(item: T, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.batch.push(item);
    if (this.batch.length >= this.size) {
      this.push(this.batch); // Emit the full batch
      this.batch = [];       // Reset for next batch
    }
    callback();
  }

  _flush(callback: TransformCallback): void {
    // Don't discard the last partial batch
    if (this.batch.length > 0) {
      this.push(this.batch);
    }
    callback();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Readable: In-memory data source
// ─────────────────────────────────────────────────────────────────────────────

function createCSVReadable(n: number): Readable {
  /**
   * Creates a Readable stream that emits N rows of CSV data.
   *
   * We use the "push" model (Readable constructor with read()):
   *   read() is called when the consumer is ready for more data.
   *   Returning null signals end-of-stream.
   */
  let row = 0;
  const headers = "name,age,city,score\n";

  return new Readable({
    read(_size: number) {
      if (row === 0) {
        this.push(headers); // Push header row first
      }

      if (row >= n) {
        this.push(null); // End of stream
        return;
      }

      const cities = ["NYC", "SF", "Chicago", "Austin", "Seattle"];
      const chunk = `user-${row},${20 + (row % 45)},${cities[row % cities.length]},${(Math.random() * 100).toFixed(1)}\n`;
      this.push(chunk);
      row++;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Writable: Collector sink
// ─────────────────────────────────────────────────────────────────────────────

class CollectorSink<T = unknown> extends Writable {
  readonly items: T[] = [];

  constructor() {
    super({ objectMode: true });
  }

  _write(chunk: T, _encoding: BufferEncoding, callback: () => void): void {
    this.items.push(chunk);
    callback();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Backpressure demonstration
// ─────────────────────────────────────────────────────────────────────────────

function demonstrateBackpressure(): void {
  console.log("\n── Backpressure Demo ──────────────────────────────");
  console.log(
    "When writable.write() returns false, the producer should pause.\n" +
    "Ignoring this causes memory exhaustion on large files.\n"
  );

  const slowSink = new Writable({
    objectMode: true,
    highWaterMark: 3, // Buffer only 3 items before signaling backpressure

    write(chunk, _enc, callback) {
      // Simulate slow consumer (e.g., database insert takes 10ms)
      setTimeout(() => {
        console.log(`  Sink consumed: ${JSON.stringify(chunk)}`);
        callback(); // Call callback when done — signals ready for more
      }, 10);
    },
  });

  // Fast producer: write 10 items rapidly
  let i = 0;

  function writeNext() {
    const canContinue = slowSink.write({ item: i, timestamp: Date.now() });
    i++;

    if (i < 10) {
      if (canContinue) {
        // Sink buffer has room — write immediately
        setImmediate(writeNext);
      } else {
        // Backpressure! Sink buffer is full — wait for 'drain'
        console.log(`  ⚠ Backpressure at item ${i} — waiting for drain...`);
        slowSink.once("drain", () => {
          console.log("  ✓ Drain event — resuming writes");
          writeNext();
        });
      }
    } else {
      slowSink.end();
    }
  }

  writeNext();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Async Iteration with for await...of
// ─────────────────────────────────────────────────────────────────────────────

async function demonstrateAsyncIteration(): Promise<void> {
  console.log("\n── Async Iteration (for await...of) ─────────────────");
  console.log("Node.js Readable streams implement AsyncIterable.\n");

  const source = createCSVReadable(5);
  const parsed = source.pipe(new CSVParser());

  // for await...of works on any AsyncIterable — including streams
  // This is cleaner than registering 'data' event listeners manually
  for await (const row of parsed as AsyncIterable<CSVRow>) {
    console.log("  Row:", row);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     Node.js Streams Demo                 ║");
  console.log("╚══════════════════════════════════════════╝");

  // ── Demo 1: Full pipeline with util.pipeline ──────────────────────────────
  console.log("\n── 1. CSV Pipeline: source → parse → serialize → collect");

  const sink = new CollectorSink<string>();

  // pipeline() chains streams and handles error propagation and cleanup.
  // It's the recommended way to compose streams — don't use .pipe() directly
  // because .pipe() doesn't propagate errors.
  await pipelineAsync(
    createCSVReadable(20),     // Source: 20 rows of CSV
    new CSVParser(),           // Transform: CSV text → objects
    new JSONLinesSerializer(), // Transform: objects → JSON lines
    sink,                      // Sink: collect all output
  );

  console.log(`  Processed ${sink.items.length} JSON lines`);
  console.log("  First 2:", sink.items.slice(0, 2).join("  "));

  // ── Demo 2: Batching ──────────────────────────────────────────────────────
  console.log("\n── 2. Batch Collector: group rows into batches of 5");

  const batchSink = new CollectorSink<CSVRow[]>();
  await pipelineAsync(
    createCSVReadable(15),
    new CSVParser(),
    new BatchCollector<CSVRow>(5),
    batchSink,
  );

  console.log(`  ${batchSink.items.length} batches of up to 5 rows:`);
  batchSink.items.forEach((batch, i) => {
    console.log(`  Batch ${i + 1}: ${batch.length} rows`);
  });

  // ── Demo 3: Async iteration ───────────────────────────────────────────────
  await demonstrateAsyncIteration();

  // ── Demo 4: Backpressure ──────────────────────────────────────────────────
  demonstrateBackpressure();
}

main().catch(console.error);
