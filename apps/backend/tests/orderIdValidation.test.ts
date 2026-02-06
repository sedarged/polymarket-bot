import { describe, it, expect, beforeEach } from 'vitest';
import { TradingClient } from '../src/clients/tradingClient';

/**
 * Tests for Audit Finding A-013: Undefined Order ID Validation
 * 
 * These tests verify that the trading client properly validates and rejects
 * orders with undefined, null, or empty order IDs to prevent state corruption
 * and crashes during reconciliation.
 * 
 * Audit Finding: A-013 (MEDIUM) - Undefined Order ID
 * File: apps/backend/src/clients/tradingClient.ts:L1109-1163 (mapOrder method)
 * 
 * Issue: Orders with missing/empty IDs can't be cancelled or reconciled properly.
 * This leads to phantom orders in local state that can never be matched with
 * exchange data, causing position drift and incorrect PnL calculations.
 * 
 * Fix: Reject orders with undefined, null, or empty orderIds with clear error logging.
 */
describe('Order ID Validation (A-013)', () => {
  let client: TradingClient;

  beforeEach(() => {
    client = new TradingClient();
  });

  describe('mapOrder validation', () => {
    it('should reject orders with undefined orderId', () => {
      const clobOrder = {
        // No id or orderID field
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        size: 100,
        status: 'LIVE',
      };

      // mapOrder is private, so we test via updateOrderState
      client.updateOrderState(clobOrder as any);

      // Order should not be added to state
      const state = client.getState();
      expect(state.orders).toHaveLength(0);
    });

    it('should reject orders with null orderId', () => {
      const clobOrder = {
        id: null,
        orderID: null,
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        size: 100,
        status: 'LIVE',
      };

      client.updateOrderState(clobOrder as any);

      const state = client.getState();
      expect(state.orders).toHaveLength(0);
    });

    it('should reject orders with empty string orderId', () => {
      const clobOrder = {
        id: '',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        size: 100,
        status: 'LIVE',
      };

      client.updateOrderState(clobOrder as any);

      const state = client.getState();
      expect(state.orders).toHaveLength(0);
    });

    it('should reject orders with whitespace-only orderId', () => {
      const clobOrder = {
        id: '   ',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        size: 100,
        status: 'LIVE',
      };

      client.updateOrderState(clobOrder as any);

      const state = client.getState();
      expect(state.orders).toHaveLength(0);
    });

    it('should accept orders with valid orderId', () => {
      const clobOrder = {
        id: 'valid-order-123',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        size: 100,
        status: 'LIVE',
      };

      client.updateOrderState(clobOrder as any);

      const state = client.getState();
      expect(state.orders).toHaveLength(1);
      expect(state.orders[0].orderId).toBe('valid-order-123');
    });

    it('should accept orders with valid orderID (alternative field)', () => {
      const clobOrder = {
        orderID: 'valid-order-456',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        size: 100,
        status: 'LIVE',
      };

      client.updateOrderState(clobOrder as any);

      const state = client.getState();
      expect(state.orders).toHaveLength(1);
      expect(state.orders[0].orderId).toBe('valid-order-456');
    });

    it('should reject orders with missing tokenId as well', () => {
      const clobOrder = {
        id: 'valid-order-789',
        // No asset_id or tokenID field
        side: 'BUY',
        price: 0.50,
        size: 100,
        status: 'LIVE',
      };

      client.updateOrderState(clobOrder as any);

      const state = client.getState();
      expect(state.orders).toHaveLength(0);
    });
  });

  describe('handleFill validation', () => {
    it('should not crash with undefined orderId in fill event', () => {
      // Add a valid order first
      const order = {
        orderId: 'test-order',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '100',
      };
      
      client._addTestOrder(order);

      // Try to process fill for non-existent order (undefined)
      expect(() => {
        client.handleFill({
          orderId: undefined as any,
          price: '0.50',
          size: '30',
        });
      }).not.toThrow();

      // Original order should be unchanged
      const state = client.getState();
      expect(state.orders[0].status).toBe('OPEN');
      expect(state.fills).toHaveLength(0);
    });

    it('should handle fills for non-existent orderIds gracefully', () => {
      // No orders in state

      // Process fill for non-existent order
      client.handleFill({
        orderId: 'non-existent-order',
        price: '0.50',
        size: '30',
      });

      // No crash, fill ignored
      const state = client.getState();
      expect(state.orders).toHaveLength(0);
      expect(state.fills).toHaveLength(0);
    });

    it('should handle fills with empty orderId gracefully', () => {
      // Try to process fill with empty orderId
      expect(() => {
        client.handleFill({
          orderId: '',
          price: '0.50',
          size: '30',
        });
      }).not.toThrow();

      // No fills recorded
      const state = client.getState();
      expect(state.fills).toHaveLength(0);
    });
  });

  describe('Reconciliation with invalid order IDs', () => {
    it('should skip orders with missing IDs during reconciliation', () => {
      // Start with one valid order
      const validOrder = {
        orderId: 'valid-order',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '100',
      };
      
      client._addTestOrder(validOrder);

      // Try to add orders with invalid IDs via updateOrderState
      const invalidOrders = [
        { id: '', asset_id: '0xtoken123', side: 'BUY', price: 0.50, size: 100, status: 'LIVE' },
        { id: null, asset_id: '0xtoken123', side: 'BUY', price: 0.50, size: 100, status: 'LIVE' },
        { asset_id: '0xtoken123', side: 'BUY', price: 0.50, size: 100, status: 'LIVE' }, // no id
      ];

      for (const order of invalidOrders) {
        client.updateOrderState(order as any);
      }

      // Only the valid order should remain
      const state = client.getState();
      expect(state.orders).toHaveLength(1);
      expect(state.orders[0].orderId).toBe('valid-order');
    });

    it('should not corrupt state when processing orders with invalid IDs', () => {
      // Process valid order first
      const validOrder1 = {
        id: 'order-1',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        size: 100,
        sizeMatched: 50,
        status: 'LIVE',
      };
      client.updateOrderState(validOrder1 as any);

      // Try to process invalid order
      const invalidOrder = {
        id: '',
        asset_id: '0xtoken456',
        side: 'SELL',
        price: 0.60,
        size: 200,
        status: 'LIVE',
      };
      client.updateOrderState(invalidOrder as any);

      // Process another valid order
      const validOrder2 = {
        id: 'order-2',
        asset_id: '0xtoken789',
        side: 'SELL',
        price: 0.40,
        size: 150,
        status: 'LIVE',
      };
      client.updateOrderState(validOrder2 as any);

      const state = client.getState();
      expect(state.orders).toHaveLength(2);
      expect(state.orders.map(o => o.orderId).sort()).toEqual(['order-1', 'order-2']);
      
      // Verify positions calculated correctly despite invalid order attempt
      expect(() => client.getState().positions).not.toThrow();
    });
  });
});
