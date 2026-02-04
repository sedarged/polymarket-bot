import { describe, it, expect, beforeEach } from 'vitest';
import { PaperTradingEngine } from '../src/trading/paperTradingEngine';
import { Orderbook } from '@polymarket/shared';

describe('PaperTradingEngine', () => {
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
    engine = new PaperTradingEngine({ slippage: 0.01, feeRate: 0.002 }, 10000);
  });

  describe('initialization', () => {
    it('should initialize with correct config and balance', () => {
      expect(engine.getBalance()).toBe(10000);
      expect(engine.getRealizedPnl()).toBe(0);
      expect(engine.getOrders()).toHaveLength(0);
      expect(engine.getFills()).toHaveLength(0);
      expect(engine.getPositions()).toHaveLength(0);
    });
  });

  describe('createOrder', () => {
    it('should create a buy order', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      
      expect(order.orderId).toMatch(/^paper-/);
      expect(order.tokenId).toBe('0xtoken123');
      expect(order.side).toBe('BUY');
      expect(order.price).toBe('0.55');
      expect(order.size).toBe('10');
      expect(order.status).toBe('OPEN');
      expect(order.filledSize).toBe('0');
    });

    it('should create a sell order', () => {
      const order = engine.createOrder('0xtoken123', 'SELL', '0.45', '5');
      
      expect(order.side).toBe('SELL');
      expect(order.status).toBe('OPEN');
    });
  });

  describe('tryFillOrder', () => {
    it('should fill a buy order that crosses best ask', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      const initialBalance = engine.getBalance();
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const orders = engine.getOrders();
      expect(orders[0].status).toBe('MATCHED');
      expect(orders[0].filledSize).toBe('10');
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      expect(fills[0].side).toBe('BUY');
      expect(fills[0].size).toBe('10');
      
      // Check that balance decreased (price + fee)
      // Order size 10, available liquidity 100 -> 10% ratio
      // Slippage = 0.01 + (0.05 - 0.01) * 0.1 = 0.014 (1.4%)
      const expectedPrice = 0.51 * (1 + 0.014); // best ask + slippage
      const expectedCost = expectedPrice * 10;
      const expectedFee = expectedCost * 0.002;
      expect(engine.getBalance()).toBeCloseTo(initialBalance - expectedCost - expectedFee, 2);
    });

    it('should fill a sell order that crosses best bid', () => {
      const order = engine.createOrder('0xtoken123', 'SELL', '0.45', '10');
      const initialBalance = engine.getBalance();
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      expect(engine.getOrders()[0].status).toBe('MATCHED');
      
      // Check that balance increased (price - fee)
      // Order size 10, available liquidity 100 -> 10% ratio
      // Slippage = 0.01 + (0.05 - 0.01) * 0.1 = 0.014 (1.4%)
      const expectedPrice = 0.50 * (1 - 0.014); // best bid - slippage
      const expectedRevenue = expectedPrice * 10;
      const expectedFee = expectedRevenue * 0.002;
      expect(engine.getBalance()).toBeCloseTo(initialBalance + expectedRevenue - expectedFee, 2);
    });

    it('should not fill a buy order above best ask', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.50', '10');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(false);
      expect(engine.getOrders()[0].status).toBe('OPEN');
      expect(engine.getFills()).toHaveLength(0);
    });

    it('should not fill a sell order below best bid', () => {
      const order = engine.createOrder('0xtoken123', 'SELL', '0.52', '10');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(false);
      expect(engine.getOrders()[0].status).toBe('OPEN');
      expect(engine.getFills()).toHaveLength(0);
    });

    it('should not fill order with insufficient balance', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '20000');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(false);
      expect(engine.getOrders()[0].status).toBe('OPEN');
    });
  });

  describe('position tracking', () => {
    it('should track a long position', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(order.orderId, mockOrderbook);
      
      const positions = engine.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].tokenId).toBe('0xtoken123');
      expect(Number(positions[0].size)).toBeCloseTo(10, 2);
    });

    it('should track a short position', () => {
      const order = engine.createOrder('0xtoken123', 'SELL', '0.45', '10');
      engine.tryFillOrder(order.orderId, mockOrderbook);
      
      const positions = engine.getPositions();
      expect(positions).toHaveLength(1);
      expect(Number(positions[0].size)).toBeCloseTo(-10, 2);
    });

    it('should close a position and realize PnL', () => {
      // Open long position
      const buyOrder = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(buyOrder.orderId, mockOrderbook);
      
      // Close position
      const sellOrder = engine.createOrder('0xtoken123', 'SELL', '0.45', '10');
      engine.tryFillOrder(sellOrder.orderId, mockOrderbook);
      
      const positions = engine.getPositions();
      expect(positions).toHaveLength(0);
      
      // Should have realized PnL (negative because we bought high and sold low)
      expect(engine.getRealizedPnl()).toBeLessThan(0);
    });
  });

  describe('unrealized PnL', () => {
    it('should calculate unrealized PnL for long position', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(order.orderId, mockOrderbook);
      
      const orderbooks = new Map<string, Orderbook>();
      orderbooks.set('0xtoken123', mockOrderbook);
      
      const unrealizedPnl = engine.getUnrealizedPnl(orderbooks);
      
      // Mid price = (0.50 + 0.51) / 2 = 0.505
      // Fill price ≈ 0.51 * 1.01 = 0.5151
      // Unrealized PnL = (0.505 - 0.5151) * 10 ≈ -0.101
      expect(unrealizedPnl).toBeLessThan(0);
    });

    it('should calculate total PnL', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.tryFillOrder(order.orderId, mockOrderbook);
      
      const orderbooks = new Map<string, Orderbook>();
      orderbooks.set('0xtoken123', mockOrderbook);
      
      const totalPnl = engine.getTotalPnl(orderbooks);
      
      expect(totalPnl).toBe(engine.getRealizedPnl() + engine.getUnrealizedPnl(orderbooks));
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an open order', () => {
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      
      const cancelled = engine.cancelOrder(order.orderId);
      
      expect(cancelled).toBe(true);
      expect(engine.getOrders()[0].status).toBe('CANCELLED');
    });

    it('should not cancel a non-existent order', () => {
      const cancelled = engine.cancelOrder('non-existent');
      
      expect(cancelled).toBe(false);
    });
  });

  describe('cancelAllOrders', () => {
    it('should cancel all open orders', () => {
      engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      engine.createOrder('0xtoken123', 'BUY', '0.54', '5');
      engine.createOrder('0xtoken123', 'SELL', '0.60', '8');
      
      engine.cancelAllOrders();
      
      const orders = engine.getOrders();
      expect(orders.every(o => o.status === 'CANCELLED')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      
      engine.reset();
      
      expect(engine.getOrders()).toHaveLength(0);
      expect(engine.getFills()).toHaveLength(0);
      expect(engine.getPositions()).toHaveLength(0);
      expect(engine.getBalance()).toBe(10000);
      expect(engine.getRealizedPnl()).toBe(0);
    });

    it('should reset with new initial balance', () => {
      engine.reset(5000);
      
      expect(engine.getBalance()).toBe(5000);
    });
  });

  describe('size-based slippage (A-020)', () => {
    it('should apply base slippage for small orders', () => {
      // Order size is 10, available liquidity is 100 (10% ratio)
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      const initialBalance = engine.getBalance();
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should use approximately base slippage (1%)
      // Expected price = 0.51 * (1 + 0.01 * (10/100)) = 0.51 * 1.001
      const expectedPrice = 0.51 * (1 + 0.01 + (0.05 - 0.01) * (10 / 100));
      const actualPrice = Number(fills[0].price);
      expect(actualPrice).toBeCloseTo(expectedPrice, 4);
    });

    it('should apply medium slippage for medium orders', () => {
      // Order size is 50, available liquidity is 100 (50% ratio)
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '50');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should use slippage halfway between base (1%) and max (5%)
      // Expected slippage = 0.01 + (0.05 - 0.01) * 0.5 = 0.03 (3%)
      const expectedPrice = 0.51 * (1 + 0.03);
      const actualPrice = Number(fills[0].price);
      expect(actualPrice).toBeCloseTo(expectedPrice, 4);
    });

    it('should apply max slippage for large orders', () => {
      // Order size is 100, available liquidity is 100 (100% ratio)
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '100');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should use max slippage (5%)
      const expectedPrice = 0.51 * (1 + 0.05);
      const actualPrice = Number(fills[0].price);
      expect(actualPrice).toBeCloseTo(expectedPrice, 4);
    });

    it('should apply max slippage for orders larger than liquidity', () => {
      // Order size is 200, available liquidity is 100 (200% ratio)
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '200');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should cap at max slippage (5%)
      const expectedPrice = 0.51 * (1 + 0.05);
      const actualPrice = Number(fills[0].price);
      expect(actualPrice).toBeCloseTo(expectedPrice, 4);
    });

    it('should apply size-based slippage for sell orders', () => {
      // Order size is 50, available liquidity is 100 (50% ratio)
      const order = engine.createOrder('0xtoken123', 'SELL', '0.45', '50');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should use slippage halfway between base (1%) and max (5%)
      // Expected slippage = 0.01 + (0.05 - 0.01) * 0.5 = 0.03 (3%)
      const expectedPrice = 0.50 * (1 - 0.03);
      const actualPrice = Number(fills[0].price);
      expect(actualPrice).toBeCloseTo(expectedPrice, 4);
    });

    it('should apply max slippage when no liquidity is available', () => {
      // Create an orderbook with no bids (to test sell order with no liquidity)
      const emptyBidsOrderbook: Orderbook = {
        market: 'test-market',
        asset_id: '0xtoken123',
        bids: [], // No bids
        asks: [
          { price: '0.51', size: '100' },
        ],
        timestamp: Date.now(),
      };

      const order = engine.createOrder('0xtoken123', 'SELL', '0.45', '50');
      
      const filled = engine.tryFillOrder(order.orderId, emptyBidsOrderbook);
      
      // Should not fill because no best bid is available
      expect(filled).toBe(false);
    });

    it('should use custom slippage config', () => {
      // Create engine with custom slippage config
      const customEngine = new PaperTradingEngine(
        { slippage: 0.005, maxSlippage: 0.10, feeRate: 0.002 },
        10000
      );
      
      const order = customEngine.createOrder('0xtoken123', 'BUY', '0.55', '50');
      
      const filled = customEngine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = customEngine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should use custom slippage: 0.005 + (0.10 - 0.005) * 0.5 = 0.0525 (5.25%)
      const expectedPrice = 0.51 * (1 + 0.0525);
      const actualPrice = Number(fills[0].price);
      expect(actualPrice).toBeCloseTo(expectedPrice, 4);
    });
  });
});
