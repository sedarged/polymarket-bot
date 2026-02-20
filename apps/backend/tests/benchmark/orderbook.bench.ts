import { bench, describe } from 'vitest';
import { calculateOrderbookSummary, formatOrderbookSummary } from '../../src/utils/orderbook';
import { Orderbook } from '@polymarket/shared';

/**
 * Orderbook Processing Benchmarks
 * 
 * These benchmarks measure the performance of orderbook processing operations,
 * which are critical for real-time trading decisions.
 */

describe('Orderbook Processing Performance', () => {
  // Small orderbook (typical case)
  const smallOrderbook: Orderbook = {
    market: 'test-market',
    asset_id: 'token-123',
    bids: [
      { price: '0.5500', size: '100' },
      { price: '0.5400', size: '200' },
      { price: '0.5300', size: '150' },
    ],
    asks: [
      { price: '0.5600', size: '150' },
      { price: '0.5700', size: '250' },
      { price: '0.5800', size: '100' },
    ],
    timestamp: Date.now(),
  };

  // Large orderbook (stress test)
  const largeOrderbook: Orderbook = {
    market: 'test-market',
    asset_id: 'token-456',
    bids: Array.from({ length: 100 }, (_, i) => ({
      price: (0.55 - i * 0.001).toFixed(4),
      size: String(Math.floor(Math.random() * 1000) + 100),
    })),
    asks: Array.from({ length: 100 }, (_, i) => ({
      price: (0.56 + i * 0.001).toFixed(4),
      size: String(Math.floor(Math.random() * 1000) + 100),
    })),
    timestamp: Date.now(),
  };

  // Empty orderbook (edge case)
  const emptyOrderbook: Orderbook = {
    market: 'test-market',
    asset_id: 'token-789',
    bids: [],
    asks: [],
    timestamp: Date.now(),
  };

  bench('calculateOrderbookSummary - small orderbook', () => {
    calculateOrderbookSummary(smallOrderbook);
  });

  bench('calculateOrderbookSummary - large orderbook', () => {
    calculateOrderbookSummary(largeOrderbook);
  });

  bench('calculateOrderbookSummary - empty orderbook', () => {
    calculateOrderbookSummary(emptyOrderbook);
  });

  // Pre-calculate summary for formatting-only benchmark
  const smallSummary = calculateOrderbookSummary(smallOrderbook);

  bench('formatOrderbookSummary - formatting only', () => {
    formatOrderbookSummary(smallSummary);
  });

  bench('full orderbook processing pipeline', () => {
    const summary = calculateOrderbookSummary(smallOrderbook);
    formatOrderbookSummary(summary);
  });
});
