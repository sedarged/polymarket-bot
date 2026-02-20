/**
 * Test Data Generators - Quick Example
 * 
 * This file demonstrates the usage of test data generators.
 * Run this example with: npm test -- tests/unit/generators.example.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockOrder,
  createMockOpenOrder,
  createMockMatchedOrder,
  createMockFill,
  createMockPosition,
  createMockUsdcBalance,
  createMockAccount,
  createMockMarket,
  createMockOrders,
  createMockTradingScenario,
  resetGeneratorCounters,
} from '../fixtures';

describe('Test Data Generators - Examples', () => {
  beforeEach(() => {
    resetGeneratorCounters();
  });

  describe('Basic Usage', () => {
    it('creates order with defaults', () => {
      const order = createMockOrder();
      
      expect(order.orderId).toBe('order-1');
      expect(order.side).toBe('BUY');
      expect(order.price).toBe('0.55');
      expect(order.size).toBe('10');
    });

    it('creates order with overrides', () => {
      const order = createMockOrder({
        side: 'SELL',
        price: '0.75',
        size: '25',
      });
      
      expect(order.side).toBe('SELL');
      expect(order.price).toBe('0.75');
      expect(order.size).toBe('25');
    });

    it('creates order with specific status', () => {
      const openOrder = createMockOpenOrder();
      const matchedOrder = createMockMatchedOrder();
      
      expect(openOrder.status).toBe('OPEN');
      expect(openOrder.filledSize).toBe('0');
      
      expect(matchedOrder.status).toBe('MATCHED');
      expect(matchedOrder.filledSize).toBe(matchedOrder.size);
    });
  });

  describe('Related Objects', () => {
    it('creates fill matching an order', () => {
      const order = createMockOrder({ orderId: 'my-order-1' });
      const fill = createMockFill({
        orderId: order.orderId,
        tokenId: order.tokenId,
        side: order.side,
        price: order.price,
      });
      
      expect(fill.orderId).toBe(order.orderId);
      expect(fill.tokenId).toBe(order.tokenId);
      expect(fill.side).toBe(order.side);
    });

    it('creates complete trading scenario', () => {
      const scenario = createMockTradingScenario({
        orderSize: '100',
        fillCount: 4,
        fillSize: '25',
      });
      
      expect(scenario.order.size).toBe('100');
      expect(scenario.fills).toHaveLength(4);
      
      // All fills reference the same order
      scenario.fills.forEach(fill => {
        expect(fill.orderId).toBe(scenario.order.orderId);
        expect(fill.tokenId).toBe(scenario.order.tokenId);
        expect(fill.size).toBe('25');
      });
    });
  });

  describe('Bulk Creation', () => {
    it('creates multiple orders at once', () => {
      const orders = createMockOrders(5, { side: 'SELL' });
      
      expect(orders).toHaveLength(5);
      orders.forEach((order, index) => {
        expect(order.side).toBe('SELL');
        expect(order.orderId).toBe(`order-${index + 1}`);
      });
    });
  });

  describe('Complex Objects', () => {
    it('creates account with balances and positions', () => {
      const position = createMockPosition({ size: '50' });
      const balance = createMockUsdcBalance('5000');
      
      const account = createMockAccount({
        address: '0xtest',
        balances: [balance],
        positions: [position],
        tags: ['demo', 'test'],
      });
      
      expect(account.address).toBe('0xtest');
      expect(account.balances).toHaveLength(1);
      expect(account.balances[0].currency).toBe('USDC');
      expect(account.balances[0].available).toBe('5000');
      expect(account.positions).toHaveLength(1);
      expect(account.positions[0].size).toBe('50');
    });

    it('creates market with tokens', () => {
      const market = createMockMarket({
        question: 'Will it rain tomorrow?',
        active: true,
      });
      
      expect(market.question).toBe('Will it rain tomorrow?');
      expect(market.active).toBe(true);
      expect(market.tokens).toHaveLength(2);
      expect(market.outcomes).toEqual(['Yes', 'No']);
    });
  });

  describe('Counter Reset', () => {
    it('resets IDs for test isolation', () => {
      const order1 = createMockOrder();
      expect(order1.orderId).toBe('order-1');
      
      resetGeneratorCounters();
      
      const order2 = createMockOrder();
      expect(order2.orderId).toBe('order-1'); // Reset back to 1
    });
  });
});
