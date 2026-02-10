import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderbookCache, DEFAULT_CACHE_TTL_MS, MIN_CACHE_TTL_MS } from '../../src/clients/orderbookCache';
import { createMockOrderbook, mockTokenId } from '../fixtures/websocket';

describe('OrderbookCache', () => {
  let cache: OrderbookCache;

  beforeEach(() => {
    cache = new OrderbookCache();
    vi.useRealTimers(); // Reset to real timers by default
  });

  describe('set and get', () => {
    it('should store and retrieve orderbook', () => {
      const orderbook = createMockOrderbook();
      cache.set(mockTokenId, orderbook);

      const retrieved = cache.get(mockTokenId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.asset_id).toBe(mockTokenId);
      expect(retrieved?.bids).toEqual(orderbook.bids);
      expect(retrieved?.asks).toEqual(orderbook.asks);
    });

    it('should return null for non-existent orderbook', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should return a copy of the orderbook', () => {
      const orderbook = createMockOrderbook();
      cache.set(mockTokenId, orderbook);

      const retrieved = cache.get(mockTokenId);
      expect(retrieved).not.toBe(orderbook);
      expect(retrieved).toEqual(orderbook);
    });
  });

  describe('has', () => {
    it('should return true for cached orderbook', () => {
      const orderbook = createMockOrderbook();
      cache.set(mockTokenId, orderbook);

      expect(cache.has(mockTokenId)).toBe(true);
    });

    it('should return false for non-existent orderbook', () => {
      expect(cache.has('non-existent')).toBe(false);
    });
  });

  describe('getLastUpdate', () => {
    it('should return timestamp for cached orderbook', () => {
      const orderbook = createMockOrderbook();
      const beforeSet = Date.now();
      cache.set(mockTokenId, orderbook);
      const afterSet = Date.now();

      const lastUpdate = cache.getLastUpdate(mockTokenId);
      expect(lastUpdate).not.toBeNull();
      expect(lastUpdate).toBeGreaterThanOrEqual(beforeSet);
      expect(lastUpdate).toBeLessThanOrEqual(afterSet);
    });

    it('should return null for non-existent orderbook', () => {
      const lastUpdate = cache.getLastUpdate('non-existent');
      expect(lastUpdate).toBeNull();
    });
  });

  describe('updateLevel', () => {
    beforeEach(() => {
      const orderbook = createMockOrderbook({
        bids: [
          { price: '0.55', size: '100' },
          { price: '0.54', size: '200' },
        ],
        asks: [
          { price: '0.56', size: '150' },
          { price: '0.57', size: '250' },
        ],
      });
      cache.set(mockTokenId, orderbook);
    });

    it('should update existing bid level', () => {
      const updated = cache.updateLevel(mockTokenId, 'buy', '0.55', '150');
      expect(updated).toBe(true);

      const orderbook = cache.get(mockTokenId);
      expect(orderbook?.bids[0].price).toBe('0.55');
      expect(orderbook?.bids[0].size).toBe('150');
    });

    it('should update existing ask level', () => {
      const updated = cache.updateLevel(mockTokenId, 'sell', '0.56', '200');
      expect(updated).toBe(true);

      const orderbook = cache.get(mockTokenId);
      expect(orderbook?.asks[0].price).toBe('0.56');
      expect(orderbook?.asks[0].size).toBe('200');
    });

    it('should add new bid level and maintain sort order', () => {
      const updated = cache.updateLevel(mockTokenId, 'buy', '0.56', '50');
      expect(updated).toBe(true);

      const orderbook = cache.get(mockTokenId);
      expect(orderbook?.bids).toHaveLength(3);
      expect(orderbook?.bids[0].price).toBe('0.56');
      expect(orderbook?.bids[1].price).toBe('0.55');
      expect(orderbook?.bids[2].price).toBe('0.54');
    });

    it('should add new ask level and maintain sort order', () => {
      const updated = cache.updateLevel(mockTokenId, 'sell', '0.55', '75');
      expect(updated).toBe(true);

      const orderbook = cache.get(mockTokenId);
      expect(orderbook?.asks).toHaveLength(3);
      expect(orderbook?.asks[0].price).toBe('0.55');
      expect(orderbook?.asks[1].price).toBe('0.56');
      expect(orderbook?.asks[2].price).toBe('0.57');
    });

    it('should remove bid level when size is 0', () => {
      const updated = cache.updateLevel(mockTokenId, 'buy', '0.55', '0');
      expect(updated).toBe(true);

      const orderbook = cache.get(mockTokenId);
      expect(orderbook?.bids).toHaveLength(1);
      expect(orderbook?.bids[0].price).toBe('0.54');
    });

    it('should remove ask level when size is 0', () => {
      const updated = cache.updateLevel(mockTokenId, 'sell', '0.56', '0');
      expect(updated).toBe(true);

      const orderbook = cache.get(mockTokenId);
      expect(orderbook?.asks).toHaveLength(1);
      expect(orderbook?.asks[0].price).toBe('0.57');
    });

    it('should return false for non-existent orderbook', () => {
      const updated = cache.updateLevel('non-existent', 'buy', '0.55', '100');
      expect(updated).toBe(false);
    });

    it('should update lastUpdate timestamp', async () => {
      const beforeUpdate = cache.getLastUpdate(mockTokenId);
      
      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));
      cache.updateLevel(mockTokenId, 'buy', '0.55', '150');

      const afterUpdate = cache.getLastUpdate(mockTokenId);
      expect(afterUpdate).toBeGreaterThan(beforeUpdate ?? 0);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      cache.set('token1', createMockOrderbook({ asset_id: 'token1' }));
      cache.set('token2', createMockOrderbook({ asset_id: 'token2' }));
    });

    it('should clear specific orderbook', () => {
      cache.clear('token1');
      
      expect(cache.has('token1')).toBe(false);
      expect(cache.has('token2')).toBe(true);
    });

    it('should clear all orderbooks when no assetId provided', () => {
      cache.clear();
      
      expect(cache.has('token1')).toBe(false);
      expect(cache.has('token2')).toBe(false);
      expect(cache.size()).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all cached orderbooks', () => {
      cache.set('token1', createMockOrderbook({ asset_id: 'token1' }));
      cache.set('token2', createMockOrderbook({ asset_id: 'token2' }));

      const all = cache.getAll();
      expect(all.size).toBe(2);
      expect(all.has('token1')).toBe(true);
      expect(all.has('token2')).toBe(true);
    });

    it('should return empty map when cache is empty', () => {
      const all = cache.getAll();
      expect(all.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      expect(cache.size()).toBe(0);

      cache.set('token1', createMockOrderbook({ asset_id: 'token1' }));
      expect(cache.size()).toBe(1);

      cache.set('token2', createMockOrderbook({ asset_id: 'token2' }));
      expect(cache.size()).toBe(2);

      cache.clear('token1');
      expect(cache.size()).toBe(1);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('TTL enforcement (A-015)', () => {
    it('should use default TTL when not specified', () => {
      const cache = new OrderbookCache();
      const config = cache.getConfig();
      expect(config.ttl).toBe(DEFAULT_CACHE_TTL_MS);
    });

    it('should use custom TTL when specified', () => {
      const customTtl = 10000;
      const cache = new OrderbookCache({ ttl: customTtl });
      const config = cache.getConfig();
      expect(config.ttl).toBe(customTtl);
    });

    it('should clamp TTL to minimum when too low', () => {
      const cache = new OrderbookCache({ ttl: 50 });
      const config = cache.getConfig();
      expect(config.ttl).toBe(MIN_CACHE_TTL_MS);
    });

    it('should clamp negative TTL to minimum', () => {
      const cache = new OrderbookCache({ ttl: -100 });
      const config = cache.getConfig();
      expect(config.ttl).toBe(MIN_CACHE_TTL_MS);
    });

    it('should auto-invalidate stale entries by default', () => {
      vi.useFakeTimers();
      const cache = new OrderbookCache({ ttl: 1000 });
      const orderbook = createMockOrderbook();
      
      cache.set(mockTokenId, orderbook);
      expect(cache.get(mockTokenId)).not.toBeNull();
      
      // Advance time past TTL
      vi.advanceTimersByTime(1001);
      
      expect(cache.get(mockTokenId)).toBeNull();
      expect(cache.has(mockTokenId)).toBe(false);
      
      vi.useRealTimers();
    });

    it('should not auto-invalidate when disabled', () => {
      vi.useFakeTimers();
      const cache = new OrderbookCache({ ttl: 1000, autoInvalidate: false });
      const orderbook = createMockOrderbook();
      
      cache.set(mockTokenId, orderbook);
      expect(cache.get(mockTokenId)).not.toBeNull();
      
      // Advance time past TTL
      vi.advanceTimersByTime(1001);
      
      // Should still return stale data with warning
      const retrieved = cache.get(mockTokenId);
      expect(retrieved).not.toBeNull();
      expect(cache.has(mockTokenId)).toBe(true);
      
      vi.useRealTimers();
    });

    it('should identify stale entries correctly', () => {
      vi.useFakeTimers();
      const cache = new OrderbookCache({ ttl: 1000 });
      const orderbook = createMockOrderbook();
      
      cache.set(mockTokenId, orderbook);
      expect(cache.isStale(mockTokenId)).toBe(false);
      
      // Advance time but not past TTL
      vi.advanceTimersByTime(500);
      expect(cache.isStale(mockTokenId)).toBe(false);
      
      // Advance time past TTL
      vi.advanceTimersByTime(501);
      expect(cache.isStale(mockTokenId)).toBe(true);
      
      vi.useRealTimers();
    });

    it('should return true for non-existent entries in isStale', () => {
      const cache = new OrderbookCache();
      expect(cache.isStale('non-existent')).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const cache = new OrderbookCache({ ttl: 3000, autoInvalidate: false });
      const config = cache.getConfig();
      
      expect(config.ttl).toBe(3000);
      expect(config.autoInvalidate).toBe(false);
    });

    it('should return default values when not specified', () => {
      const cache = new OrderbookCache();
      const config = cache.getConfig();
      
      expect(config.ttl).toBe(DEFAULT_CACHE_TTL_MS);
      expect(config.autoInvalidate).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return empty stats for empty cache', () => {
      const cache = new OrderbookCache();
      const stats = cache.getStats();
      
      expect(stats.total).toBe(0);
      expect(stats.fresh).toBe(0);
      expect(stats.stale).toBe(0);
      expect(stats.avgAge).toBe(0);
    });

    it('should count fresh and stale entries correctly', () => {
      vi.useFakeTimers();
      const cache = new OrderbookCache({ ttl: 1000, autoInvalidate: false });
      
      // Add three entries
      cache.set('token1', createMockOrderbook({ asset_id: 'token1' }));
      vi.advanceTimersByTime(500);
      cache.set('token2', createMockOrderbook({ asset_id: 'token2' }));
      vi.advanceTimersByTime(600); // token1 is now stale (1100ms old)
      cache.set('token3', createMockOrderbook({ asset_id: 'token3' }));
      
      const stats = cache.getStats();
      expect(stats.total).toBe(3);
      expect(stats.fresh).toBe(2); // token2 and token3
      expect(stats.stale).toBe(1); // token1
      expect(stats.avgAge).toBeGreaterThan(0);
      
      vi.useRealTimers();
    });

    it('should calculate average age correctly', () => {
      vi.useFakeTimers();
      const cache = new OrderbookCache({ ttl: 10000 });
      
      cache.set('token1', createMockOrderbook({ asset_id: 'token1' }));
      vi.advanceTimersByTime(1000);
      cache.set('token2', createMockOrderbook({ asset_id: 'token2' }));
      vi.advanceTimersByTime(1000);
      
      const stats = cache.getStats();
      // token1: 2000ms old, token2: 1000ms old, avg: 1500ms
      expect(stats.avgAge).toBeCloseTo(1500, -2);
      
      vi.useRealTimers();
    });

    it('should update stats after invalidation', () => {
      vi.useFakeTimers();
      const cache = new OrderbookCache({ ttl: 1000 });
      
      cache.set('token1', createMockOrderbook({ asset_id: 'token1' }));
      cache.set('token2', createMockOrderbook({ asset_id: 'token2' }));
      
      let stats = cache.getStats();
      expect(stats.total).toBe(2);
      expect(stats.fresh).toBe(2);
      
      // Make one entry stale and access it (should auto-invalidate)
      vi.advanceTimersByTime(1001);
      cache.get('token1'); // This should invalidate token1
      
      stats = cache.getStats();
      expect(stats.total).toBe(1); // Only token2 remains
      
      vi.useRealTimers();
    });
  });
});
