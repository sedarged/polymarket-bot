import { describe, it, expect, beforeEach } from 'vitest';
import { OrderbookCache } from '../src/clients/orderbookCache';
import { createMockOrderbook, mockTokenId } from './fixtures/websocket';

describe('OrderbookCache', () => {
  let cache: OrderbookCache;

  beforeEach(() => {
    cache = new OrderbookCache();
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
});
