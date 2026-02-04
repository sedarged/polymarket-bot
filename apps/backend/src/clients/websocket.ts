import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { 
  websocketState, 
  websocketReconnects, 
  websocketMessages, 
  websocketErrors,
  websocketUptime,
} from '../utils/metrics';

export interface WebSocketClientOptions {
  url: string;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectBackoffMultiplier?: number;
  reconnectJitter?: number;
}

export enum WebSocketState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  CLOSED = 'closed',
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
  private shouldReconnect: boolean = true;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectedAt: number | null = null;
  private feedType: string = 'market'; // default feed type for metrics

  constructor(options: WebSocketClientOptions) {
    super();
    this.url = options.url;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
    this.reconnectBackoffMultiplier = options.reconnectBackoffMultiplier ?? 2;
    this.reconnectJitter = options.reconnectJitter ?? 0.1;
    this.currentReconnectDelay = this.reconnectDelay;
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
    if (this.state === WebSocketState.CONNECTING || this.state === WebSocketState.CONNECTED) {
      logger.debug('WebSocket already connecting or connected', { state: this.state });
      return;
    }

    this.updateStateMetrics(WebSocketState.CONNECTING);
    logger.info('Connecting to WebSocket', { url: this.url });

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.updateStateMetrics(WebSocketState.CONNECTED);
      
      // Record successful reconnection if this was a reconnect attempt
      const wasReconnecting = this.reconnectAttempts > 0;
      this.reconnectAttempts = 0;
      this.currentReconnectDelay = this.reconnectDelay;
      logger.info('WebSocket connected', { url: this.url });
      
      if (wasReconnecting) {
        websocketReconnects.inc({ feed_type: this.feedType, result: 'success' });
      }
      
      this.emit('open');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Record message received
        const messageType = message.type || 'unknown';
        websocketMessages.inc({ feed_type: this.feedType, message_type: messageType });
        
        this.emit('message', message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', {
          error: error instanceof Error ? error.message : String(error),
          data: data.toString(),
        });
        websocketErrors.inc({ feed_type: this.feedType, error_type: 'protocol' });
      }
    });

    this.ws.on('error', (error: Error) => {
      logger.error('WebSocket error', {
        error: error.message,
        state: this.state,
      });
      websocketErrors.inc({ feed_type: this.feedType, error_type: 'connection' });
      this.emit('error', error);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString();
      logger.info('WebSocket closed', { code, reason: reasonStr, state: this.state });
      
      this.ws = null;
      
      if (this.shouldReconnect && this.state !== WebSocketState.CLOSED) {
        this.scheduleReconnect();
      } else {
        // When explicitly closed or should not reconnect, set to appropriate state
        const newState = this.state === WebSocketState.CLOSED ? WebSocketState.CLOSED : WebSocketState.DISCONNECTED;
        this.updateStateMetrics(newState);
      }
      
      this.emit('close', code, reasonStr);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.updateStateMetrics(WebSocketState.RECONNECTING);
    this.reconnectAttempts++;
    
    // Record reconnection attempt
    websocketReconnects.inc({ feed_type: this.feedType, result: 'attempt' });

    // Calculate delay with exponential backoff and jitter
    const jitter = 1 + (Math.random() * 2 - 1) * this.reconnectJitter;
    const delay = Math.min(
      this.currentReconnectDelay * jitter,
      this.maxReconnectDelay
    );

    logger.info('Scheduling reconnect', {
      attempt: this.reconnectAttempts,
      delay: Math.round(delay),
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * this.reconnectBackoffMultiplier,
        this.maxReconnectDelay
      );
      this.connect();
    }, delay);
  }

  send(data: unknown): void {
    if (this.state !== WebSocketState.CONNECTED || !this.ws) {
      logger.warn('Cannot send message, WebSocket not connected', { state: this.state });
      return;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
      logger.debug('Sent WebSocket message', { data });
    } catch (error) {
      logger.error('Failed to send WebSocket message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close the WebSocket connection gracefully
   * Returns a Promise that resolves when the connection is fully closed
   * Implements proper cleanup for Audit Finding A-017
   */
  async close(): Promise<void> {
    logger.info('Closing WebSocket client');
    this.shouldReconnect = false;
    this.updateStateMetrics(WebSocketState.CLOSED);

    // Clear reconnect timer first
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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
        resolve();
      };

      // If already closing/closed, resolve immediately
      if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        this.ws = null;
        resolve();
        return;
      }

      // Listen for close event
      ws.once('close', onClose);
      
      // Initiate close
      try {
        // Remove all event listeners to prevent memory leaks (A-017)
        ws.removeAllListeners();
        // Re-add the close listener we need
        ws.once('close', onClose);
        ws.close();
      } catch (error) {
        // If close() throws, still resolve (connection is gone)
        logger.warn('Error closing WebSocket', {
          error: error instanceof Error ? error.message : String(error),
        });
        this.ws = null;
        resolve();
      }
    });

    // Wait for close with timeout (5 seconds)
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn('WebSocket close timeout, forcing cleanup');
        // Remove the close listener to prevent it from firing later
        ws?.removeAllListeners();
        if (this.ws) {
          try {
            this.ws.terminate();
          } catch (error) {
            // Ignore terminate errors
          }
          this.ws = null;
        }
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
}
