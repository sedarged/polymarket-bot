import { describe, it, expect } from 'vitest';
import { calculateOrderbookSummary, formatOrderbookSummary } from '../../src/utils/orderbook';
import { Orderbook, OrderbookSummary } from '@polymarket/shared';

describe('Orderbook Utils', () => {
  describe('calculateOrderbookSummary', () => {
    it('should calculate summary with bids and asks', () => {
      const orderbook: Orderbook = {
        market: 'test-market',
        asset_id: 'token-123',
        bids: [
          { price: '0.5500', size: '100' },
          { price: '0.5400', size: '200' },
        ],
        asks: [
          { price: '0.5600', size: '150' },
          { price: '0.5700', size: '250' },
        ],
        timestamp: Date.now(),
      };

      const summary = calculateOrderbookSummary(orderbook);

      expect(summary.tokenId).toBe('token-123');
      expect(summary.bestBid).toBe('0.5500');
      expect(summary.bestAsk).toBe('0.5600');
      expect(summary.mid).toBe('0.5550');
      expect(summary.spread).toBe('0.0100');
    });

    it('should handle empty bids', () => {
      const orderbook: Orderbook = {
        market: 'test-market',
        asset_id: 'token-456',
        bids: [],
        asks: [
          { price: '0.5600', size: '150' },
        ],
        timestamp: Date.now(),
      };

      const summary = calculateOrderbookSummary(orderbook);

      expect(summary.tokenId).toBe('token-456');
      expect(summary.bestBid).toBeNull();
      expect(summary.bestAsk).toBe('0.5600');
      expect(summary.mid).toBeNull();
      expect(summary.spread).toBeNull();
    });

    it('should handle empty asks', () => {
      const orderbook: Orderbook = {
        market: 'test-market',
        asset_id: 'token-789',
        bids: [
          { price: '0.5500', size: '100' },
        ],
        asks: [],
        timestamp: Date.now(),
      };

      const summary = calculateOrderbookSummary(orderbook);

      expect(summary.tokenId).toBe('token-789');
      expect(summary.bestBid).toBe('0.5500');
      expect(summary.bestAsk).toBeNull();
      expect(summary.mid).toBeNull();
      expect(summary.spread).toBeNull();
    });

    it('should handle empty orderbook', () => {
      const orderbook: Orderbook = {
        market: 'test-market',
        asset_id: 'token-empty',
        bids: [],
        asks: [],
        timestamp: Date.now(),
      };

      const summary = calculateOrderbookSummary(orderbook);

      expect(summary.tokenId).toBe('token-empty');
      expect(summary.bestBid).toBeNull();
      expect(summary.bestAsk).toBeNull();
      expect(summary.mid).toBeNull();
      expect(summary.spread).toBeNull();
    });

    it('should calculate correct mid price', () => {
      const orderbook: Orderbook = {
        market: 'test-market',
        asset_id: 'token-mid',
        bids: [{ price: '0.4000', size: '100' }],
        asks: [{ price: '0.6000', size: '100' }],
        timestamp: Date.now(),
      };

      const summary = calculateOrderbookSummary(orderbook);

      expect(summary.mid).toBe('0.5000');
    });

    it('should calculate correct spread', () => {
      const orderbook: Orderbook = {
        market: 'test-market',
        asset_id: 'token-spread',
        bids: [{ price: '0.4500', size: '100' }],
        asks: [{ price: '0.5500', size: '100' }],
        timestamp: Date.now(),
      };

      const summary = calculateOrderbookSummary(orderbook);

      expect(summary.spread).toBe('0.1000');
    });
  });

  describe('formatOrderbookSummary', () => {
    it('should format summary with all values', () => {
      const summary: OrderbookSummary = {
        tokenId: 'token-123',
        bestBid: '0.5500',
        bestAsk: '0.5600',
        mid: '0.5550',
        spread: '0.0100',
      };

      const formatted = formatOrderbookSummary(summary);

      expect(formatted).toContain('Token ID: token-123');
      expect(formatted).toContain('Best Bid: 0.5500');
      expect(formatted).toContain('Best Ask: 0.5600');
      expect(formatted).toContain('Mid Price: 0.5550');
      expect(formatted).toContain('Spread: 0.0100');
    });

    it('should format summary with N/A for missing values', () => {
      const summary: OrderbookSummary = {
        tokenId: 'token-456',
        bestBid: null,
        bestAsk: null,
        mid: null,
        spread: null,
      };

      const formatted = formatOrderbookSummary(summary);

      expect(formatted).toContain('Token ID: token-456');
      expect(formatted).toContain('Best Bid: N/A');
      expect(formatted).toContain('Best Ask: N/A');
      expect(formatted).toContain('Mid Price: N/A');
      expect(formatted).toContain('Spread: N/A');
    });
  });
});
