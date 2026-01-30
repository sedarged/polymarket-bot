import { describe, it, expect, beforeEach } from 'vitest';
import { PnlTracker } from '../apps/backend/src/services/pnlTracker';
import { SqliteStore } from '../apps/backend/src/storage/sqlite';
import { Fill } from '../apps/backend/src/types';

describe('PnlTracker', () => {
  let store: SqliteStore;
  let pnlTracker: PnlTracker;

  beforeEach(() => {
    // Use in-memory database for tests
    store = new SqliteStore();
    pnlTracker = new PnlTracker(store);
  });

  describe('onFill - Opening Position', () => {
    it('should open a long position with correct avg price', () => {
      const fill: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'buy',
        price: 0.55,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].marketId).toBe('market-1');
      expect(positions[0].size).toBe(100);
      expect(positions[0].avgPrice).toBe(0.55);
      expect(positions[0].realizedPnl).toBe(0);
    });

    it('should open a short position with correct avg price', () => {
      const fill: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'sell',
        price: 0.55,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(-100);
      expect(positions[0].avgPrice).toBe(0.55);
      expect(positions[0].realizedPnl).toBe(0);
    });
  });

  describe('onFill - Increasing Position', () => {
    it('should increase long position and recalculate avg price', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'buy',
        price: 0.60,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(200);
      // Weighted average: (0.50 * 100 + 0.60 * 100) / 200 = 0.55
      expect(positions[0].avgPrice).toBeCloseTo(0.55, 5);
      expect(positions[0].realizedPnl).toBe(0);
    });

    it('should increase short position and recalculate avg price', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'sell',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(-200);
      // Weighted average: (0.60 * 100 + 0.50 * 100) / 200 = 0.55
      expect(positions[0].avgPrice).toBeCloseTo(0.55, 5);
      expect(positions[0].realizedPnl).toBe(0);
    });
  });

  describe('onFill - Partial Close', () => {
    it('should partially close long position and keep avg price unchanged', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 60,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(40);
      // Avg price should remain 0.50 (not changed on partial close)
      expect(positions[0].avgPrice).toBe(0.50);
      // Realized PnL: 60 * (0.60 - 0.50) = 6
      expect(positions[0].realizedPnl).toBeCloseTo(6, 5);
    });

    it('should partially close short position and keep avg price unchanged', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 60,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(-40);
      // Avg price should remain 0.60 (not changed on partial close)
      expect(positions[0].avgPrice).toBe(0.60);
      // Realized PnL: 60 * (0.60 - 0.50) = 6
      expect(positions[0].realizedPnl).toBeCloseTo(6, 5);
    });
  });

  describe('onFill - Full Close', () => {
    it('should fully close long position and realize PnL', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(0);
      expect(positions[0].avgPrice).toBe(0);
      // Realized PnL: 100 * (0.60 - 0.50) = 10
      expect(positions[0].realizedPnl).toBeCloseTo(10, 5);
    });

    it('should fully close short position and realize PnL', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(0);
      expect(positions[0].avgPrice).toBe(0);
      // Realized PnL: 100 * (0.60 - 0.50) = 10
      expect(positions[0].realizedPnl).toBeCloseTo(10, 5);
    });
  });

  describe('onFill - Position Flip', () => {
    it('should flip from long to short and use new fill price', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 150,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(-50);
      // After flip, avg price should be the fill price of the flipping trade
      expect(positions[0].avgPrice).toBe(0.60);
      // Realized PnL from closing 100: 100 * (0.60 - 0.50) = 10
      expect(positions[0].realizedPnl).toBeCloseTo(10, 5);
    });

    it('should flip from short to long and use new fill price', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 150,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].size).toBe(50);
      // After flip, avg price should be the fill price of the flipping trade
      expect(positions[0].avgPrice).toBe(0.50);
      // Realized PnL from closing 100: 100 * (0.60 - 0.50) = 10
      expect(positions[0].realizedPnl).toBeCloseTo(10, 5);
    });
  });

  describe('updateUnrealized', () => {
    it('should update unrealized PnL for long position', () => {
      const fill: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill);
      pnlTracker.updateUnrealized('market-1', 0.60);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      // Unrealized PnL: (0.60 - 0.50) * 100 = 10
      expect(positions[0].unrealizedPnl).toBeCloseTo(10, 5);
    });

    it('should update unrealized PnL for short position', () => {
      const fill: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill);
      pnlTracker.updateUnrealized('market-1', 0.50);

      const positions = pnlTracker.listPositions();
      expect(positions.length).toBe(1);
      // Unrealized PnL: (0.50 - 0.60) * -100 = 10
      expect(positions[0].unrealizedPnl).toBeCloseTo(10, 5);
    });
  });

  describe('totalPnl', () => {
    it('should calculate total PnL across all positions', () => {
      const fill1: Fill = {
        id: 'fill-1',
        orderId: 'order-1',
        marketId: 'market-1',
        side: 'buy',
        price: 0.50,
        size: 100,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      const fill2: Fill = {
        id: 'fill-2',
        orderId: 'order-2',
        marketId: 'market-1',
        side: 'sell',
        price: 0.60,
        size: 50,
        fee: 0,
        timestamp: new Date().toISOString(),
      };

      pnlTracker.onFill(fill1);
      pnlTracker.onFill(fill2);
      pnlTracker.updateUnrealized('market-1', 0.55);

      const totalPnl = pnlTracker.totalPnl();
      // Realized: 50 * (0.60 - 0.50) = 5
      // Unrealized: (0.55 - 0.50) * 50 = 2.5
      // Total: 7.5
      expect(totalPnl).toBeCloseTo(7.5, 5);
    });
  });
});
