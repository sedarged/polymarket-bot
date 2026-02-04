import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersistenceService } from '../src/trading/persistenceService';
import { PaperTradingEngine } from '../src/trading/paperTradingEngine';
import { Orderbook } from '@polymarket/shared';
import fs from 'fs';
import path from 'path';

describe('Persistence Layer - Gap PA-001', () => {
  const testDbPath = path.join(process.cwd(), 'data', 'test-persistence.db');
  let persistenceService: PersistenceService;
  let engine: PaperTradingEngine;

  const mockOrderbook: Orderbook = {
    market: 'test-market',
    asset_id: '0xtoken123',
    bids: [
      { price: '0.50', size: '100' },
      { price: '0.49', size: '50' },
    ],
    asks: [
      { price: '0.51', size: '100' },
      { price: '0.52', size: '50' },
    ],
    timestamp: Date.now(),
  };

  beforeEach(() => {
    // Clean up test database before each test
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    persistenceService = new PersistenceService(testDbPath);
  });

  afterEach(() => {
    // Close database connection and clean up
    persistenceService.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('PersistenceService', () => {
    it('should persist and retrieve orders', () => {
      const order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.55',
        size: '10',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };

      persistenceService.saveOrder(order);

      const orders = persistenceService.getOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('test-order-1');
      expect(orders[0].tokenId).toBe('0xtoken123');
      expect(orders[0].side).toBe('BUY');
      expect(orders[0].price).toBe('0.55');
      expect(orders[0].size).toBe('10');
      expect(orders[0].status).toBe('OPEN');
    });

    it('should persist and retrieve fills', () => {
      // First create an order (required for foreign key)
      const order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.55',
        size: '10',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };

      persistenceService.saveOrder(order);

      // Now create the fill
      const fill = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.51',
        size: '10',
        timestamp: Date.now(),
        fee: '0.01',
      };

      persistenceService.saveFill(fill);

      const fills = persistenceService.getFills();
      expect(fills).toHaveLength(1);
      expect(fills[0].orderId).toBe('test-order-1');
      expect(fills[0].price).toBe('0.51');
      expect(fills[0].size).toBe('10');
    });

    it('should persist and retrieve positions', () => {
      const position = {
        tokenId: '0xtoken123',
        size: '10',
        averagePrice: '0.51',
      };

      persistenceService.savePosition(position);

      const positions = persistenceService.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].tokenId).toBe('0xtoken123');
      expect(positions[0].size).toBe('10');
      expect(positions[0].averagePrice).toBe('0.51');
    });

    it('should delete positions', () => {
      const position = {
        tokenId: '0xtoken123',
        size: '10',
        averagePrice: '0.51',
      };

      persistenceService.savePosition(position);
      let positions = persistenceService.getPositions();
      expect(positions).toHaveLength(1);

      persistenceService.deletePosition('0xtoken123');
      positions = persistenceService.getPositions();
      expect(positions).toHaveLength(0);
    });

    it('should persist and retrieve balance', () => {
      persistenceService.saveBalance(9500, 10000, 50);

      const balance = persistenceService.getBalance();
      expect(balance).not.toBeNull();
      expect(balance?.balance).toBe(9500);
      expect(balance?.initialBalance).toBe(10000);
      expect(balance?.realizedPnl).toBe(50);
    });

    it('should return null when no balance exists', () => {
      const balance = persistenceService.getBalance();
      expect(balance).toBeNull();
    });

    it('should clear all state', () => {
      // Add some data
      persistenceService.saveOrder({
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      });

      persistenceService.savePosition({
        tokenId: '0xtoken123',
        size: '10',
        averagePrice: '0.51',
      });

      persistenceService.saveBalance(9500, 10000, 50);

      // Verify data exists
      expect(persistenceService.getOrders()).toHaveLength(1);
      expect(persistenceService.getPositions()).toHaveLength(1);
      expect(persistenceService.getBalance()).not.toBeNull();

      // Clear all state
      persistenceService.clearAllState();

      // Verify data is cleared
      expect(persistenceService.getOrders()).toHaveLength(0);
      expect(persistenceService.getPositions()).toHaveLength(0);
      expect(persistenceService.getBalance()).toBeNull();
    });
  });

  describe('PaperTradingEngine with Persistence', () => {
    it('should persist orders when created', () => {
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');

      // Verify order is persisted
      const orders = persistenceService.getOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe(order.orderId);
    });

    it('should persist fills when orders are filled', () => {
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);

      expect(filled).toBe(true);

      // Verify fill is persisted
      const fills = persistenceService.getFills();
      expect(fills).toHaveLength(1);
      expect(fills[0].orderId).toBe(order.orderId);
      expect(fills[0].side).toBe('BUY');
    });

    it('should persist positions after fills', () => {
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(order.orderId, mockOrderbook);

      // Verify position is persisted
      const positions = persistenceService.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].tokenId).toBe('0xtoken123');
      expect(Number(positions[0].size)).toBeGreaterThan(0);
    });

    it('should persist balance changes', () => {
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(order.orderId, mockOrderbook);

      // Verify balance is persisted
      const balance = persistenceService.getBalance();
      expect(balance).not.toBeNull();
      expect(balance?.balance).toBeLessThan(10000); // Balance decreased after buy
      expect(balance?.initialBalance).toBe(10000);
    });

    it('should restore state on restart', () => {
      // Create engine and make some trades
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      const order1 = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(order1.orderId, mockOrderbook);

      const order2 = engine.createOrder('0xtoken123', 'BUY', '0.55', '5');

      const firstBalance = engine.getBalance();
      const firstOrders = engine.getOrders();
      const firstFills = engine.getFills();
      const firstPositions = engine.getPositions();

      // Close the first engine (simulating shutdown)
      // Note: We keep the persistenceService open

      // Create a new engine with the same persistence service (simulating restart)
      const engine2 = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      // Verify state is restored
      expect(engine2.getBalance()).toBe(firstBalance);
      expect(engine2.getOrders()).toHaveLength(firstOrders.length);
      expect(engine2.getFills()).toHaveLength(firstFills.length);
      expect(engine2.getPositions()).toHaveLength(firstPositions.length);

      // Verify specific order details
      const restoredOrders = engine2.getOrders();
      expect(restoredOrders.find(o => o.orderId === order1.orderId)).toBeDefined();
      expect(restoredOrders.find(o => o.orderId === order2.orderId)).toBeDefined();

      // Verify position details
      const restoredPositions = engine2.getPositions();
      expect(restoredPositions[0].tokenId).toBe('0xtoken123');
      expect(Number(restoredPositions[0].size)).toBeGreaterThan(0);
    });

    it('should handle restart with no existing state', () => {
      // Create a fresh engine with persistence
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      // Verify initial state
      expect(engine.getBalance()).toBe(10000);
      expect(engine.getOrders()).toHaveLength(0);
      expect(engine.getFills()).toHaveLength(0);
      expect(engine.getPositions()).toHaveLength(0);

      // Verify balance is persisted
      const balance = persistenceService.getBalance();
      expect(balance).not.toBeNull();
      expect(balance?.balance).toBe(10000);
      expect(balance?.initialBalance).toBe(10000);
    });

    it('should persist order cancellations', () => {
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      const cancelled = engine.cancelOrder(order.orderId);

      expect(cancelled).toBe(true);

      // Verify cancellation is persisted
      const orders = persistenceService.getOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('CANCELLED');
    });

    it('should persist when cancelling all orders', () => {
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.createOrder('0xtoken123', 'BUY', '0.56', '5');

      engine.cancelAllOrders();

      // Verify all cancellations are persisted
      const orders = persistenceService.getOrders();
      expect(orders).toHaveLength(2);
      expect(orders[0].status).toBe('CANCELLED');
      expect(orders[1].status).toBe('CANCELLED');
    });

    it('should clear persisted state on reset', () => {
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      // Create some state
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(order.orderId, mockOrderbook);

      // Verify state exists
      expect(persistenceService.getOrders()).toHaveLength(1);
      expect(persistenceService.getFills()).toHaveLength(1);
      expect(persistenceService.getPositions()).toHaveLength(1);

      // Reset engine
      engine.reset(10000);

      // Verify persisted state is cleared
      expect(persistenceService.getOrders()).toHaveLength(0);
      expect(persistenceService.getFills()).toHaveLength(0);
      expect(persistenceService.getPositions()).toHaveLength(0);

      // Verify fresh state is persisted
      const balance = persistenceService.getBalance();
      expect(balance?.balance).toBe(10000);
      expect(balance?.initialBalance).toBe(10000);
      expect(balance?.realizedPnl).toBe(0);
    });

    it('should work without persistence service (backward compatibility)', () => {
      // Create engine without persistence service
      engine = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
        },
        10000
      );

      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);

      expect(filled).toBe(true);
      expect(engine.getOrders()).toHaveLength(1);
      expect(engine.getFills()).toHaveLength(1);
      expect(engine.getPositions()).toHaveLength(1);
    });
  });

  describe('Data Survives Restarts', () => {
    it('should maintain complete trading state across multiple restarts', () => {
      // Session 1: Initial trading
      let engine1 = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      const order1 = engine1.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine1.tryFillOrder(order1.orderId, mockOrderbook);

      const session1Balance = engine1.getBalance();
      const session1Positions = engine1.getPositions();

      // Session 2: Continue trading after restart
      const engine2 = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000 // This will be ignored since state is restored
      );

      expect(engine2.getBalance()).toBe(session1Balance);
      expect(engine2.getPositions()).toHaveLength(session1Positions.length);

      const order2 = engine2.createOrder('0xtoken123', 'SELL', '0.45', '5');
      engine2.tryFillOrder(order2.orderId, mockOrderbook);

      const session2Balance = engine2.getBalance();
      const session2Orders = engine2.getOrders();
      const session2Fills = engine2.getFills();

      // Session 3: Verify accumulated state
      const engine3 = new PaperTradingEngine(
        {
          slippage: 0.01,
          feeRate: 0.002,
          persistenceService,
        },
        10000
      );

      expect(engine3.getBalance()).toBe(session2Balance);
      expect(engine3.getOrders()).toHaveLength(session2Orders.length);
      expect(engine3.getFills()).toHaveLength(session2Fills.length);

      // Verify both orders are present
      const orders = engine3.getOrders();
      expect(orders.find(o => o.orderId === order1.orderId)).toBeDefined();
      expect(orders.find(o => o.orderId === order2.orderId)).toBeDefined();
    });
  });
});
