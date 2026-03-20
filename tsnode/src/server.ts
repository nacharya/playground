/**
 * tsnode/src/server.ts — Main Entry Point
 * =========================================
 *
 * This server exposes the same domain operations over three different protocols:
 *   1. Express + tRPC  (port 8506) — type-safe HTTP API
 *   2. WebSocket       (port 8507) — real-time pub/sub messaging
 *   3. gRPC            (port 8513) — binary protocol, HTTP/2
 *
 * Architecture pattern: "Protocol Adapters"
 *   The domain logic (in-memory store, business rules) lives in one place.
 *   Each protocol adapter (tRPC, WS, gRPC) translates between the wire format
 *   and the domain layer. This is an application of the Ports & Adapters (Hexagonal)
 *   architecture — keep the core pure, adapt at the edges.
 *
 * Concurrency model:
 *   Node.js is single-threaded but non-blocking. All three servers share one
 *   process and one event loop. I/O operations yield to the event loop instead
 *   of blocking, so thousands of concurrent connections work fine.
 *
 * Graceful shutdown:
 *   SIGTERM/SIGINT signal handling ensures in-flight requests complete before
 *   the process exits. This is critical in Kubernetes/Docker environments.
 */

import * as http from "http";
import * as os from "os";
import express from "express";
import pino from "pino";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./trpc/router";
import { createPubSubServer } from "./ws/server";
import { startGRPCServer } from "./grpc/server";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const config = {
  httpPort:  parseInt(process.env["PORT"]       ?? "8506"),
  wsPort:    parseInt(process.env["WS_PORT"]    ?? "8507"),
  grpcPort:  parseInt(process.env["GRPC_PORT"]  ?? "8513"),
  goffjUrl:  process.env["GOFFJ_API_URL"]       ?? "http://localhost:8500",
  jwtSecret: process.env["JWT_SECRET"]          ?? "dev-secret-change-in-prod",
  nodeEnv:   process.env["NODE_ENV"]            ?? "development",
};

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

// Pino is ~5x faster than console.log / winston for structured logging.
// It writes JSON by default (machine-parseable for log aggregators).
const log = pino({
  level: config.nodeEnv === "production" ? "info" : "debug",
  transport: config.nodeEnv !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

// ─────────────────────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check — used by Docker healthcheck and Kubernetes probes
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "tsnode",
    version: "1.0.0",
    hostname: os.hostname(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    config: {
      httpPort: config.httpPort,
      wsPort:   config.wsPort,
      grpcPort: config.grpcPort,
      goffjUrl: config.goffjUrl,
    },
  });
});

// tRPC middleware — mounts the entire tRPC router at /trpc
// All tRPC procedures are accessible via POST /trpc/{procedureName}
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    // createContext is called on every request — use it to extract JWT, etc.
    createContext: ({ req }) => ({
      req,
      authHeader: req.headers["authorization"],
      goffjUrl: config.goffjUrl,
    }),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP server (wraps Express, shared with WebSocket upgrade)
// ─────────────────────────────────────────────────────────────────────────────

// We create an explicit http.Server so we can attach both Express (HTTP) and
// ws (WebSocket) to the same port — WebSocket upgrades are handled via 'upgrade' event.
const httpServer = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────────────
// Start all three servers
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Start HTTP (Express + tRPC)
  await new Promise<void>((resolve) => {
    httpServer.listen(config.httpPort, () => {
      log.info({ port: config.httpPort }, "HTTP/tRPC server started");
      resolve();
    });
  });

  // 2. Start WebSocket server (separate port for clarity)
  const pubSub = createPubSubServer(config.wsPort, log);
  log.info({ port: config.wsPort }, "WebSocket pub/sub server started");

  // 3. Start gRPC server
  await startGRPCServer(config.grpcPort, log);
  log.info({ port: config.grpcPort }, "gRPC server started");

  log.info(
    `\n  ┌─────────────────────────────────────────┐\n` +
    `  │  tsnode playground server running         │\n` +
    `  │                                           │\n` +
    `  │  HTTP/tRPC  → http://localhost:${config.httpPort}    │\n` +
    `  │  WebSocket  → ws://localhost:${config.wsPort}      │\n` +
    `  │  gRPC       → localhost:${config.grpcPort}          │\n` +
    `  └─────────────────────────────────────────┘`
  );

  // Make pubSub available to tRPC for broadcasting mutation events
  // (In production, use dependency injection instead of module globals)
  (global as Record<string, unknown>)["pubSub"] = pubSub;
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
// Docker/Kubernetes sends SIGTERM when stopping a container.
// We close servers gracefully so in-flight requests complete.

function shutdown(signal: string): void {
  log.info({ signal }, "Shutdown signal received");

  httpServer.close(() => {
    log.info("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    log.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ─────────────────────────────────────────────────────────────────────────────
// Unhandled error safety nets
// ─────────────────────────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  log.error({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

main().catch((err) => {
  log.error({ err }, "Failed to start server");
  process.exit(1);
});
