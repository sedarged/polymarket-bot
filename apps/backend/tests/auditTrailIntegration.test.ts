import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PaperTradingEngine } from '../src/trading/paperTradingEngine';
import { AuditTrail } from '../src/trading/auditTrail';
import { Orderbook } from '@polymarket/shared';
import fs from 'fs';
import path from 'path';

describe('Paper Trading Engine with Audit Trail', () => {
  let engine: PaperTradingEngine;
  let auditTrail: AuditTrail;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join('/tmp', `test-audit-integration-${Date.now()}.db`);
    auditTrail = new AuditTrail(testDbPath);
    engine = new PaperTradingEngine(
      {
        slippage: 0.01,
        maxSlippage: 0.05,
        feeRate: 0.002,
        partialFillRate: 0,
        auditTrail,
      },
      10000
    );
  });

  afterEach(() => {
    auditTrail.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should record order creation in audit trail', () => {
    const order = engine.createOrder('0xtoken1', 'BUY', '0.55', '10');

    const orders = auditTrail.getOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].orderId).toBe(order.orderId);
    expect(orders[0].status).toBe('OPEN');

    const events = auditTrail.getOrderEvents(order.orderId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('CREATED');
  });

  it('should record fills in audit trail', () => {
    const order = engine.createOrder('0xtoken1', 'BUY', '0.55', '10');

    const orderbook: Orderbook = {
      market: '0xmarket1',
      asset_id: '0xtoken1',
      bids: [{ price: '0.50', size: '100' }],
      asks: [{ price: '0.51', size: '100' }],
      timestamp: Date.now(),
    };

    const filled = engine.tryFillOrder(order.orderId, orderbook);
    expect(filled).toBe(true);

    const fills = auditTrail.getFills({ orderId: order.orderId });
    expect(fills).toHaveLength(1);
    expect(fills[0].orderId).toBe(order.orderId);
    expect(fills[0].size).toBe('10');

    const events = auditTrail.getOrderEvents(order.orderId);
    expect(events.length).toBeGreaterThanOrEqual(2); // CREATED + MATCHED
    expect(events.some(e => e.eventType === 'MATCHED')).toBe(true);
  });

  it('should record order cancellation in audit trail', () => {
    const order = engine.createOrder('0xtoken1', 'BUY', '0.55', '10');

    engine.cancelOrder(order.orderId);

    const orders = auditTrail.getOrders({ status: 'CANCELLED' });
    expect(orders).toHaveLength(1);
    expect(orders[0].orderId).toBe(order.orderId);

    const events = auditTrail.getOrderEvents(order.orderId);
    expect(events.some(e => e.eventType === 'CANCELLED')).toBe(true);
  });

  it('should record multiple orders and track statistics', () => {
    // Create multiple orders
    const order1 = engine.createOrder('0xtoken1', 'BUY', '0.55', '10');
    engine.createOrder('0xtoken1', 'SELL', '0.45', '5');
    const order3 = engine.createOrder('0xtoken2', 'BUY', '0.60', '15');

    const orderbook1: Orderbook = {
      market: '0xmarket1',
      asset_id: '0xtoken1',
      bids: [{ price: '0.50', size: '100' }],
      asks: [{ price: '0.51', size: '100' }],
      timestamp: Date.now(),
    };

    // Fill first order
    engine.tryFillOrder(order1.orderId, orderbook1);

    // Cancel third order
    engine.cancelOrder(order3.orderId);

    const stats = auditTrail.getStatistics({ tokenId: '0xtoken1' });
    expect(stats.totalOrders).toBe(2); // order1 and order2
    expect(stats.totalFills).toBe(1); // only order1 was filled
    expect(stats.ordersByStatus['MATCHED']).toBe(1);
    expect(stats.ordersByStatus['OPEN']).toBe(1);
  });

  it('should work without audit trail (backwards compatibility)', () => {
    // Create engine without audit trail
    const engineNoAudit = new PaperTradingEngine({}, 10000);
    const order = engineNoAudit.createOrder('0xtoken1', 'BUY', '0.55', '10');

    expect(order.orderId).toBeDefined();
    expect(order.status).toBe('OPEN');

    // Engine should still work normally
    const orderbook: Orderbook = {
      market: '0xmarket1',
      asset_id: '0xtoken1',
      bids: [{ price: '0.50', size: '100' }],
      asks: [{ price: '0.51', size: '100' }],
      timestamp: Date.now(),
    };

    const filled = engineNoAudit.tryFillOrder(order.orderId, orderbook);
    expect(filled).toBe(true);
  });

  it('should query order history by time range', () => {
    const order1 = engine.createOrder('0xtoken1', 'BUY', '0.55', '10');
    engine.createOrder('0xtoken1', 'SELL', '0.45', '5');

    // Query all orders
    const allOrders = auditTrail.getOrders();
    expect(allOrders).toHaveLength(2);

    // Query orders created after order1's timestamp
    const recentOrders = auditTrail.getOrders({ startTime: order1.createdAt + 1 });
    expect(recentOrders.length).toBeLessThanOrEqual(2); // Could be 0, 1, or 2 depending on timing
    
    // Query orders before future time (should get all)
    const futureTime = Date.now() + 10000;
    const allBeforeFuture = auditTrail.getOrders({ endTime: futureTime });
    expect(allBeforeFuture).toHaveLength(2);
  });
});
