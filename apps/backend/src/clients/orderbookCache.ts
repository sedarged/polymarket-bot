import { Orderbook } from '@polymarket/shared';
import { logger } from '../utils/logger';

export interface CachedOrderbook {
  orderbook: Orderbook;
  lastUpdate: number;
}

/**
 * Configuration for orderbook cache TTL
 * Addresses Audit Finding A-015: Cache Staleness
 */
export interface OrderbookCacheConfig {
  /**
   * Time-to-live for cached orderbooks in milliseconds.
   * Must be a positive number; non-positive values will be clamped to minimum.
   * Default: 5000 (5 seconds)
   */
  ttl?: number;
  /** Whether to automatically invalidate stale entries. Default: true */
  autoInvalidate?: boolean;
}

/** Default TTL for orderbook cache in milliseconds (5 seconds) */
export const DEFAULT_CACHE_TTL_MS = 5000;

/** Minimum TTL for orderbook cache in milliseconds (guard against misconfiguration) */
export const MIN_CACHE_TTL_MS = 100; // 100ms minimum

export class OrderbookCache {
  private cache: Map<string, CachedOrderbook> = new Map();
  private ttl: number;
  private autoInvalidate: boolean;

  constructor(config: OrderbookCacheConfig = {}) {
    // Validate and clamp TTL to prevent misconfiguration (Sourcery review comment)
    const rawTtl = config.ttl ?? DEFAULT_CACHE_TTL_MS;
    this.ttl = Math.max(rawTtl, MIN_CACHE_TTL_MS);
    this.autoInvalidate = config.autoInvalidate ?? true;
    
    if (rawTtl < MIN_CACHE_TTL_MS) {
      logger.warn('Cache TTL too low, clamped to minimum', {
        requested: rawTtl,
        clamped: this.ttl,
        minimum: MIN_CACHE_TTL_MS,
      });
    }
    
    logger.debug('Orderbook cache initialized', {
      ttl: this.ttl,
      autoInvalidate: this.autoInvalidate,
      audit: 'A-015',
    });
  }

  /**
   * Cache an orderbook for an asset
   * Addresses Copilot review: Deep clones orderbook to prevent mutation
   * 
   * @param assetId - The asset ID to cache
   * @param orderbook - The orderbook to cache
   */
  set(assetId: string, orderbook: Orderbook): void {
    // Deep clone to prevent mutations to cached data (Copilot review comment)
    const cached: CachedOrderbook = {
      orderbook: {
        ...orderbook,
        bids: orderbook.bids.map(level => ({ ...level })),
        asks: orderbook.asks.map(level => ({ ...level })),
      },
      lastUpdate: Date.now(),
    };
    this.cache.set(assetId, cached);
    logger.debug('Orderbook cached', {
      assetId,
      bids: orderbook.bids.length,
      asks: orderbook.asks.length,
    });
  }

  /**
   * Get cached orderbook for an asset
   * Addresses Audit Finding A-015: Automatically checks TTL and invalidates stale data
   * Addresses Sourcery review: Updated JSDoc to reflect autoInvalidate behavior
   * 
   * @param assetId - The asset ID to retrieve
   * @returns Orderbook if cached and fresh, null if not cached. 
   *          If autoInvalidate is false, may return stale data with a warning.
   *          Returns deep clone to prevent caller mutations (Copilot review).
   */
  get(assetId: string): Orderbook | null {
    const cached = this.cache.get(assetId);
    if (!cached) {
      return null;
    }
    
    // Check TTL (Audit Finding A-015)
    if (this.isStale(assetId)) {
      if (this.autoInvalidate) {
        logger.debug('Orderbook cache expired, invalidating', {
          assetId,
          age: Date.now() - cached.lastUpdate,
          ttl: this.ttl,
          audit: 'A-015',
        });
        this.cache.delete(assetId);
        return null;
      } else {
        logger.warn('Orderbook cache is stale but autoInvalidate is disabled', {
          assetId,
          age: Date.now() - cached.lastUpdate,
          ttl: this.ttl,
          audit: 'A-015',
        });
      }
    }
    
    // Deep clone to prevent mutations to cached data (Copilot review comment)
    return {
      ...cached.orderbook,
      bids: cached.orderbook.bids.map(level => ({ ...level })),
      asks: cached.orderbook.asks.map(level => ({ ...level })),
    };
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

  /**
   * Check if a cached orderbook is stale
   * Addresses Audit Finding A-015: TTL enforcement
   * 
   * @param assetId - The asset ID to check
   * @returns true if the cached data is older than TTL, false otherwise
   */
  isStale(assetId: string): boolean {
    const cached = this.cache.get(assetId);
    if (!cached) {
      return true; // Not cached = stale
    }
    
    const age = Date.now() - cached.lastUpdate;
    return age > this.ttl;
  }

  /**
   * Get cache configuration
   */
  getConfig(): { ttl: number; autoInvalidate: boolean } {
    return {
      ttl: this.ttl,
      autoInvalidate: this.autoInvalidate,
    };
  }

  /**
   * Get cache statistics including freshness
   */
  getStats(): {
    total: number;
    fresh: number;
    stale: number;
    avgAge: number;
  } {
    const now = Date.now();
    let totalAge = 0;
    let fresh = 0;
    let stale = 0;

    for (const cached of this.cache.values()) {
      const age = now - cached.lastUpdate;
      totalAge += age;
      
      if (age <= this.ttl) {
        fresh++;
      } else {
        stale++;
      }
    }

    return {
      total: this.cache.size,
      fresh,
      stale,
      avgAge: this.cache.size > 0 ? totalAge / this.cache.size : 0,
    };
  }
}
