/**
 * Test Data Generators Tests
 * 
 * Tests for the test data generator functions to ensure they produce
 * valid, consistent test data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockOrder,
  createMockOpenOrder,
  createMockPartiallyFilledOrder,
  createMockMatchedOrder,
  createMockCancelledOrder,
  createMockFill,
  createMockPosition,
  createMockBalance,
  createMockUsdcBalance,
  createMockAccount,
  createMockToken,
  createMockMarket,
  createMockEvent,
  createMockWSUserOrder,
  createMockWSUserFill,
  createMockOrders,
  createMockFills,
  createMockPositions,
  createMockMarkets,
  createMockTradingScenario,
  resetGeneratorCounters,
} from '../fixtures/generators';

describe('Test Data Generators', () => {
  beforeEach(() => {
    resetGeneratorCounters();
  });

  describe('Order Generators', () => {
    it('should create a valid order with defaults', () => {
      const order = createMockOrder();

      expect(order.orderId).toMatch(/^order-\d+$/);
      expect(order.tokenId).toMatch(/^0x/);
      expect(order.side).toBe('BUY');
      expect(order.price).toBe('0.55');
      expect(order.size).toBe('10');
      expect(order.status).toBe('OPEN');
      expect(order.createdAt).toBeGreaterThan(0);
      expect(order.filledSize).toBe('0');
      expect(order.remainingSize).toBe('10');
    });

    it('should allow overriding specific fields', () => {
      const order = createMockOrder({
        side: 'SELL',
        price: '0.75',
        size: '25',
      });

      expect(order.side).toBe('SELL');
      expect(order.price).toBe('0.75');
      expect(order.size).toBe('25');
    });

    it('should generate unique order IDs', () => {
      const order1 = createMockOrder();
      const order2 = createMockOrder();
      const order3 = createMockOrder();

      expect(order1.orderId).not.toBe(order2.orderId);
      expect(order2.orderId).not.toBe(order3.orderId);
      expect(order1.orderId).toBe('order-1');
      expect(order2.orderId).toBe('order-2');
      expect(order3.orderId).toBe('order-3');
    });

    it('should create an open order', () => {
      const order = createMockOpenOrder();

      expect(order.status).toBe('OPEN');
      expect(order.filledSize).toBe('0');
      expect(order.remainingSize).toBe('10');
    });

    it('should create a partially filled order', () => {
      const order = createMockPartiallyFilledOrder();

      expect(order.status).toBe('PARTIALLY_FILLED');
      expect(order.filledSize).toBe('5');
      expect(order.remainingSize).toBe('5');
      expect(parseFloat(order.size)).toBe(
        parseFloat(order.filledSize) + parseFloat(order.remainingSize)
      );
    });

    it('should create a matched order', () => {
      const order = createMockMatchedOrder({ size: '20' });

      expect(order.status).toBe('MATCHED');
      expect(order.size).toBe('20');
      expect(order.filledSize).toBe('20');
      expect(order.remainingSize).toBe('0');
    });

    it('should create a cancelled order', () => {
      const order = createMockCancelledOrder({ size: '15', filledSize: '5' });

      expect(order.status).toBe('CANCELLED');
      expect(order.size).toBe('15');
      expect(order.filledSize).toBe('5');
      expect(order.remainingSize).toBe('10');
    });
  });

  describe('Fill Generators', () => {
    it('should create a valid fill with defaults', () => {
      const fill = createMockFill();

      expect(fill.orderId).toMatch(/^order-\d+$/);
      expect(fill.tokenId).toMatch(/^0x/);
      expect(fill.side).toBe('BUY');
      expect(fill.price).toBe('0.55');
      expect(fill.size).toBe('10');
      expect(fill.timestamp).toBeGreaterThan(0);
      expect(fill.fee).toBe('0.011');
      expect(fill.fillId).toMatch(/^fill-\d+$/);
    });

    it('should allow overriding specific fields', () => {
      const fill = createMockFill({
        side: 'SELL',
        price: '0.45',
        size: '5',
        fee: '0.005',
      });

      expect(fill.side).toBe('SELL');
      expect(fill.price).toBe('0.45');
      expect(fill.size).toBe('5');
      expect(fill.fee).toBe('0.005');
    });

    it('should generate unique fill IDs', () => {
      const fill1 = createMockFill();
      const fill2 = createMockFill();

      expect(fill1.fillId).not.toBe(fill2.fillId);
      expect(fill1.fillId).toBe('fill-1');
      expect(fill2.fillId).toBe('fill-2');
    });
  });

  describe('Position Generators', () => {
    it('should create a valid position with defaults', () => {
      const position = createMockPosition();

      expect(position.tokenId).toMatch(/^0x/);
      expect(position.size).toBe('100');
      expect(position.averagePrice).toBe('0.55');
      expect(position.marketValue).toBe('55');
      expect(position.unrealizedPnl).toBe('5');
    });

    it('should allow overriding specific fields', () => {
      const position = createMockPosition({
        size: '200',
        averagePrice: '0.60',
      });

      expect(position.size).toBe('200');
      expect(position.averagePrice).toBe('0.60');
    });
  });

  describe('Balance Generators', () => {
    it('should create a USDC balance by default', () => {
      const balance = createMockBalance();

      expect(balance.currency).toBe('USDC');
      expect(balance.available).toBe('1000');
      expect(balance.total).toBe('1000');
    });

    it('should allow overriding currency and amounts', () => {
      const balance = createMockBalance({
        currency: 'ETH',
        available: '2.5',
        total: '3.0',
      });

      expect(balance.currency).toBe('ETH');
      expect(balance.available).toBe('2.5');
      expect(balance.total).toBe('3.0');
    });

    it('should create USDC balance with specified amount', () => {
      const balance = createMockUsdcBalance('500');

      expect(balance.currency).toBe('USDC');
      expect(balance.available).toBe('500');
      expect(balance.total).toBe('500');
    });

    it('should allow different available and total for USDC', () => {
      const balance = createMockUsdcBalance('500', '1000');

      expect(balance.currency).toBe('USDC');
      expect(balance.available).toBe('500');
      expect(balance.total).toBe('1000');
    });
  });

  describe('Account Generators', () => {
    it('should create a valid account with defaults', () => {
      const account = createMockAccount();

      expect(account.address).toMatch(/^0x[a-f0-9]{40}$/);
      expect(account.balances).toHaveLength(1);
      expect(account.balances[0].currency).toBe('USDC');
      expect(account.positions).toEqual([]);
      expect(account.history).toEqual([]);
      expect(account.tags).toEqual([]);
    });

    it('should allow overriding account fields', () => {
      const position = createMockPosition();
      const account = createMockAccount({
        address: '0xabcd',
        positions: [position],
        tags: ['test', 'demo'],
      });

      expect(account.address).toBe('0xabcd');
      expect(account.positions).toHaveLength(1);
      expect(account.tags).toEqual(['test', 'demo']);
    });
  });

  describe('Token Generators', () => {
    it('should create a valid token with defaults', () => {
      const token = createMockToken();

      expect(token.token_id).toMatch(/^0x/);
      expect(token.outcome).toBe('Yes');
      expect(token.price).toBe('0.55');
      expect(token.winner).toBe(false);
    });

    it('should allow overriding token fields', () => {
      const token = createMockToken({
        outcome: 'No',
        price: '0.45',
        winner: true,
      });

      expect(token.outcome).toBe('No');
      expect(token.price).toBe('0.45');
      expect(token.winner).toBe(true);
    });
  });

  describe('Market Generators', () => {
    it('should create a valid market with defaults', () => {
      const market = createMockMarket();

      expect(market.id).toMatch(/^market-\d+$/);
      expect(market.question).toBe('Will the test pass?');
      expect(market.active).toBe(true);
      expect(market.closed).toBe(false);
      expect(market.marketSlug).toContain('test-market-');
      expect(market.outcomes).toEqual(['Yes', 'No']);
      expect(market.outcomePrices).toEqual(['0.55', '0.45']);
      expect(market.tokens).toHaveLength(2);
    });

    it('should allow overriding market fields', () => {
      const market = createMockMarket({
        question: 'Custom question?',
        active: false,
        closed: true,
      });

      expect(market.question).toBe('Custom question?');
      expect(market.active).toBe(false);
      expect(market.closed).toBe(true);
    });

    it('should generate unique market IDs', () => {
      const market1 = createMockMarket();
      const market2 = createMockMarket();

      expect(market1.id).not.toBe(market2.id);
      expect(market1.id).toBe('market-1');
      expect(market2.id).toBe('market-2');
    });
  });

  describe('Event Generators', () => {
    it('should create a valid event with defaults', () => {
      const event = createMockEvent();

      expect(event.id).toMatch(/^event-\d+$/);
      expect(event.title).toBe('Test Event');
      expect(event.slug).toContain('test-event-');
      expect(event.markets).toHaveLength(1);
    });

    it('should allow overriding event fields', () => {
      const event = createMockEvent({
        title: 'Custom Event',
        markets: [],
      });

      expect(event.title).toBe('Custom Event');
      expect(event.markets).toHaveLength(0);
    });
  });

  describe('WebSocket Message Generators', () => {
    it('should create a valid WS user order', () => {
      const wsOrder = createMockWSUserOrder();

      expect(wsOrder.event_type).toBe('order');
      expect(wsOrder.order_id).toMatch(/^order-\d+$/);
      expect(wsOrder.asset_id).toMatch(/^0x/);
      expect(wsOrder.side).toBe('BUY');
      expect(wsOrder.price).toBe('0.55');
      expect(wsOrder.original_size).toBe('10');
      expect(wsOrder.size_matched).toBe('0');
      expect(wsOrder.status).toBe('OPEN');
    });

    it('should create a valid WS user fill', () => {
      const wsFill = createMockWSUserFill();

      expect(wsFill.event_type).toBe('fill');
      expect(wsFill.fill_id).toMatch(/^fill-\d+$/);
      expect(wsFill.order_id).toMatch(/^order-\d+$/);
      expect(wsFill.asset_id).toMatch(/^0x/);
      expect(wsFill.side).toBe('BUY');
      expect(wsFill.price).toBe('0.55');
      expect(wsFill.size).toBe('10');
      expect(wsFill.fee).toBe('0.011');
    });
  });

  describe('Bulk Generators', () => {
    it('should create multiple orders', () => {
      const orders = createMockOrders(5);

      expect(orders).toHaveLength(5);
      orders.forEach((order, i) => {
        expect(order.orderId).toBe(`order-${i + 1}`);
      });
    });

    it('should create multiple fills', () => {
      const fills = createMockFills(3);

      expect(fills).toHaveLength(3);
      fills.forEach((fill, i) => {
        expect(fill.fillId).toBe(`fill-${i + 1}`);
      });
    });

    it('should create multiple positions', () => {
      const positions = createMockPositions(4);

      expect(positions).toHaveLength(4);
    });

    it('should create multiple markets', () => {
      const markets = createMockMarkets(2);

      expect(markets).toHaveLength(2);
      expect(markets[0].id).toBe('market-1');
      expect(markets[1].id).toBe('market-2');
    });

    it('should apply overrides to bulk created items', () => {
      const orders = createMockOrders(3, { side: 'SELL' });

      orders.forEach(order => {
        expect(order.side).toBe('SELL');
      });
    });
  });

  describe('Trading Scenario Generator', () => {
    it('should create a complete trading scenario with default values', () => {
      const scenario = createMockTradingScenario();

      expect(scenario.order).toBeDefined();
      expect(scenario.fills).toHaveLength(2);
      expect(scenario.order.size).toBe('10');
      expect(scenario.fills[0].orderId).toBe(scenario.order.orderId);
      expect(scenario.fills[0].tokenId).toBe(scenario.order.tokenId);
    });

    it('should create a trading scenario with custom values', () => {
      const scenario = createMockTradingScenario({
        orderSize: '100',
        fillCount: 4,
        fillSize: '25',
      });

      expect(scenario.order.size).toBe('100');
      expect(scenario.fills).toHaveLength(4);
      expect(scenario.fills[0].size).toBe('25');
    });

    it('should have consistent IDs across order and fills', () => {
      const scenario = createMockTradingScenario();

      scenario.fills.forEach(fill => {
        expect(fill.orderId).toBe(scenario.order.orderId);
        expect(fill.tokenId).toBe(scenario.order.tokenId);
        expect(fill.side).toBe(scenario.order.side);
        expect(fill.price).toBe(scenario.order.price);
      });
    });
  });

  describe('Counter Reset', () => {
    it('should reset all counters', () => {
      createMockOrder();
      createMockFill();
      createMockMarket();
      
      resetGeneratorCounters();
      
      const order = createMockOrder();
      const fill = createMockFill();
      const market = createMockMarket();
      
      expect(order.orderId).toBe('order-1');
      expect(fill.fillId).toBe('fill-1');
      expect(market.id).toBe('market-1');
    });
  });
});
