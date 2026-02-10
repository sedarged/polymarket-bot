import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditTrail } from '../../src/trading/auditTrail';
import { Order, Fill } from '@polymarket/shared';
import fs from 'fs';
import path from 'path';

describe('AuditTrail', () => {
  let auditTrail: AuditTrail;
  let testDbPath: string;

  beforeEach(() => {
    // Use a temporary database for testing
    testDbPath = path.join('/tmp', `test-audit-${Date.now()}.db`);
    auditTrail = new AuditTrail(testDbPath);
  });

  afterEach(() => {
    auditTrail.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('recordOrder', () => {
    it('should record a new order', () => {
      const order: Order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };

      auditTrail.recordOrder(order);

      const orders = auditTrail.getOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('test-order-1');
      expect(orders[0].tokenId).toBe('0xtoken123');
      expect(orders[0].side).toBe('BUY');
      expect(orders[0].price).toBe('0.55');
      expect(orders[0].size).toBe('10');
      expect(orders[0].status).toBe('OPEN');
    });

    it('should update an existing order', () => {
      const order: Order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };

      auditTrail.recordOrder(order);

      // Update the order status
      order.status = 'MATCHED';
      order.filledSize = '10';
      order.remainingSize = '0';
      auditTrail.recordOrder(order);

      const orders = auditTrail.getOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('MATCHED');
      expect(orders[0].filledSize).toBe('10');
    });
  });

  describe('recordFill', () => {
    it('should record a fill', () => {
      // First create the order that the fill references
      const order: Order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };
      auditTrail.recordOrder(order);

      const fill: Fill = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        timestamp: Date.now(),
        fee: '0.011',
      };

      auditTrail.recordFill(fill);

      const fills = auditTrail.getFills();
      expect(fills).toHaveLength(1);
      expect(fills[0].orderId).toBe('test-order-1');
      expect(fills[0].tokenId).toBe('0xtoken123');
      expect(fills[0].side).toBe('BUY');
      expect(fills[0].price).toBe('0.55');
      expect(fills[0].size).toBe('10');
      expect(fills[0].fee).toBe('0.011');
    });

    it('should record multiple fills for the same order', () => {
      // First create the order
      const order: Order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };
      auditTrail.recordOrder(order);

      const fill1: Fill = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '5',
        timestamp: Date.now(),
        fee: '0.0055',
      };

      const fill2: Fill = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.56',
        size: '5',
        timestamp: Date.now(),
        fee: '0.0056',
      };

      auditTrail.recordFill(fill1);
      auditTrail.recordFill(fill2);

      const fills = auditTrail.getFills({ orderId: 'test-order-1' });
      expect(fills).toHaveLength(2);
    });
  });

  describe('recordOrderEvent', () => {
    it('should record an order event', () => {
      // First create the order
      const order: Order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };
      auditTrail.recordOrder(order);
      
      auditTrail.recordOrderEvent('test-order-1', 'CREATED', 'Order created');

      const events = auditTrail.getOrderEvents('test-order-1');
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('CREATED');
      expect(events[0].details).toBe('Order created');
    });

    it('should record multiple events for an order', () => {
      // First create the order
      const order: Order = {
        orderId: 'test-order-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '10',
      };
      auditTrail.recordOrder(order);
      
      auditTrail.recordOrderEvent('test-order-1', 'CREATED', 'Order created');
      auditTrail.recordOrderEvent('test-order-1', 'PARTIALLY_FILLED', 'Filled 5 units');
      auditTrail.recordOrderEvent('test-order-1', 'MATCHED', 'Fully filled');

      const events = auditTrail.getOrderEvents('test-order-1');
      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe('CREATED');
      expect(events[1].eventType).toBe('PARTIALLY_FILLED');
      expect(events[2].eventType).toBe('MATCHED');
    });
  });

  describe('getOrders', () => {
    beforeEach(() => {
      // Add some test data
      const order1: Order = {
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'MATCHED',
        createdAt: Date.now() - 1000,
        filledSize: '10',
        remainingSize: '0',
      };

      const order2: Order = {
        orderId: 'order-2',
        tokenId: '0xtoken2',
        side: 'SELL',
        price: '0.45',
        size: '5',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '5',
      };

      auditTrail.recordOrder(order1);
      auditTrail.recordOrder(order2);
    });

    it('should get all orders', () => {
      const orders = auditTrail.getOrders();
      expect(orders).toHaveLength(2);
    });

    it('should filter orders by tokenId', () => {
      const orders = auditTrail.getOrders({ tokenId: '0xtoken1' });
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('order-1');
    });

    it('should filter orders by status', () => {
      const orders = auditTrail.getOrders({ status: 'OPEN' });
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('order-2');
    });

    it('should limit the number of results', () => {
      const orders = auditTrail.getOrders({ limit: 1 });
      expect(orders).toHaveLength(1);
    });
  });

  describe('getFills', () => {
    beforeEach(() => {
      // Add orders first
      const order1: Order = {
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'MATCHED',
        createdAt: Date.now(),
        filledSize: '10',
        remainingSize: '0',
      };

      const order2: Order = {
        orderId: 'order-2',
        tokenId: '0xtoken2',
        side: 'SELL',
        price: '0.45',
        size: '5',
        status: 'MATCHED',
        createdAt: Date.now(),
        filledSize: '5',
        remainingSize: '0',
      };

      auditTrail.recordOrder(order1);
      auditTrail.recordOrder(order2);
      
      // Add some test data
      const fill1: Fill = {
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '10',
        timestamp: Date.now() - 1000,
        fee: '0.011',
      };

      const fill2: Fill = {
        orderId: 'order-2',
        tokenId: '0xtoken2',
        side: 'SELL',
        price: '0.45',
        size: '5',
        timestamp: Date.now(),
        fee: '0.0045',
      };

      auditTrail.recordFill(fill1);
      auditTrail.recordFill(fill2);
    });

    it('should get all fills', () => {
      const fills = auditTrail.getFills();
      expect(fills).toHaveLength(2);
    });

    it('should filter fills by orderId', () => {
      const fills = auditTrail.getFills({ orderId: 'order-1' });
      expect(fills).toHaveLength(1);
      expect(fills[0].orderId).toBe('order-1');
    });

    it('should filter fills by tokenId', () => {
      const fills = auditTrail.getFills({ tokenId: '0xtoken2' });
      expect(fills).toHaveLength(1);
      expect(fills[0].tokenId).toBe('0xtoken2');
    });
  });

  describe('getStatistics', () => {
    beforeEach(() => {
      // Add test orders
      const order1: Order = {
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '10',
        status: 'MATCHED',
        createdAt: Date.now(),
        filledSize: '10',
        remainingSize: '0',
      };

      const order2: Order = {
        orderId: 'order-2',
        tokenId: '0xtoken1',
        side: 'SELL',
        price: '0.45',
        size: '5',
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '5',
      };

      auditTrail.recordOrder(order1);
      auditTrail.recordOrder(order2);

      // Add test fills
      const fill1: Fill = {
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '10',
        timestamp: Date.now(),
        fee: '0.011',
      };

      auditTrail.recordFill(fill1);
    });

    it('should calculate statistics', () => {
      const stats = auditTrail.getStatistics();
      expect(stats.totalOrders).toBe(2);
      expect(stats.totalFills).toBe(1);
      expect(stats.totalVolume).toBe(10);
      expect(stats.ordersByStatus['MATCHED']).toBe(1);
      expect(stats.ordersByStatus['OPEN']).toBe(1);
    });

    it('should filter statistics by tokenId', () => {
      const stats = auditTrail.getStatistics({ tokenId: '0xtoken1' });
      expect(stats.totalOrders).toBe(2);
      expect(stats.totalFills).toBe(1);
    });
  });
});
