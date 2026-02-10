import { EventEmitter } from 'events';
import { WebSocketClient, WebSocketState } from './websocket';
import { OrderbookCache } from './orderbookCache';
import { ClobClient } from './clob';
import { logger } from '../utils/logger';
import {
  WSMarketSubscription,
  WSMarketMessage,
  WSOrderbookSnapshot,
  WSPriceChange,
  WSLastTradePrice,
  Orderbook,
} from '@polymarket/shared';

/**
 * Market Feed WebSocket Client
 * 
 * Official Documentation: https://docs.polymarket.com/developers/CLOB/websocket/wss-overview
 * WebSocket URL: wss://ws-subscriptions-clob.polymarket.com/ws/market
 * 
 * Provides real-time market data updates via WebSocket connection with:
 * - Automatic reconnection with exponential backoff
 * - State resync after connection loss using REST API fallback
 * - Subscription management for multiple asset IDs
 * - Message handling for book snapshots, price changes, and last trades
 * 
 * Implementation Review: See REPORTS/RESEARCH_REVIEW.md Section 2.3
 * Follows best practices from official documentation:
 * - Reconnection with exponential backoff ✓
 * - REST API resync after reconnect ✓
 * - Proper subscription message format ✓
 * - Idempotent resync operations ✓
 * 
 * @see {@link https://docs.polymarket.com/developers/CLOB/websocket/wss-overview}
 * @see {@link https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart}
 * @see {@link ../../../../REPORTS/RESEARCH_REVIEW.md}
 */
export interface MarketFeedOptions {
  url: string;
  tokenIds: string[];
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  maxReconnectAttempts?: number; // Research §9.3
  /** Cache TTL in milliseconds. Default: 5000 (5 seconds). Addresses A-015 */
  cacheTtl?: number;
}

export class MarketFeedClient extends EventEmitter {
  private wsClient: WebSocketClient;
  private cache: OrderbookCache;
  private clobClient: ClobClient;
  private tokenIds: string[];
  // Track subscription state
  private isSubscribed: boolean = false;
  // Store active resync promises per token to prevent concurrent resyncs (A-007)
  private resyncPromises: Map<string, Promise<void>> = new Map();
  // Message deduplication (A-010): Track processed message IDs using LRU-style Set
  private processedMessageIds: Set<string> = new Set();
  private readonly MESSAGE_ID_CACHE_SIZE = 10000;

  constructor(options: MarketFeedOptions) {
    super();
    this.tokenIds = options.tokenIds;
    this.cache = new OrderbookCache({
      ttl: options.cacheTtl ?? 5000, // Default: 5 seconds (A-015)
      autoInvalidate: true,
    });
    this.clobClient = new ClobClient();

    this.wsClient = new WebSocketClient({
      url: options.url,
      feedType: 'market',
      reconnectDelay: options.reconnectDelay,
      maxReconnectDelay: options.maxReconnectDelay,
      maxReconnectAttempts: options.maxReconnectAttempts,
    });

    this.setupEventHandlers();
  }

  /** Exposed for tests: assert maxReconnectAttempts wiring to WebSocketClient. */
  getWsClientForTesting(): WebSocketClient {
    return this.wsClient;
  }

  private setupEventHandlers(): void {
    this.wsClient.on('open', () => {
      logger.info('Market feed WebSocket opened');
      this.subscribe();
      this.emit('connected');
    });

    this.wsClient.on('message', (message: unknown) => {
      this.handleMessage(message as WSMarketMessage);
    });

    this.wsClient.on('close', () => {
      logger.info('Market feed WebSocket closed');
      this.isSubscribed = false;
      this.emit('disconnected');
    });

    this.wsClient.on('error', (error: Error) => {
      logger.error('Market feed WebSocket error', { error: error.message });
      this.emit('error', error);
    });
  }

  private subscribe(): void {
    if (this.tokenIds.length === 0) {
      logger.warn('No token IDs configured for market feed');
      return;
    }

    // Prevent double subscription
    if (this.isSubscribed) {
      logger.debug('Already subscribed to market feed, skipping');
      return;
    }

    const subscription: WSMarketSubscription = {
      type: 'market',
      assets_ids: this.tokenIds,
    };

    logger.info('Subscribing to market feed', { tokenIds: this.tokenIds });
    this.wsClient.send(subscription);
    this.isSubscribed = true;

    // Trigger resync for all tokens on reconnect
    if (this.cache.size() > 0) {
      logger.info('Resyncing orderbooks after reconnect');
      this.resyncAll();
    }
  }

  private async resyncAll(): Promise<void> {
    const resyncPromises = this.tokenIds.map(tokenId => this.resyncOrderbook(tokenId));
    await Promise.allSettled(resyncPromises);
  }

  private async resyncOrderbook(tokenId: string): Promise<void> {
    // Check if resync is already in progress for this token
    const existingPromise = this.resyncPromises.get(tokenId);
    if (existingPromise) {
      logger.debug('Resync already in progress, waiting for completion', { tokenId });
      // Wait for the existing resync to complete instead of early returning
      return existingPromise;
    }

    // Create a new resync promise and store it
    const resyncPromise = this.performResync(tokenId);
    this.resyncPromises.set(tokenId, resyncPromise);
    
    try {
      await resyncPromise;
    } catch (error) {
      logger.error('Failed to resync orderbook', {
        tokenId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      // Clean up the promise after completion (success or failure)
      this.resyncPromises.delete(tokenId);
    }
  }

  private async performResync(tokenId: string): Promise<void> {
    logger.info('Resyncing orderbook from REST', { tokenId });
    const orderbook = await this.clobClient.getOrderbook(tokenId);
    this.cache.set(tokenId, orderbook);
    this.emit('snapshot', tokenId, orderbook);
    logger.info('Orderbook resync complete', { tokenId });
  }

  private handleMessage(message: WSMarketMessage): void {
    try {
      // A-010: Deduplicate messages using unique ID
      // Generate a unique message ID based on event type, asset, and timestamp
      const messageId = this.generateMessageId(message);
      
      if (this.processedMessageIds.has(messageId)) {
        logger.debug('Duplicate message ignored', { messageId, event_type: message.event_type });
        return;
      }
      
      // Implement LRU behavior: Evict oldest if at capacity before adding new entry
      if (this.processedMessageIds.size >= this.MESSAGE_ID_CACHE_SIZE) {
        const firstId = this.processedMessageIds.values().next().value;
        if (firstId !== undefined) {
          this.processedMessageIds.delete(firstId);
        }
      }
      
      // Add to processed set
      this.processedMessageIds.add(messageId);
      
      switch (message.event_type) {
        case 'book':
          this.handleSnapshot(message as WSOrderbookSnapshot);
          break;
        case 'price_change':
          this.handlePriceChange(message as WSPriceChange);
          break;
        case 'last_trade_price':
          // We don't need to do anything special for last trade price
          logger.debug('Received last trade price', {
            assetId: message.asset_id,
            price: message.price,
          });
          break;
        default:
          logger.debug('Received unknown message type', { message });
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', {
        error: error instanceof Error ? error.message : String(error),
        message,
      });
    }
  }

  /**
   * Generate a unique message ID for deduplication (A-010)
   * Uses event type, asset ID, timestamp, and relevant data to create unique identifier
   */
  private generateMessageId(message: WSMarketMessage): string {
    const baseId = `${message.event_type}-${message.asset_id}-${message.timestamp}`;
    
    // Add specific data based on message type to ensure uniqueness
    switch (message.event_type) {
      case 'price_change': {
        const priceChange = message as WSPriceChange;
        return `${baseId}-${priceChange.side}-${priceChange.price}-${priceChange.size}`;
      }
      case 'last_trade_price': {
        const lastTrade = message as WSLastTradePrice;
        return `${baseId}-${lastTrade.price}`;
      }
      case 'book': {
        // For snapshots, include hash of bid/ask data to detect actual changes
        const snapshot = message as WSOrderbookSnapshot;
        const bidsHash = snapshot.bids.slice(0, 3).map(b => `${b.price}:${b.size}`).join(',');
        const asksHash = snapshot.asks.slice(0, 3).map(a => `${a.price}:${a.size}`).join(',');
        return `${baseId}-${bidsHash}-${asksHash}`;
      }
      default:
        return baseId;
    }
  }

  private handleSnapshot(message: WSOrderbookSnapshot): void {
    const orderbook: Orderbook = {
      market: message.market,
      asset_id: message.asset_id,
      bids: [...message.bids],
      asks: [...message.asks],
      timestamp: message.timestamp,
    };

    this.cache.set(message.asset_id, orderbook);
    this.emit('snapshot', message.asset_id, orderbook);
    
    logger.info('Orderbook snapshot received', {
      assetId: message.asset_id,
      bids: orderbook.bids.length,
      asks: orderbook.asks.length,
    });
  }

  private handlePriceChange(message: WSPriceChange): void {
    const updated = this.cache.updateLevel(
      message.asset_id,
      message.side,
      message.price,
      message.size
    );

    if (updated) {
      const orderbook = this.cache.get(message.asset_id);
      if (orderbook) {
        this.emit('update', message.asset_id, orderbook);
      }
      
      logger.debug('Orderbook updated', {
        assetId: message.asset_id,
        side: message.side,
        price: message.price,
        size: message.size,
      });
    } else {
      // If we don't have the orderbook cached, trigger a resync
      logger.warn('Received price change for uncached orderbook, resyncing', {
        assetId: message.asset_id,
      });
      this.resyncOrderbook(message.asset_id);
    }
  }

  connect(): void {
    logger.info('Starting market feed client');
    this.wsClient.connect();
  }

  /**
   * Close the market feed client gracefully
   * Returns a Promise that resolves when cleanup is complete
   * Implements proper cleanup for Audit Finding A-017
   */
  async close(): Promise<void> {
    logger.info('Stopping market feed client');
    
    // Wait for any in-flight resync operations to complete
    const resyncPromises = Array.from(this.resyncPromises.values());
    if (resyncPromises.length > 0) {
      logger.info('Waiting for in-flight resync operations', { count: resyncPromises.length });
      await Promise.allSettled(resyncPromises);
    }
    
    // Close WebSocket connection
    await this.wsClient.close();
    this.isSubscribed = false;
  }

  getOrderbook(tokenId: string): Orderbook | null {
    return this.cache.get(tokenId);
  }

  getAllOrderbooks(): Map<string, Orderbook> {
    const result = new Map<string, Orderbook>();
    for (const [tokenId, cached] of this.cache.getAll()) {
      result.set(tokenId, cached.orderbook);
    }
    return result;
  }

  isConnected(): boolean {
    return this.wsClient.isConnected();
  }

  getState(): WebSocketState {
    return this.wsClient.getState();
  }
}
