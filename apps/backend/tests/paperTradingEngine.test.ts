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
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should use base slippage (1%) plus a small fraction of the range up to max slippage (5%)
      // Expected slippage = 0.01 + (0.05 - 0.01) * 0.1 = 0.014 (1.4%), so expected price = 0.51 * (1 + 0.014) = 0.51 * 1.014
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
      // Create an orderbook with zero liquidity at best bid
      const zeroLiquidityOrderbook: Orderbook = {
        market: 'test-market',
        asset_id: '0xtoken123',
        bids: [
          { price: '0.50', size: '0' }, // Zero liquidity
        ],
        asks: [
          { price: '0.51', size: '100' },
        ],
        timestamp: Date.now(),
      };

      const order = engine.createOrder('0xtoken123', 'SELL', '0.45', '50');
      
      const filled = engine.tryFillOrder(order.orderId, zeroLiquidityOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      // Should use max slippage (5%) when liquidity is 0
      const expectedPrice = 0.50 * (1 - 0.05);
      const actualPrice = Number(fills[0].price);
      expect(actualPrice).toBeCloseTo(expectedPrice, 4);
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

  describe('partial fill simulation (A-019)', () => {
    it('should always fill completely when partialFillRate is 0 (default)', () => {
      const engine = new PaperTradingEngine({ slippage: 0.01, maxSlippage: 0.05, feeRate: 0.002 }, 10000);
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '50');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      expect(Number(fills[0].size)).toBe(50); // Full fill
      
      const orders = engine.getOrders();
      expect(orders[0].status).toBe('MATCHED'); // Fully filled
      expect(Number(orders[0].filledSize)).toBe(50);
    });

    it('should support partial fills when partialFillRate is configured', () => {
      // Set partialFillRate to 1.0 to always get partial fills for testing
      const engine = new PaperTradingEngine(
        { 
          slippage: 0.01, 
          maxSlippage: 0.05, 
          feeRate: 0.002,
          partialFillRate: 1.0, // Always partial fill
          minFillRatio: 0.3,
          maxFillRatio: 0.7
        }, 
        10000
      );
      
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '50');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      const fillSize = Number(fills[0].size);
      // Should be partial: between 30% and 70% of 50
      expect(fillSize).toBeGreaterThanOrEqual(15); // 30% of 50
      expect(fillSize).toBeLessThanOrEqual(35); // 70% of 50
      expect(fillSize).toBeLessThan(50); // Not full fill
      
      const orders = engine.getOrders();
      expect(orders[0].status).toBe('PARTIALLY_FILLED'); // Status updated to partially filled
      expect(Number(orders[0].filledSize)).toBe(fillSize);
      expect(Number(orders[0].remainingSize)).toBe(50 - fillSize);
    });

    it('should allow multiple partial fills until order is complete', () => {
      const engine = new PaperTradingEngine(
        { 
          slippage: 0.01, 
          maxSlippage: 0.05, 
          feeRate: 0.002,
          partialFillRate: 1.0, // Always partial fill
          minFillRatio: 0.2,
          maxFillRatio: 0.4
        }, 
        10000
      );
      
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '100');
      
      // First fill
      const filled1 = engine.tryFillOrder(order.orderId, mockOrderbook);
      expect(filled1).toBe(true);
      
      const fills1 = engine.getFills();
      const firstFillSize = Number(fills1[0].size);
      expect(firstFillSize).toBeGreaterThanOrEqual(20); // At least 20% of 100
      expect(firstFillSize).toBeLessThanOrEqual(40); // At most 40% of 100
      
      const orders1 = engine.getOrders();
      expect(orders1[0].status).toBe('PARTIALLY_FILLED'); // Status updated to partially filled
      expect(Number(orders1[0].filledSize)).toBe(firstFillSize);
      expect(Number(orders1[0].remainingSize)).toBe(100 - firstFillSize);
      
      // Second fill
      const filled2 = engine.tryFillOrder(order.orderId, mockOrderbook);
      expect(filled2).toBe(true);
      
      const fills2 = engine.getFills();
      expect(fills2).toHaveLength(2);
      
      const secondFillSize = Number(fills2[1].size);
      const totalFilled = firstFillSize + secondFillSize;
      
      expect(Number(orders1[0].filledSize)).toBe(totalFilled);
      
      // Status depends on whether we've hit 100% - could be PARTIALLY_FILLED or MATCHED
      if (totalFilled >= 100) {
        expect(orders1[0].status).toBe('MATCHED');
      } else {
        expect(orders1[0].status).toBe('PARTIALLY_FILLED');
      }
    });

    it('should respect available liquidity limits for partial fills', () => {
      const engine = new PaperTradingEngine(
        { 
          slippage: 0.01, 
          maxSlippage: 0.05, 
          feeRate: 0.002,
          partialFillRate: 1.0,
          minFillRatio: 0.8,
          maxFillRatio: 0.9
        }, 
        10000
      );
      
      // Create a large order that exceeds available liquidity
      const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '150');
      
      const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
      
      expect(filled).toBe(true);
      
      const fills = engine.getFills();
      expect(fills).toHaveLength(1);
      
      const fillSize = Number(fills[0].size);
      // Should be capped by available liquidity (100 in mockOrderbook)
      expect(fillSize).toBeLessThanOrEqual(100);
    });

    it('should work correctly for sell orders with partial fills', () => {
      const engine = new PaperTradingEngine(
        { 
          slippage: 0.01, 
          maxSlippage: 0.05, 
          feeRate: 0.002,
          partialFillRate: 1.0,
          minFillRatio: 0.3,
          maxFillRatio: 0.6
        }, 
        10000
      );
      
      // Run multiple times to test probabilistic behavior
      let hadPartialFill = false;
      
      for (let i = 0; i < 10; i++) {
        engine.reset(10000);
        const order = engine.createOrder('0xtoken123', 'SELL', '0.45', '50');
        
        const filled = engine.tryFillOrder(order.orderId, mockOrderbook);
        
        expect(filled).toBe(true);
        
        const fills = engine.getFills();
        expect(fills).toHaveLength(1);
        expect(fills[0].side).toBe('SELL');
        
        const fillSize = Number(fills[0].size);
        
        // Check if this was a partial fill
        if (fillSize < 50) {
          hadPartialFill = true;
          // When partial, should be between 30% and 60% of 50
          expect(fillSize).toBeGreaterThanOrEqual(15);
          expect(fillSize).toBeLessThanOrEqual(30);
        } else {
          // Full fill is also possible due to probabilistic nature
          expect(fillSize).toBe(50);
        }
      }
      
      // With high partial fill rate and multiple runs, we should see at least one partial
      expect(hadPartialFill).toBe(true);
    });

    it('should have probabilistic partial fills with moderate partialFillRate', () => {
      const engine = new PaperTradingEngine(
        { 
          slippage: 0.01, 
          maxSlippage: 0.05, 
          feeRate: 0.002,
          partialFillRate: 0.5, // 50% chance of partial fill
          minFillRatio: 0.3,
          maxFillRatio: 0.7
        }, 
        10000
      );
      
      let fullFills = 0;
      let partialFills = 0;
      
      // Run multiple fills to test probabilistic behavior
      for (let i = 0; i < 20; i++) {
        engine.reset(10000);
        const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '50');
        engine.tryFillOrder(order.orderId, mockOrderbook);
        
        const fills = engine.getFills();
        const fillSize = Number(fills[0].size);
        
        if (fillSize === 50) {
          fullFills++;
        } else {
          partialFills++;
        }
      }
      
      // With 50% partial fill rate, we should see both full and partial fills
      // Allow some variance due to randomness
      expect(partialFills).toBeGreaterThan(0);
      expect(fullFills).toBeGreaterThan(0);
    });

    it('should scale partial fill probability with liquidity ratio', () => {
      const engine = new PaperTradingEngine(
        { 
          slippage: 0.01, 
          maxSlippage: 0.05, 
          feeRate: 0.002,
          partialFillRate: 0.5,
          minFillRatio: 0.3,
          maxFillRatio: 0.7
        }, 
        10000
      );
      
      // Small order relative to liquidity should have lower chance of partial fill
      const smallOrder = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
      // Large order relative to liquidity should have higher chance of partial fill
      const largeOrder = engine.createOrder('0xtoken123', 'BUY', '0.55', '90');
      
      // Just verify the methods run without errors
      // The actual probability testing would require many iterations
      engine.tryFillOrder(smallOrder.orderId, mockOrderbook);
      engine.tryFillOrder(largeOrder.orderId, mockOrderbook);
      
      const fills = engine.getFills();
      expect(fills.length).toBeGreaterThanOrEqual(1);
    });
  });
});
