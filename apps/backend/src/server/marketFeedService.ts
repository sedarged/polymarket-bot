import { MarketFeedClient } from '../clients/marketFeed';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Orderbook } from '@polymarket/shared';

class MarketFeedService {
  private client: MarketFeedClient | null = null;
  private isRunning: boolean = false;

  start(): void {
    if (this.isRunning) {
      logger.warn('Market feed service already running');
      return;
    }

    if (config.tokenIds.length === 0) {
      logger.info('No token IDs configured, skipping market feed');
      return;
    }

    logger.info('Starting market feed service', { 
      tokenIds: config.tokenIds,
      url: config.wsMarketUrl,
    });

    this.client = new MarketFeedClient({
      url: config.wsMarketUrl,
      tokenIds: config.tokenIds,
    });

    this.setupEventHandlers();
    this.client.connect();
    this.isRunning = true;
  }

  private setupEventHandlers(): void {
    if (!this.client) {
      return;
    }

    this.client.on('connected', () => {
      logger.info('Market feed connected');
    });

    this.client.on('disconnected', () => {
      logger.warn('Market feed disconnected');
    });

    this.client.on('error', (error: Error) => {
      logger.error('Market feed error', { error: error.message });
    });

    this.client.on('snapshot', (tokenId: string, orderbook: Orderbook) => {
      logger.info('Orderbook snapshot received', {
        tokenId,
        bids: orderbook.bids.length,
        asks: orderbook.asks.length,
      });
    });

    this.client.on('update', (tokenId: string, orderbook: Orderbook) => {
      logger.debug('Orderbook updated', {
        tokenId,
        bids: orderbook.bids.length,
        asks: orderbook.asks.length,
      });
    });
  }

  /**
   * Stop the market feed service gracefully
   * Returns a Promise that resolves when cleanup is complete
   * Implements proper cleanup for Audit Finding A-017
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.client) {
      return;
    }

    logger.info('Stopping market feed service');
    await this.client.close();
    this.client = null;
    this.isRunning = false;
  }

  getOrderbook(tokenId: string): Orderbook | null {
    if (!this.client) {
      return null;
    }
    return this.client.getOrderbook(tokenId);
  }

  getAllOrderbooks(): Map<string, Orderbook> {
    if (!this.client) {
      return new Map();
    }
    return this.client.getAllOrderbooks();
  }

  isConnected(): boolean {
    return this.isRunning && this.client?.isConnected() === true;
  }

  getCircuitBreakerMetrics() {
    // MarketFeedService doesn't use a circuit breaker directly
    // Return null to indicate no circuit breaker metrics available
    return null;
  }
}

// Export singleton instance
export const marketFeedService = new MarketFeedService();
