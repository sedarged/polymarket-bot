import { describe, it, expect, beforeEach } from 'vitest';
import { TradingClient } from '../src/clients/tradingClient';

/**
 * Comprehensive tests for partial fill tracking (EE-001)
 * 
 * These tests validate:
 * - Partial fill detection and state updates
 * - Multi-step fills (multiple partial fills per order)
 * - Position calculation with partial fills
 * - Cancellation of partially filled orders
 * - Reconciliation and missed fill detection
 * - Edge cases (zero fills, over-fills, cross-session recovery)
 */
describe('Partial Fill Tracking (EE-001)', () => {
  let client: TradingClient;

  beforeEach(() => {
    client = new TradingClient();
  });

  describe('Fill Event Processing', () => {
    it('should process a partial fill event correctly', () => {
      // Add a test order
      const order = {
        orderId: 'test-order-1',
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

      // Process a partial fill
      client.handleFill({
        orderId: 'test-order-1',
        fillId: 'fill-1',
        price: '0.50',
        size: '30',
        fee: '0.03',
        timestamp: Date.now(),
      });

      const updatedState = client.getState();
      const updatedOrder = updatedState.orders.find(o => o.orderId === 'test-order-1');

      expect(updatedOrder).toBeDefined();
      expect(updatedOrder!.status).toBe('PARTIALLY_FILLED');
      expect(updatedOrder!.filledSize).toBe('30');
      expect(updatedOrder!.remainingSize).toBe('70');

      const fills = updatedState.fills;
      expect(fills).toHaveLength(1);
      expect(fills[0].orderId).toBe('test-order-1');
      expect(fills[0].size).toBe('30');
    });

    it('should handle multiple partial fills on the same order', () => {
      
      
      const order = {
        orderId: 'test-order-2',
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

      // First partial fill
      client.handleFill({
        orderId: 'test-order-2',
        fillId: 'fill-1',
        price: '0.50',
        size: '30',
        timestamp: Date.now(),
      });

      let updatedState = client.getState();
      let updatedOrder = updatedState.orders.find(o => o.orderId === 'test-order-2');

      expect(updatedOrder!.status).toBe('PARTIALLY_FILLED');
      expect(updatedOrder!.filledSize).toBe('30');
      expect(updatedOrder!.remainingSize).toBe('70');

      // Second partial fill
      client.handleFill({
        orderId: 'test-order-2',
        fillId: 'fill-2',
        price: '0.50',
        size: '40',
        timestamp: Date.now(),
      });

      updatedState = client.getState();
      updatedOrder = updatedState.orders.find(o => o.orderId === 'test-order-2');

      expect(updatedOrder!.status).toBe('PARTIALLY_FILLED');
      expect(updatedOrder!.filledSize).toBe('70');
      expect(updatedOrder!.remainingSize).toBe('30');

      expect(updatedState.fills).toHaveLength(2);
    });

    it('should transition to MATCHED when order is fully filled', () => {
      
      
      const order = {
        orderId: 'test-order-3',
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

      // Partial fill
      client.handleFill({
        orderId: 'test-order-3',
        price: '0.50',
        size: '60',
        timestamp: Date.now(),
      });

      let updatedOrder = client.getState().orders.find(o => o.orderId === 'test-order-3');
      expect(updatedOrder!.status).toBe('PARTIALLY_FILLED');

      // Complete the fill
      client.handleFill({
        orderId: 'test-order-3',
        price: '0.50',
        size: '40',
        timestamp: Date.now(),
      });

      updatedOrder = client.getState().orders.find(o => o.orderId === 'test-order-3');
      expect(updatedOrder!.status).toBe('MATCHED');
      expect(updatedOrder!.filledSize).toBe('100');
      expect(updatedOrder!.remainingSize).toBe('0');
    });

    it('should handle fill for unknown order gracefully', () => {
      // This should not throw
      expect(() => {
        client.handleFill({
          orderId: 'unknown-order',
          price: '0.50',
          size: '10',
          timestamp: Date.now(),
        });
      }).not.toThrow();

      // No fills should be recorded
      expect(client.getState().fills).toHaveLength(0);
    });
  });

  describe('Position Calculation with Partial Fills', () => {
    it('should calculate position correctly with partial fills', () => {
      
      
      // Add an order
      const order = {
        orderId: 'test-order-4',
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

      // Process partial fills
      client.handleFill({
        orderId: 'test-order-4',
        price: '0.50',
        size: '30',
        timestamp: Date.now(),
      });

      client.handleFill({
        orderId: 'test-order-4',
        price: '0.51',
        size: '20',
        timestamp: Date.now(),
      });

      const positions = client.getState().positions;
      expect(positions).toHaveLength(1);
      expect(positions[0].tokenId).toBe('0xtoken123');
      expect(positions[0].size).toBe('50');
      
      // Average price uses the order price, not individual fill prices
      // This is a simplification in the current implementation
      const avgPrice = Number(positions[0].averagePrice);
      expect(avgPrice).toBeCloseTo(0.50, 3);
    });

    it('should handle closing position with partial fills', () => {
      
      
      // Open a long position
      const buyOrder = {
        orderId: 'buy-order',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '100',
      };
      
      client._addTestOrder(buyOrder);
      
      // Fill the buy order
      client.handleFill({
        orderId: 'buy-order',
        price: '0.50',
        size: '100',
        timestamp: Date.now(),
      });

      let positions = client.getState().positions;
      expect(positions).toHaveLength(1);
      expect(positions[0].size).toBe('100');
      
      // Create a sell order to close
      const sellOrder = {
        orderId: 'sell-order',
        tokenId: '0xtoken123',
        side: 'SELL' as const,
        price: '0.55',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now() + 1000,
        filledSize: '0',
        remainingSize: '100',
      };
      
      client._addTestOrder(sellOrder);

      // Partially close the position
      client.handleFill({
        orderId: 'sell-order',
        price: '0.55',
        size: '60',
        timestamp: Date.now() + 1000,
      });

      positions = client.getState().positions;
      expect(positions).toHaveLength(1);
      expect(positions[0].size).toBe('40'); // 100 - 60 = 40 remaining
    });

    it('should track positions correctly across multiple tokens with partial fills', () => {
      
      
      // Token 1 order
      const order1 = {
        orderId: 'order-token1',
        tokenId: '0xtoken1',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '100',
      };
      
      // Token 2 order
      const order2 = {
        orderId: 'order-token2',
        tokenId: '0xtoken2',
        side: 'BUY' as const,
        price: '0.30',
        size: '50',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '50',
      };
      
      client._addTestOrder(order1);
      client._addTestOrder(order2);

      // Partial fill on token 1
      client.handleFill({
        orderId: 'order-token1',
        price: '0.50',
        size: '60',
        timestamp: Date.now(),
      });

      // Partial fill on token 2
      client.handleFill({
        orderId: 'order-token2',
        price: '0.30',
        size: '30',
        timestamp: Date.now(),
      });

      const positions = client.getState().positions;
      expect(positions).toHaveLength(2);
      
      const pos1 = positions.find(p => p.tokenId === '0xtoken1');
      const pos2 = positions.find(p => p.tokenId === '0xtoken2');
      
      expect(pos1!.size).toBe('60');
      expect(pos2!.size).toBe('30');
    });
  });

  describe('Reconciliation and Missed Fills', () => {
    it('should detect missed fill during reconciliation', () => {
      
      
      // Add an order with some filled size
      const order = {
        orderId: 'order-1',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '30',
        remainingSize: '70',
      };
      
      client._addTestOrder(order);

      // Simulate CLOB API returning more filled size
      const clobOrder = {
        id: 'order-1',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        originalSize: 100,
        sizeMatched: 80, // Increased from 30 to 80
        status: 'LIVE',
        created_at: Date.now(),
      };

      client.updateOrderState(clobOrder);

      const updatedState = client.getState();
      const updatedOrder = updatedState.orders.find(o => o.orderId === 'order-1');

      // Order should be updated with new fill amount
      expect(updatedOrder!.filledSize).toBe('80');
      expect(updatedOrder!.remainingSize).toBe('20');
      expect(updatedOrder!.status).toBe('PARTIALLY_FILLED');

      // A synthetic fill should be created for the missed amount
      const fills = updatedState.fills;
      expect(fills.length).toBeGreaterThan(0);
      const missedFill = fills.find(f => f.orderId === 'order-1');
      expect(missedFill).toBeDefined();
      expect(missedFill!.size).toBe('50'); // 80 - 30 = 50 missed
    });

    it('should handle discovery of fully filled order during reconciliation', () => {
      
      
      const order = {
        orderId: 'order-2',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '60',
        remainingSize: '40',
      };
      
      client._addTestOrder(order);

      // CLOB reports order is fully filled
      const clobOrder = {
        id: 'order-2',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        originalSize: 100,
        sizeMatched: 100,
        status: 'MATCHED',
        created_at: Date.now(),
      };

      client.updateOrderState(clobOrder);

      const updatedOrder = client.getState().orders.find(o => o.orderId === 'order-2');
      expect(updatedOrder!.status).toBe('MATCHED');
      expect(updatedOrder!.filledSize).toBe('100');
      expect(updatedOrder!.remainingSize).toBe('0');
    });

    it('should discover new orders during reconciliation', () => {
      // Start with empty state
      const initialOrders = client.getState().orders.length;

      // Simulate discovering an order from CLOB API
      const clobOrder = {
        id: 'new-order',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        originalSize: 100,
        sizeMatched: 0,
        status: 'LIVE',
        created_at: Date.now(),
      };

      client.updateOrderState(clobOrder);

      const orders = client.getState().orders;
      expect(orders.length).toBe(initialOrders + 1);
      
      const newOrder = orders.find(o => o.orderId === 'new-order');
      expect(newOrder).toBeDefined();
      expect(newOrder!.tokenId).toBe('0xtoken123');
      expect(newOrder!.status).toBe('OPEN');
    });
  });

  describe('Edge Cases', () => {
    it('should handle cancellation of partially filled order', () => {
      
      
      const order = {
        orderId: 'cancel-order',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'PARTIALLY_FILLED' as const,
        createdAt: Date.now(),
        filledSize: '40',
        remainingSize: '60',
      };
      
      client._addTestOrder(order);

      // Simulate cancellation via CLOB
      const clobOrder = {
        id: 'cancel-order',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        originalSize: 100,
        sizeMatched: 40,
        status: 'CANCELLED',
        created_at: Date.now(),
      };

      client.updateOrderState(clobOrder);

      const updatedOrder = client.getState().orders.find(o => o.orderId === 'cancel-order');
      expect(updatedOrder!.status).toBe('CANCELLED');
      expect(updatedOrder!.filledSize).toBe('40');
      expect(updatedOrder!.remainingSize).toBe('60');
    });

    it('should not create fill when filled size decreased (should not happen)', () => {
      
      
      const order = {
        orderId: 'order-decrease',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'PARTIALLY_FILLED' as const,
        createdAt: Date.now(),
        filledSize: '60',
        remainingSize: '40',
      };
      
      client._addTestOrder(order);
      
      const initialFillCount = client.getState().fills.length;

      // Simulate CLOB reporting less filled size (anomaly)
      const clobOrder = {
        id: 'order-decrease',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        originalSize: 100,
        sizeMatched: 50, // Decreased from 60 to 50
        status: 'LIVE',
        created_at: Date.now(),
      };

      client.updateOrderState(clobOrder);

      // Should update state but not create a fill
      const fillCount = client.getState().fills.length;
      expect(fillCount).toBe(initialFillCount);
      
      const updatedOrder = client.getState().orders.find(o => o.orderId === 'order-decrease');
      expect(updatedOrder!.filledSize).toBe('50');
    });

    it('should handle zero-size orders gracefully', () => {
      
      
      const order = {
        orderId: 'zero-order',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '0',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '0',
      };
      
      client._addTestOrder(order);

      // Try to fill a zero-size order
      client.handleFill({
        orderId: 'zero-order',
        price: '0.50',
        size: '0',
        timestamp: Date.now(),
      });

      const updatedOrder = client.getState().orders.find(o => o.orderId === 'zero-order');
      expect(updatedOrder!.status).toBe('MATCHED'); // 0 >= 0
      expect(updatedOrder!.filledSize).toBe('0');
    });
  });

  describe('Idempotency and Deduplication', () => {
    it('should ignore duplicate fills with same fillId', () => {
      const order = {
        orderId: 'test-order-dup',
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

      // First fill with fillId
      client.handleFill({
        orderId: 'test-order-dup',
        fillId: 'fill-123',
        price: '0.50',
        size: '30',
        timestamp: Date.now(),
      });

      const state1 = client.getState();
      expect(state1.orders[0].filledSize).toBe('30');
      expect(state1.fills).toHaveLength(1);

      // Duplicate fill with same fillId (should be ignored)
      client.handleFill({
        orderId: 'test-order-dup',
        fillId: 'fill-123',
        price: '0.50',
        size: '30',
        timestamp: Date.now(),
      });

      const state2 = client.getState();
      expect(state2.orders[0].filledSize).toBe('30'); // Still 30, not 60
      expect(state2.fills).toHaveLength(1); // Still only 1 fill
    });

    it('should process fills without fillId (no deduplication)', () => {
      const order = {
        orderId: 'test-order-nodup',
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

      // Fills without fillId
      client.handleFill({
        orderId: 'test-order-nodup',
        price: '0.50',
        size: '30',
        timestamp: Date.now(),
      });

      client.handleFill({
        orderId: 'test-order-nodup',
        price: '0.50',
        size: '20',
        timestamp: Date.now(),
      });

      const state = client.getState();
      expect(state.orders[0].filledSize).toBe('50'); // Both fills processed
      expect(state.fills).toHaveLength(2);
    });
  });

  describe('Overfill Protection', () => {
    it('should cap fill size to remaining size', () => {
      const order = {
        orderId: 'test-overfill',
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

      // Try to fill more than order size
      client.handleFill({
        orderId: 'test-overfill',
        price: '0.50',
        size: '150', // Exceeds order size
        timestamp: Date.now(),
      });

      const state = client.getState();
      expect(state.orders[0].filledSize).toBe('100'); // Capped at order size
      expect(state.orders[0].remainingSize).toBe('0');
      expect(state.orders[0].status).toBe('MATCHED');
    });

    it('should handle partial fill then overfill attempt', () => {
      const order = {
        orderId: 'test-overfill-2',
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

      // First fill
      client.handleFill({
        orderId: 'test-overfill-2',
        price: '0.50',
        size: '60',
        timestamp: Date.now(),
      });

      expect(client.getState().orders[0].filledSize).toBe('60');

      // Second fill exceeds remaining
      client.handleFill({
        orderId: 'test-overfill-2',
        price: '0.50',
        size: '80', // Only 40 remaining
        timestamp: Date.now(),
      });

      const state = client.getState();
      expect(state.orders[0].filledSize).toBe('100'); // Capped
      expect(state.orders[0].remainingSize).toBe('0');
      expect(state.orders[0].status).toBe('MATCHED');
    });
  });

  describe('Cancelled Order Handling', () => {
    it('should preserve CANCELLED status when receiving fills', () => {
      const order = {
        orderId: 'test-cancelled-fill',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'CANCELLED' as const,
        createdAt: Date.now(),
        filledSize: '30',
        remainingSize: '70',
      };
      
      client._addTestOrder(order);

      // Late fill arrives after cancellation
      client.handleFill({
        orderId: 'test-cancelled-fill',
        price: '0.50',
        size: '20',
        timestamp: Date.now(),
      });

      const state = client.getState();
      expect(state.orders[0].status).toBe('CANCELLED'); // Still cancelled
      expect(state.orders[0].filledSize).toBe('50'); // But filled size updated
      expect(state.orders[0].remainingSize).toBe('50');
    });

    it('should include cancelled orders with fills in position calculation', () => {
      const cancelledOrder = {
        orderId: 'cancelled-with-fills',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'CANCELLED' as const,
        createdAt: Date.now(),
        filledSize: '40',
        remainingSize: '60',
      };
      
      client._addTestOrder(cancelledOrder);

      // Fill to update positions
      client.handleFill({
        orderId: 'cancelled-with-fills',
        price: '0.50',
        size: '0', // Trigger position recalc without adding more
        timestamp: Date.now(),
      });

      const positions = client.getState().positions;
      expect(positions).toHaveLength(1);
      expect(positions[0].size).toBe('40'); // Cancelled order's filled amount
    });
  });

  describe('Reconciliation Edge Cases', () => {
    it('should sync CANCELLED status after missed fill', () => {
      const order = {
        orderId: 'test-cancel-sync',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '30',
        remainingSize: '70',
      };
      
      client._addTestOrder(order);

      // CLOB reports more fills AND cancelled
      const clobOrder = {
        id: 'test-cancel-sync',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        originalSize: 100,
        sizeMatched: 50,
        status: 'CANCELLED',
        created_at: Date.now(),
      };

      client.updateOrderState(clobOrder);

      const state = client.getState();
      expect(state.orders[0].status).toBe('CANCELLED'); // Synced
      expect(state.orders[0].filledSize).toBe('50'); // Updated via missed fill
    });

    it('should recalculate positions on reconciliation adjustments', () => {
      const order = {
        orderId: 'test-recon-pos',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'PARTIALLY_FILLED' as const,
        createdAt: Date.now(),
        filledSize: '50',
        remainingSize: '50',
      };
      
      client._addTestOrder(order);

      // Trigger position calculation
      client.handleFill({
        orderId: 'test-recon-pos',
        price: '0.50',
        size: '0',
        timestamp: Date.now(),
      });

      let positions = client.getState().positions;
      expect(positions).toHaveLength(1);
      expect(positions[0].size).toBe('50');

      // CLOB reports different filled size (anomaly)
      const clobOrder = {
        id: 'test-recon-pos',
        asset_id: '0xtoken123',
        side: 'BUY',
        price: 0.50,
        originalSize: 100,
        sizeMatched: 40, // Decreased
        status: 'LIVE',
        created_at: Date.now(),
      };

      client.updateOrderState(clobOrder);

      positions = client.getState().positions;
      expect(positions).toHaveLength(1);
      expect(positions[0].size).toBe('40'); // Position updated
    });
  });
});
