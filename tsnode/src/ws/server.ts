/**
 * tsnode/src/ws/server.ts — WebSocket Pub/Sub Server
 * ====================================================
 *
 * WebSockets provide full-duplex communication: both server and client can
 * send messages at any time without the client needing to poll.
 *
 * This server implements a topic-based pub/sub system:
 *   - Clients subscribe to topics (e.g., "tasks", "users", "realm:corp-azure")
 *   - When data changes (via tRPC mutations), we broadcast to all subscribers
 *   - Room support: each realm gets its own isolated topic namespace
 *
 * Message protocol (all JSON):
 *   Client → Server:
 *     { type: "subscribe",   topic: "tasks" }
 *     { type: "unsubscribe", topic: "tasks" }
 *     { type: "ping" }
 *
 *   Server → Client:
 *     { type: "subscribed",  topic: "tasks" }
 *     { type: "publish",     topic: "tasks", payload: { ... } }
 *     { type: "pong" }
 *     { type: "error",       message: "..." }
 *
 * Key WebSocket lifecycle (Node.js):
 *   'connection' → 'message' → 'close' / 'error'
 *   On 'close': remove client from all subscriptions (prevent memory leak)
 */

import * as http from "http";
import { WebSocket, WebSocketServer } from "ws";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Message types — discriminated union
// ─────────────────────────────────────────────────────────────────────────────
// A discriminated union is a union of object types where each member has a
// unique literal type in a common field (here: "type"). TypeScript uses it to
// narrow the type inside a switch/if block automatically.

type ClientMessage =
  | { type: "subscribe";   topic: string }
  | { type: "unsubscribe"; topic: string }
  | { type: "ping" }
  | { type: "publish";     topic: string; payload: unknown };

type ServerMessage =
  | { type: "subscribed";  topic: string; clientCount: number }
  | { type: "unsubscribed";topic: string }
  | { type: "publish";     topic: string; payload: unknown; timestamp: string }
  | { type: "pong";        timestamp: string }
  | { type: "error";       message: string }
  | { type: "welcome";     clientId: string; topics: string[] };

// ─────────────────────────────────────────────────────────────────────────────
// Client connection state
// ─────────────────────────────────────────────────────────────────────────────

interface ClientConnection {
  id: string;
  ws: WebSocket;
  topics: Set<string>;
  connectedAt: Date;
  lastPing: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// PubSubServer class
// ─────────────────────────────────────────────────────────────────────────────

export class PubSubServer {
  private clients = new Map<string, ClientConnection>();
  private topics  = new Map<string, Set<string>>(); // topic → Set<clientId>
  private wss: WebSocketServer;
  private log: Logger;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(wss: WebSocketServer, log: Logger) {
    this.wss = wss;
    this.log = log;
    this.setupConnectionHandler();
    this.startHeartbeat();
  }

  // ── Connection handler ─────────────────────────────────────────────────────

  private setupConnectionHandler(): void {
    this.wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const client: ClientConnection = {
        id: clientId,
        ws,
        topics: new Set(),
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      this.clients.set(clientId, client);
      this.log.info({ clientId, remoteAddress: req.socket.remoteAddress }, "WebSocket client connected");

      // Send welcome message with available topics
      this.send(client, {
        type: "welcome",
        clientId,
        topics: Array.from(this.topics.keys()),
      });

      // ── Message handler ───────────────────────────────────────────────────
      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as ClientMessage;
          this.handleClientMessage(client, msg);
        } catch {
          this.send(client, { type: "error", message: "Invalid JSON message" });
        }
      });

      // ── Disconnect handler ────────────────────────────────────────────────
      ws.on("close", (code: number, reason: Buffer) => {
        this.removeClient(clientId);
        this.log.info({ clientId, code, reason: reason.toString() }, "WebSocket client disconnected");
      });

      ws.on("error", (err: Error) => {
        this.log.error({ clientId, err }, "WebSocket error");
        this.removeClient(clientId);
      });
    });
  }

  // ── Message routing ────────────────────────────────────────────────────────

  private handleClientMessage(client: ClientConnection, msg: ClientMessage): void {
    switch (msg.type) {
      case "subscribe":
        this.subscribe(client, msg.topic);
        break;

      case "unsubscribe":
        this.unsubscribe(client, msg.topic);
        break;

      case "ping":
        client.lastPing = new Date();
        this.send(client, { type: "pong", timestamp: new Date().toISOString() });
        break;

      case "publish":
        // Allow clients to publish to topics (simple chat/broadcast model)
        this.publish(msg.topic, msg.payload, client.id);
        break;
    }
  }

  // ── Subscription management ────────────────────────────────────────────────

  subscribe(client: ClientConnection, topic: string): void {
    client.topics.add(topic);

    if (!this.topics.has(topic)) this.topics.set(topic, new Set());
    this.topics.get(topic)!.add(client.id);

    const subscriberCount = this.topics.get(topic)!.size;
    this.log.debug({ clientId: client.id, topic, subscriberCount }, "Client subscribed");
    this.send(client, { type: "subscribed", topic, clientCount: subscriberCount });
  }

  unsubscribe(client: ClientConnection, topic: string): void {
    client.topics.delete(topic);
    this.topics.get(topic)?.delete(client.id);
    this.send(client, { type: "unsubscribed", topic });
  }

  // ── Publishing ─────────────────────────────────────────────────────────────

  /**
   * Publish a message to all subscribers of a topic.
   *
   * Called by tRPC mutations to notify WebSocket clients of data changes.
   * Example (in tRPC router):
   *   await mutation;
   *   globalPubSub.publish("tasks", { event: "created", task });
   */
  publish(topic: string, payload: unknown, fromClientId?: string): void {
    const message: ServerMessage = {
      type: "publish",
      topic,
      payload,
      timestamp: new Date().toISOString(),
    };

    const subscribers = this.topics.get(topic) ?? new Set<string>();
    let sent = 0;

    for (const clientId of subscribers) {
      if (clientId === fromClientId) continue; // Don't echo to sender
      const client = this.clients.get(clientId);
      if (client) {
        this.send(client, message);
        sent++;
      }
    }

    this.log.debug({ topic, subscribers: subscribers.size, sent }, "Published to topic");
  }

  /**
   * Broadcast to ALL connected clients regardless of subscriptions.
   * Use for system-wide notifications (maintenance, forced refresh, etc.)
   */
  broadcast(payload: unknown): void {
    const message: ServerMessage = {
      type: "publish",
      topic: "__broadcast__",
      payload,
      timestamp: new Date().toISOString(),
    };
    for (const client of this.clients.values()) {
      this.send(client, message);
    }
  }

  // ── Client cleanup ─────────────────────────────────────────────────────────

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all topic subscriptions
    for (const topic of client.topics) {
      this.topics.get(topic)?.delete(clientId);
    }

    this.clients.delete(clientId);
  }

  // ── Heartbeat — detect dead connections ───────────────────────────────────
  // WebSocket connections can silently die (network timeout, client crash).
  // We ping every 30s and disconnect clients that don't respond within 60s.

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      for (const client of this.clients.values()) {
        const secondsSinceLastPing = (now.getTime() - client.lastPing.getTime()) / 1000;
        if (secondsSinceLastPing > 60) {
          this.log.warn({ clientId: client.id, secondsSinceLastPing }, "Terminating idle WebSocket");
          client.ws.terminate();
          this.removeClient(client.id);
        } else {
          // Send ping — client should respond with pong
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.ping();
          }
        }
      }
    }, 30_000);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private send(client: ClientConnection, message: ServerMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  get connectedCount(): number { return this.clients.size; }

  get topicCount(): number { return this.topics.size; }

  close(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createPubSubServer(port: number, log: Logger): PubSubServer {
  const wss = new WebSocketServer({ port });
  return new PubSubServer(wss, log);
}
