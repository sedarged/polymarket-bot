import { EventEmitter } from 'events';
import { WebSocketClient, WebSocketState } from './websocket';
import { logger } from '../utils/logger';
import {
  WSUserMessage,
  WSUserOrder,
  WSUserFill,
} from '@polymarket/shared';
import { config } from '../config';
import type { Wallet } from '@ethersproject/wallet';
import { ClobClient } from '@polymarket/clob-client';
import { assertLiveTradingEnabled } from '../utils/liveTrading';

/**
 * User Feed WebSocket Client
 * 
 * Official Documentation: https://docs.polymarket.com/developers/CLOB/websocket/user-channel
 * WebSocket URL: wss://ws-subscriptions-clob.polymarket.com/ws/user
 * 
 * Provides real-time user-specific updates via WebSocket connection with:
 * - Real-time order updates (creation, partial fills, completion, cancellation)
 * - Real-time fill/trade notifications
 * - Automatic reconnection with exponential backoff
 * - State resync after connection loss
 * - Subscription management for specific markets
 * 
 * Authentication:
 * User channel requires CLOB API credentials (key, secret, passphrase) which are
 * derived from the wallet's private key using the Polymarket SDK.
 * 
 * Security:
 * - Requires valid private key (same gates as TradingClient)
 * - Only works with live trading enabled
 * - Credentials never logged or exposed
 * 
 * Message Types:
 * - Order events: order creation, updates, partial fills, completion, cancellation
 * - Fill events: trade executions with price, size, and fee details
 * 
 * @see {@link https://docs.polymarket.com/developers/CLOB/websocket/user-channel}
 * @see {@link https://docs.polymarket.com/developers/CLOB/websocket/wss-auth}
 */
export interface UserFeedOptions {
  wallet: Wallet;
  marketIds?: string[]; // Optional: specific markets to subscribe to
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  wsUrl?: string; // Optional: override WebSocket URL for testing
}

/**
 * Authentication message for user WebSocket channel
 */
interface UserAuthMessage {
  type: 'USER';
  apikey: string;
  secret: string;
  passphrase: string;
  markets?: string[];
}

/**
 * Subscription control message
 */
interface UserSubscriptionMessage {
  type: 'USER';
  operation: 'subscribe' | 'unsubscribe';
  markets: string[];
}

export class UserFeedClient extends EventEmitter {
  private wsClient: WebSocketClient | null = null;
  private wallet: Wallet;
  private clobClient: ClobClient;
  private marketIds: Set<string>; // Use Set to prevent duplicates
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private wsUrl?: string; // Optional WebSocket URL override
  // Track authentication state
  private isAuthenticated: boolean = false;
  // Message deduplication: Track processed message IDs
  private processedMessageIds: Set<string> = new Set();
  private readonly MESSAGE_ID_CACHE_SIZE = 10000;

  constructor(options: UserFeedOptions) {
    super();
    
    // Enforce live trading gate - user feed requires real credentials
    assertLiveTradingEnabled();
    
    this.wallet = options.wallet;
    this.marketIds = new Set(options.marketIds || []);
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
    this.wsUrl = options.wsUrl; // Store optional URL override

    // Initialize CLOB client for API credential generation
    this.clobClient = new ClobClient(
      config.clobApiUrl,
      config.chainId,
      this.wallet
    );

    logger.info('UserFeedClient initialized', {
      address: this.wallet.address,
      marketCount: this.marketIds.size,
    });
  }

  /**
   * Connect to the user WebSocket channel
   * Returns a promise that resolves when connected and authenticated
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.wsClient) {
        logger.warn('User feed WebSocket already exists');
        resolve();
        return;
      }

      // User WebSocket URL pattern (use override if provided, otherwise derive from config)
      const wsUserUrl = this.wsUrl || config.wsMarketUrl.replace('/ws/market', '/ws/user');
      logger.info('Connecting to user feed WebSocket', { url: wsUserUrl });

      this.wsClient = new WebSocketClient({
        url: wsUserUrl,
        feedType: 'user', // Specify user feed type for metrics
        reconnectDelay: this.reconnectDelay,
        maxReconnectDelay: this.maxReconnectDelay,
      });

      // Set up one-time handlers for connection result
      const onConnected = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        this.off('connected', onConnected);
        this.off('error', onError);
      };

      this.once('connected', onConnected);
      this.once('error', onError);

      this.setupEventHandlers();
      this.wsClient.connect();
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.wsClient) {
      return;
    }

    this.wsClient.on('open', async () => {
      logger.info('User feed WebSocket opened');
      try {
        await this.authenticate();
        this.emit('connected');
      } catch (error) {
        logger.error('User feed authentication failed on open', {
          error: error instanceof Error ? error.message : String(error),
        });
        const err = error instanceof Error ? error : new Error(String(error));
        this.emit('error', err);
        // Close the WebSocket to avoid leaving the client in an unclear state
        if (this.wsClient) {
          this.wsClient.close();
        }
      }
    });

    this.wsClient.on('message', (message: unknown) => {
      this.handleMessage(message as WSUserMessage);
    });

    this.wsClient.on('close', () => {
      logger.info('User feed WebSocket closed');
      this.isAuthenticated = false;
      this.emit('disconnected');
    });

    this.wsClient.on('error', (error: Error) => {
      logger.error('User feed WebSocket error', { error: error.message });
      this.emit('error', error);
    });

    this.wsClient.on('reconnected', () => {
      logger.info('User feed WebSocket reconnected, reauthenticating');
      this.isAuthenticated = false;
      this.authenticate().catch((error) => {
        logger.error('Failed to reauthenticate after reconnect', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  /**
   * Authenticate with the user WebSocket channel
   * 
   * The Polymarket user WebSocket requires CLOB API credentials which are
   * derived from the wallet's private key using the SDK's createOrDeriveApiKey() method.
   * This method performs L1 authentication (wallet signature) to obtain L2 credentials
   * (key, secret, passphrase) for WebSocket and API access.
   */
  private async authenticate(): Promise<void> {
    if (!this.wsClient) {
      throw new Error('WebSocket client not initialized');
    }

    try {
      // Derive API credentials from wallet using L1 authentication
      // This creates or retrieves existing credentials for the wallet
      logger.debug('Deriving API credentials for user WebSocket', {
        address: this.wallet.address,
      });

      const credentials = await this.clobClient.createOrDeriveApiKey();

      const authMessage: UserAuthMessage = {
        type: 'USER',
        apikey: credentials.key,
        secret: credentials.secret,
        passphrase: credentials.passphrase,
        markets: this.marketIds.size > 0 ? Array.from(this.marketIds) : undefined,
      };

      this.wsClient.send(authMessage);
      this.isAuthenticated = true;

      logger.info('User feed authenticated', {
        address: this.wallet.address,
        marketCount: this.marketIds.size,
      });
    } catch (error) {
      logger.error('Failed to authenticate user feed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Subscribe to additional markets
   */
  async subscribe(marketIds: string[]): Promise<void> {
    if (!this.wsClient || !this.isAuthenticated) {
      throw new Error('WebSocket not connected or not authenticated');
    }

    // Filter out already subscribed markets
    const newMarkets = marketIds.filter((id) => !this.marketIds.has(id));
    if (newMarkets.length === 0) {
      logger.debug('All markets already subscribed');
      return;
    }

    const message: UserSubscriptionMessage = {
      type: 'USER',
      operation: 'subscribe',
      markets: newMarkets,
    };

    this.wsClient.send(message);
    newMarkets.forEach((id) => this.marketIds.add(id));

    logger.info('Subscribed to markets', { marketIds: newMarkets });
  }

  /**
   * Unsubscribe from markets
   */
  async unsubscribe(marketIds: string[]): Promise<void> {
    if (!this.wsClient || !this.isAuthenticated) {
      throw new Error('WebSocket not connected or not authenticated');
    }

    const message: UserSubscriptionMessage = {
      type: 'USER',
      operation: 'unsubscribe',
      markets: marketIds,
    };

    this.wsClient.send(message);
    marketIds.forEach((id) => this.marketIds.delete(id));

    logger.info('Unsubscribed from markets', { marketIds });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: WSUserMessage): void {
    try {
      // Message deduplication
      const messageId = this.getMessageId(message);
      if (this.processedMessageIds.has(messageId)) {
        logger.debug('Duplicate message detected, skipping', { messageId });
        return;
      }

      // Add to processed set with size limit
      this.processedMessageIds.add(messageId);
      if (this.processedMessageIds.size > this.MESSAGE_ID_CACHE_SIZE) {
        // Remove oldest entries (first added)
        const firstId = this.processedMessageIds.values().next().value;
        if (firstId !== undefined) {
          this.processedMessageIds.delete(firstId);
        }
      }

      // Route message to appropriate handler
      if (message.event_type === 'order') {
        this.handleOrderEvent(message);
      } else if (message.event_type === 'fill') {
        this.handleFillEvent(message);
      } else {
        logger.warn('Unknown user message type', { message });
      }
    } catch (error) {
      logger.error('Error handling user feed message', {
        error: error instanceof Error ? error.message : String(error),
        message,
      });
    }
  }

  /**
   * Generate unique message ID for deduplication
   * Includes all relevant fields that change between updates to ensure uniqueness
   */
  private getMessageId(message: WSUserMessage): string {
    if (message.event_type === 'order') {
      // Include size_matched and price to distinguish between legitimate updates
      return `order-${message.order_id}-${message.status}-${message.size_matched}-${message.price}-${message.created_at}`;
    } else if (message.event_type === 'fill') {
      // Fill IDs are unique by themselves
      return `fill-${message.fill_id}-${message.timestamp}`;
    }
    return `unknown-${Date.now()}`;
  }

  /**
   * Handle order events
   */
  private handleOrderEvent(event: WSUserOrder): void {
    logger.info('User order event received', {
      orderId: event.order_id,
      clientOrderId: event.client_order_id,
      assetId: event.asset_id,
      status: event.status,
      sizeMatched: event.size_matched,
    });

    this.emit('order', event);
  }

  /**
   * Handle fill events
   */
  private handleFillEvent(event: WSUserFill): void {
    logger.info('User fill event received', {
      fillId: event.fill_id,
      orderId: event.order_id,
      assetId: event.asset_id,
      price: event.price,
      size: event.size,
      fee: event.fee,
    });

    this.emit('fill', event);
  }

  /**
   * Disconnect from the user WebSocket
   */
  disconnect(): void {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
      this.isAuthenticated = false;
      logger.info('User feed WebSocket disconnected');
    }
  }

  /**
   * Get connection state
   */
  getState(): WebSocketState {
    return this.wsClient?.getState() ?? WebSocketState.DISCONNECTED;
  }

  /**
   * Check if authenticated
   */
  isAuthenticatedState(): boolean {
    return this.isAuthenticated;
  }
}
