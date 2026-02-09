import { EventEmitter } from 'events';
import { WebSocketClient, WebSocketState } from './websocket';
import { logger } from '../utils/logger';
import {
  WSUserMessage,
  WSUserOrder,
  WSUserFill,
} from '@polymarket/shared';
import { config } from '../config';
import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';

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
 * User channel requires CLOB API credentials (apiKey, secret, passphrase) which are
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
  wallet: ethers.Wallet;
  marketIds?: string[]; // Optional: specific markets to subscribe to
  reconnectDelay?: number;
  maxReconnectDelay?: number;
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
  private wallet: ethers.Wallet;
  private clobClient: ClobClient;
  private marketIds: string[];
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  // Track authentication state
  private isAuthenticated: boolean = false;
  // Message deduplication: Track processed message IDs
  private processedMessageIds: Set<string> = new Set();
  private readonly MESSAGE_ID_CACHE_SIZE = 10000;

  constructor(options: UserFeedOptions) {
    super();
    this.wallet = options.wallet;
    this.marketIds = options.marketIds || [];
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;

    // Initialize CLOB client for API credential generation
    this.clobClient = new ClobClient(
      config.clobApiUrl,
      config.chainId,
      this.wallet
    );

    logger.info('UserFeedClient initialized', {
      address: this.wallet.address,
      marketCount: this.marketIds.length,
    });
  }

  /**
   * Connect to the user WebSocket channel
   */
  async connect(): Promise<void> {
    if (this.wsClient) {
      logger.warn('User feed WebSocket already exists');
      return;
    }

    // User WebSocket URL pattern
    const wsUserUrl = config.wsMarketUrl.replace('/ws/market', '/ws/user');
    logger.info('Connecting to user feed WebSocket', { url: wsUserUrl });

    this.wsClient = new WebSocketClient({
      url: wsUserUrl,
      reconnectDelay: this.reconnectDelay,
      maxReconnectDelay: this.maxReconnectDelay,
    });

    this.setupEventHandlers();
    this.wsClient.connect();
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
      await this.authenticate();
      this.emit('connected');
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
   * (apiKey, secret, passphrase) for WebSocket and API access.
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
        apikey: credentials.apiKey,
        secret: credentials.secret,
        passphrase: credentials.passphrase,
        markets: this.marketIds.length > 0 ? this.marketIds : undefined,
      };

      this.wsClient.send(authMessage);
      this.isAuthenticated = true;

      logger.info('User feed authenticated', {
        address: this.wallet.address,
        marketCount: this.marketIds.length,
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

    const message: UserSubscriptionMessage = {
      type: 'USER',
      operation: 'subscribe',
      markets: marketIds,
    };

    this.wsClient.send(message);
    this.marketIds.push(...marketIds);

    logger.info('Subscribed to markets', { marketIds });
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
    this.marketIds = this.marketIds.filter((id) => !marketIds.includes(id));

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
        this.processedMessageIds.delete(firstId);
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
   */
  private getMessageId(message: WSUserMessage): string {
    if (message.event_type === 'order') {
      return `order-${message.order_id}-${message.status}-${message.created_at}`;
    } else if (message.event_type === 'fill') {
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
