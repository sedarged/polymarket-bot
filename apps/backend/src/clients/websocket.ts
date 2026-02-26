import WebSocket from "ws";
import { EventEmitter } from "events";
import { logger } from "../utils/logger";
import {
  websocketState,
  websocketReconnects,
  websocketMessages,
  websocketErrors,
  websocketUptime,
} from "../utils/metrics";

export interface WebSocketClientOptions {
  url: string;
  feedType?: string; // For metrics: "market" or "user"
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectBackoffMultiplier?: number;
  reconnectJitter?: number;
  /** Max reconnect attempts before giving up (Research §9.3). Default 10. After this, "maxReconnectsReached" is emitted and alert sent. */
  maxReconnectAttempts?: number;
  /** Heartbeat ping interval in milliseconds. Default 30000 (30s). Configurable via WS_HEARTBEAT_INTERVAL_MS (GAP-005). */
  heartbeatIntervalMs?: number;
}

export enum WebSocketState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  CLOSED = "closed",
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private reconnectBackoffMultiplier: number;
  private reconnectJitter: number;
  private currentReconnectDelay: number;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private shouldReconnect: boolean = true;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectedAt: number | null = null;
  private feedType: string = "market"; // default feed type for metrics
  
  // DI-002: Heartbeat/ping-pong to detect silent connection loss
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS: number; // configurable via WS_HEARTBEAT_INTERVAL_MS (GAP-005)
  private readonly HEARTBEAT_TIMEOUT_MS = 5000; // 5 seconds

  constructor(options: WebSocketClientOptions) {
    super();
    this.url = options.url;
    this.feedType = options.feedType ?? "market"; // Default to "market" for backward compatibility
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
    this.reconnectBackoffMultiplier = options.reconnectBackoffMultiplier ?? 2;
    this.reconnectJitter = options.reconnectJitter ?? 0.1;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10; // Research §9.3
    this.HEARTBEAT_INTERVAL_MS = options.heartbeatIntervalMs ?? 30000; // GAP-005
    this.currentReconnectDelay = this.reconnectDelay;
  }

  /** Exposed for tests: assert maxReconnectAttempts wiring from MarketFeedClient. */
  getMaxReconnectAttemptsForTesting(): number {
    return this.maxReconnectAttempts;
  }

  /**
   * Update metrics when state changes
   */
  private updateStateMetrics(newState: WebSocketState): void {
    this.state = newState;

    // Map state to numeric value for Prometheus gauge
    const stateValue = {
      [WebSocketState.DISCONNECTED]: 0,
      [WebSocketState.CONNECTING]: 1,
      [WebSocketState.CONNECTED]: 2,
      [WebSocketState.RECONNECTING]: 3,
      [WebSocketState.CLOSED]: 4,
    }[newState];

    websocketState.set({ feed_type: this.feedType }, stateValue);

    // Track connection uptime
    if (newState === WebSocketState.CONNECTED) {
      this.connectedAt = Date.now();
    } else if (this.connectedAt !== null) {
      const uptimeSeconds = (Date.now() - this.connectedAt) / 1000;
      websocketUptime.set({ feed_type: this.feedType }, uptimeSeconds);
      this.connectedAt = null;
    }
  }

  connect(): void {
    if (
      this.state === WebSocketState.CONNECTING ||
      this.state === WebSocketState.CONNECTED
    ) {
      logger.debug("WebSocket already connecting or connected", {
        state: this.state,
      });
      return;
    }

    this.updateStateMetrics(WebSocketState.CONNECTING);
    logger.info("Connecting to WebSocket", { url: this.url });

    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      this.updateStateMetrics(WebSocketState.CONNECTED);

      // Record successful reconnection if this was a reconnect attempt
      const wasReconnecting = this.reconnectAttempts > 0;
      this.reconnectAttempts = 0;
      this.currentReconnectDelay = this.reconnectDelay;
      logger.info("WebSocket connected", { url: this.url });

      if (wasReconnecting) {
        websocketReconnects.inc({
          feed_type: this.feedType,
          result: "success",
        });
      }
      
      // DI-002: Start heartbeat monitoring after connection
      this.startHeartbeat();

      this.emit("open");
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        // Record message received
        const messageType = message.type || "unknown";
        websocketMessages.inc({
          feed_type: this.feedType,
          message_type: messageType,
        });

        this.emit("message", message);
      } catch (error) {
        logger.error("Failed to parse WebSocket message", {
          error: error instanceof Error ? error.message : String(error),
          data: data.toString(),
        });
        websocketErrors.inc({
          feed_type: this.feedType,
          error_type: "protocol",
        });
      }
    });
    
    // DI-002: Listen for pong responses to reset heartbeat timeout
    this.ws.on("pong", () => {
      logger.debug("WebSocket pong received", { feedType: this.feedType });
      // Clear timeout - connection is alive
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
    });

    this.ws.on("error", (error: Error) => {
      logger.error("WebSocket error", {
        error: error.message,
        state: this.state,
      });
      websocketErrors.inc({
        feed_type: this.feedType,
        error_type: "connection",
      });
      this.emit("error", error);
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      const reasonStr = reason.toString();
      logger.info("WebSocket closed", {
        code,
        reason: reasonStr,
        state: this.state,
      });

      this.ws = null;
      
      // DI-002: Stop heartbeat monitoring when connection closes
      this.stopHeartbeat();

      // A-016: Clear any existing reconnect timer before potentially scheduling a new one
      // This ensures no timer leaks even if close event fires unexpectedly
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        logger.debug("Cleared reconnect timer on close", { audit: 'A-016' });
      }

      if (this.shouldReconnect && this.state !== WebSocketState.CLOSED) {
        this.scheduleReconnect();
      } else {
        // When explicitly closed or should not reconnect, set to appropriate state
        const newState =
          this.state === WebSocketState.CLOSED
            ? WebSocketState.CLOSED
            : WebSocketState.DISCONNECTED;
        this.updateStateMetrics(newState);
      }

      this.emit("close", code, reasonStr);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.updateStateMetrics(WebSocketState.RECONNECTING);
    this.reconnectAttempts++;

    // Record reconnection attempt
    websocketReconnects.inc({ feed_type: this.feedType, result: "attempt" });

    // Research §9.3: Max N attempts (strict), then critical alert + optional exit.
    // Use >= so we enforce exactly maxReconnectAttempts reconnects (count matches message).
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("WebSocket max reconnect attempts reached - giving up", {
        feedType: this.feedType,
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        research: "§9.3",
      });
      this.shouldReconnect = false;
      this.updateStateMetrics(WebSocketState.DISCONNECTED);
      this.emit("maxReconnectsReached", { feedType: this.feedType, attempts: this.reconnectAttempts });
      // Fire-and-forget critical alert (log failures instead of silently swallowing)
      import("../utils/alerting").then(({ getAlertingService }) => {
        const alerting = getAlertingService();
        if (alerting) {
          alerting.sendAlert({
            severity: "critical",
            title: "WebSocket max reconnects reached",
            message: `Feed ${this.feedType} failed to reconnect after ${this.maxReconnectAttempts} attempts. Bot may need restart.`,
            context: { feedType: this.feedType, attempts: this.reconnectAttempts },
            timestamp: new Date().toISOString(),
            dedupeKey: `ws-max-reconnects-${this.feedType}`,
          }).catch((alertErr: unknown) => {
            // AUDIT FIX: Log alert failures instead of silently swallowing
            logger.error("Failed to send critical alert for max reconnects", {
              feedType: this.feedType,
              error: alertErr instanceof Error ? alertErr.message : String(alertErr),
            });
          });
        }
      }).catch((importErr: unknown) => {
        // AUDIT FIX: Log import failures instead of silently swallowing
        logger.error("Failed to import alerting module for critical alert", {
          feedType: this.feedType,
          error: importErr instanceof Error ? importErr.message : String(importErr),
        });
      });
      return;
    }

    // Calculate delay with exponential backoff and jitter
    const jitter = 1 + (Math.random() * 2 - 1) * this.reconnectJitter;
    const delay = Math.min(
      this.currentReconnectDelay * jitter,
      this.maxReconnectDelay,
    );

    logger.info("Scheduling reconnect", {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay: Math.round(delay),
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      // A-016: Check shouldReconnect before attempting reconnect
      // This prevents reconnect if close() was called after timer fired
      if (!this.shouldReconnect || this.state === WebSocketState.CLOSED) {
        logger.debug("Reconnect cancelled, client is closed");
        return;
      }

      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * this.reconnectBackoffMultiplier,
        this.maxReconnectDelay,
      );
      this.connect();
    }, delay);
  }

  send(data: unknown): void {
    if (this.state !== WebSocketState.CONNECTED || !this.ws) {
      logger.warn("Cannot send message, WebSocket not connected", {
        state: this.state,
      });
      return;
    }

    try {
      const message = typeof data === "string" ? data : JSON.stringify(data);
      this.ws.send(message);
      logger.debug("Sent WebSocket message", { data });
    } catch (error) {
      logger.error("Failed to send WebSocket message", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close the WebSocket connection gracefully
   * Returns a Promise that resolves when the connection is fully closed
   * Implements proper cleanup for Audit Finding A-016 and A-017
   */
  async close(): Promise<void> {
    logger.info("Closing WebSocket client");
    this.shouldReconnect = false;
    this.updateStateMetrics(WebSocketState.CLOSED);

    // A-016: Clear reconnect timer to prevent memory leak
    // Must be done before closing connection to prevent timer firing after close
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      logger.debug("Cleared reconnect timer on explicit close", { audit: 'A-016' });
    }

    // If no active connection, nothing to close
    if (!this.ws) {
      return;
    }

    // Store reference to WebSocket before creating promises
    const ws = this.ws;

    // Create promise to wait for close event
    const closePromise = new Promise<void>((resolve) => {
      if (!ws) {
        resolve();
        return;
      }

      // Set up one-time close handler
      const onClose = () => {
        this.ws = null;
        // Emit 'close' event przez EventEmitter klienta
        this.emit("close");
        resolve();
      };

      // If already closing/closed, resolve immediately
      if (
        ws.readyState === WebSocket.CLOSING ||
        ws.readyState === WebSocket.CLOSED
      ) {
        this.ws = null;
        this.emit("close");
        resolve();
        return;
      }

      // Listen for close event
      ws.once("close", onClose);

      // Initiate close
      try {
        // Remove all event listeners to prevent memory leaks (A-017)
        ws.removeAllListeners();
        // Re-add the close listener we need
        ws.once("close", onClose);
        ws.close();
      } catch (error) {
        // If close() throws, still resolve (connection is gone)
        logger.warn("Error closing WebSocket", {
          error: error instanceof Error ? error.message : String(error),
        });
        this.ws = null;
        this.emit("close");
        resolve();
      }
    });

    // Wait for close with timeout (5 seconds)
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn("WebSocket close timeout, forcing cleanup");
        // Remove the close listener to prevent it from firing later
        ws?.removeAllListeners();
        if (this.ws) {
          try {
            this.ws.terminate();
          } catch {
            // Ignore terminate errors during forced cleanup
          }
          this.ws = null;
        }
        this.emit("close");
        resolve();
      }, 5000);
    });

    // Race between close and timeout
    await Promise.race([closePromise, timeoutPromise]);
  }

  getState(): WebSocketState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED;
  }
  
  /**
   * Start heartbeat monitoring (DI-002: Gap Analysis)
   * Sends periodic ping messages and expects pong responses
   * Reconnects if pong timeout occurs
   */
  private startHeartbeat(): void {
    // Clear any existing heartbeat first
    this.stopHeartbeat();
    
    logger.debug("Starting WebSocket heartbeat", { 
      feedType: this.feedType,
      intervalMs: this.HEARTBEAT_INTERVAL_MS,
      timeoutMs: this.HEARTBEAT_TIMEOUT_MS,
      gap: 'DI-002'
    });
    
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.state !== WebSocketState.CONNECTED) {
        return;
      }
      
      // Send ping
      logger.debug("Sending WebSocket ping", { feedType: this.feedType });
      this.ws.ping();
      
      // Set timeout for pong response
      this.heartbeatTimeout = setTimeout(() => {
        logger.warn("WebSocket pong timeout - connection may be dead", {
          feedType: this.feedType,
          timeoutMs: this.HEARTBEAT_TIMEOUT_MS,
          gap: 'DI-002'
        });
        
        // Force reconnect on pong timeout
        if (this.ws) {
          this.ws.terminate();
        }
      }, this.HEARTBEAT_TIMEOUT_MS);
    }, this.HEARTBEAT_INTERVAL_MS);
    
    // Unref to prevent keeping process alive
    this.heartbeatInterval.unref();
  }
  
  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
    
    logger.debug("Stopped WebSocket heartbeat", { 
      feedType: this.feedType,
      gap: 'DI-002'
    });
  }
}
