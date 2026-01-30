import { Orderbook } from '@polymarket/shared';
import { logger } from '../utils/logger';

export interface CachedOrderbook {
  orderbook: Orderbook;
  lastUpdate: number;
}

export class OrderbookCache {
  private cache: Map<string, CachedOrderbook> = new Map();

  set(assetId: string, orderbook: Orderbook): void {
    const cached: CachedOrderbook = {
      orderbook: { ...orderbook },
      lastUpdate: Date.now(),
    };
    this.cache.set(assetId, cached);
    logger.debug('Orderbook cached', {
      assetId,
      bids: orderbook.bids.length,
      asks: orderbook.asks.length,
    });
  }

  get(assetId: string): Orderbook | null {
    const cached = this.cache.get(assetId);
    if (!cached) {
      return null;
    }
    return { ...cached.orderbook };
  }

  has(assetId: string): boolean {
    return this.cache.has(assetId);
  }

  getLastUpdate(assetId: string): number | null {
    const cached = this.cache.get(assetId);
    return cached ? cached.lastUpdate : null;
  }

  updateLevel(
    assetId: string,
    side: 'buy' | 'sell',
    price: string,
    size: string
  ): boolean {
    const cached = this.cache.get(assetId);
    if (!cached) {
      logger.warn('Cannot update level, orderbook not cached', { assetId });
      return false;
    }

    const orderbook = cached.orderbook;
    const levels = side === 'buy' ? orderbook.bids : orderbook.asks;
    
    // Find existing level at this price
    const index = levels.findIndex(level => level.price === price);
    
    if (parseFloat(size) === 0) {
      // Remove level if size is 0
      if (index !== -1) {
        levels.splice(index, 1);
        logger.debug('Removed orderbook level', { assetId, side, price });
      }
    } else {
      // Update or add level
      if (index !== -1) {
        levels[index].size = size;
        logger.debug('Updated orderbook level', { assetId, side, price, size });
      } else {
        levels.push({ price, size });
        // Sort: bids descending, asks ascending
        if (side === 'buy') {
          levels.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        } else {
          levels.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        }
        logger.debug('Added orderbook level', { assetId, side, price, size });
      }
    }

    cached.lastUpdate = Date.now();
    return true;
  }

  clear(assetId?: string): void {
    if (assetId) {
      this.cache.delete(assetId);
      logger.debug('Cleared orderbook cache', { assetId });
    } else {
      this.cache.clear();
      logger.debug('Cleared all orderbook caches');
    }
  }

  getAll(): Map<string, CachedOrderbook> {
    return new Map(this.cache);
  }

  size(): number {
    return this.cache.size;
  }
}
