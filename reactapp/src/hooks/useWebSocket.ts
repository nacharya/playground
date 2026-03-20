// reactapp/src/hooks/useWebSocket.ts
// ====================================
// Custom hook for real-time WebSocket communication with the tsnode PubSub server.
//
// Features:
//   - Automatic reconnect with exponential backoff
//   - Topic-based subscriptions (pub/sub pattern)
//   - Typed message protocol matching tsnode/src/ws/server.ts
//   - Connection state machine: idle → connecting → connected → reconnecting
//   - Cleanup on unmount (no zombie connections)
//
// Usage:
//   const { publish, subscribe, connectionState } = useWebSocket("ws://localhost:8507");

import { useEffect, useRef, useCallback, useState } from "react";

// ── Message protocol — must match tsnode/src/ws/server.ts ─────────────────────

type ServerMessage =
  | { type: "connected"; clientId: string }
  | { type: "subscribed"; topic: string }
  | { type: "unsubscribed"; topic: string }
  | { type: "message"; topic: string; data: unknown; publisherId: string }
  | { type: "error"; message: string }
  | { type: "pong" };

type ClientMessage =
  | { type: "subscribe"; topic: string }
  | { type: "unsubscribe"; topic: string }
  | { type: "publish"; topic: string; data: unknown }
  | { type: "ping" };

// ── Connection state ──────────────────────────────────────────────────────────

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseWebSocketOptions {
  /** Automatically reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Initial reconnect delay in ms (doubles each attempt, max 30s) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (0 = unlimited) */
  maxRetries?: number;
}

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  clientId: string | null;
  /** Publish a message to a topic */
  publish: (topic: string, data: unknown) => void;
  /** Subscribe to a topic — returns an unsubscribe function */
  subscribe: (topic: string) => () => void;
  /** Manually close the connection */
  close: () => void;
  /** Listen for messages on a specific topic */
  onMessage: (topic: string, handler: (data: unknown) => void) => () => void;
}

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { autoReconnect = true, reconnectDelay = 1000, maxRetries = 0 } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [clientId, setClientId] = useState<string | null>(null);

  // Refs don't cause re-renders — use for mutable state that shouldn't trigger renders
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Topic → set of handlers. Using ref so handlers don't need to be in deps.
  const handlersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    setConnectionState((prev) => (prev === "idle" ? "connecting" : "reconnecting"));

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      retryCountRef.current = 0;
      setConnectionState("connected");
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (!isMountedRef.current) return;

      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        console.warn("[WS] Received non-JSON message:", event.data);
        return;
      }

      switch (msg.type) {
        case "connected":
          setClientId(msg.clientId);
          break;

        case "message": {
          // Dispatch to all handlers registered for this topic
          const topicHandlers = handlersRef.current.get(msg.topic);
          topicHandlers?.forEach((h) => h(msg.data));
          break;
        }

        case "pong":
          // Heartbeat acknowledged — connection is alive
          break;

        case "error":
          console.error("[WS] Server error:", msg.message);
          break;
      }
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setConnectionState("closed");
      setClientId(null);

      if (!autoReconnect) return;
      if (maxRetries > 0 && retryCountRef.current >= maxRetries) {
        console.warn("[WS] Max retries reached — giving up");
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, … up to 30s
      const delay = Math.min(reconnectDelay * 2 ** retryCountRef.current, 30_000);
      retryCountRef.current++;
      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${retryCountRef.current})`);

      retryTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) connect();
      }, delay);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
  }, [url, autoReconnect, reconnectDelay, maxRetries]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      // Close cleanly — won't trigger reconnect because isMounted is false
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Public API ──────────────────────────────────────────────────────────────

  const publish = useCallback(
    (topic: string, data: unknown) => {
      send({ type: "publish", topic, data });
    },
    [send]
  );

  const subscribe = useCallback(
    (topic: string) => {
      send({ type: "subscribe", topic });
      return () => {
        send({ type: "unsubscribe", topic });
      };
    },
    [send]
  );

  const onMessage = useCallback((topic: string, handler: (data: unknown) => void) => {
    if (!handlersRef.current.has(topic)) {
      handlersRef.current.set(topic, new Set());
    }
    handlersRef.current.get(topic)!.add(handler);

    // Return cleanup function
    return () => {
      handlersRef.current.get(topic)?.delete(handler);
    };
  }, []);

  const close = useCallback(() => {
    isMountedRef.current = false;
    wsRef.current?.close();
  }, []);

  return { connectionState, clientId, publish, subscribe, close, onMessage };
}

// ── useTopicSubscription — convenience hook for subscribing to a topic ────────
//
// Usage:
//   const messages = useTopicSubscription("ws://localhost:8507", "tasks:updates");

export function useTopicSubscription<T = unknown>(
  url: string,
  topic: string
): { messages: T[]; connectionState: ConnectionState } {
  const [messages, setMessages] = useState<T[]>([]);
  const { connectionState, subscribe, onMessage } = useWebSocket(url);

  useEffect(() => {
    // Subscribe to the topic when connected
    if (connectionState !== "connected") return;

    const unsubscribe = subscribe(topic);

    // Register message handler
    const removeHandler = onMessage(topic, (data) => {
      setMessages((prev) => [...prev.slice(-99), data as T]); // keep last 100
    });

    return () => {
      unsubscribe();
      removeHandler();
    };
  }, [connectionState, topic, subscribe, onMessage]);

  return { messages, connectionState };
}
