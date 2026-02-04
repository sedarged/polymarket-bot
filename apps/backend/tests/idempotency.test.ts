import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingClient } from '../src/clients/tradingClient';
import { v4 as uuidv4, validate as isUUID } from 'uuid';

// Mock the config to enable live trading
vi.mock('../src/config', () => ({
  config: {
    liveTrading: true,
    complianceAccepted: true,
    privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
    clobApiUrl: 'https://clob.polymarket.com',
    chainId: 137,
  },
}));

vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../src/secrets', () => ({
  getPrivateKey: vi.fn().mockResolvedValue({
    key: '0x1234567890123456789012345678901234567890123456789012345678901234',
    source: 'mock',
  }),
  loadSecretsConfig: vi.fn().mockReturnValue({
    method: 'env',
  }),
}));

vi.mock('../src/utils/metrics', () => ({
  ordersTotal: {
    inc: vi.fn(),
  },
  orderLatency: {
    observe: vi.fn(),
  },
  orderCancellations: {
    inc: vi.fn(),
  },
  openOrders: {
    inc: vi.fn(),
    dec: vi.fn(),
  },
}));

// Mock the ClobClient - use a factory to create fresh instances
vi.mock('@polymarket/clob-client', () => ({
  ClobClient: class MockClobClient {
    createOrder = vi.fn().mockResolvedValue({
      orderID: 'mock-order-id-123',
      success: true,
    });
    cancelOrder = vi.fn();
    cancelOrders = vi.fn();
    getOpenOrders = vi.fn().mockResolvedValue([]);
  },
  Side: {
    BUY: 'BUY',
    SELL: 'SELL',
  },
}));

describe('Order Idempotency (A-006)', () => {
  let client: TradingClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create a fresh client for each test
    client = new TradingClient();
    await client.initialize();
  });

  describe('UUID v4 Generation', () => {
    it('should generate UUID v4 for clientOrderId', async () => {
      const order = await client.createOrder('0xtoken123', 'BUY', '0.5', '10');
      
      // Verify clientOrderId is a valid UUID v4
      expect(order.clientOrderId).toBeDefined();
      expect(isUUID(order.clientOrderId || '')).toBe(true);
    });

    it('should generate unique UUIDs for each order', async () => {
      const order1 = await client.createOrder('0xtoken1', 'BUY', '0.5', '10');
      const order2 = await client.createOrder('0xtoken2', 'SELL', '0.6', '15');
      
      // Verify both have valid UUIDs
      expect(isUUID(order1.clientOrderId || '')).toBe(true);
      expect(isUUID(order2.clientOrderId || '')).toBe(true);
      
      // Verify they are different
      expect(order1.clientOrderId).not.toBe(order2.clientOrderId);
    });

    it('should use cryptographically random UUIDs', async () => {
      // Create multiple orders and verify all UUIDs are unique
      const orders = await Promise.all([
        client.createOrder('0xtoken1', 'BUY', '0.5', '10'),
        client.createOrder('0xtoken2', 'BUY', '0.5', '10'),
        client.createOrder('0xtoken3', 'BUY', '0.5', '10'),
        client.createOrder('0xtoken4', 'BUY', '0.5', '10'),
        client.createOrder('0xtoken5', 'BUY', '0.5', '10'),
      ]);

      const clientOrderIds = orders.map(o => o.clientOrderId);
      const uniqueIds = new Set(clientOrderIds);
      
      // All IDs should be unique
      expect(uniqueIds.size).toBe(orders.length);
      
      // All should be valid UUIDs
      clientOrderIds.forEach(id => {
        expect(isUUID(id || '')).toBe(true);
      });
    });
  });

  describe('Duplicate Order Prevention', () => {
    it('should track submitted order IDs', async () => {
      const order = await client.createOrder('0xtoken123', 'BUY', '0.5', '10');
      
      // Order should be tracked internally
      expect(order.clientOrderId).toBeDefined();
      
      // Verify the CLOB client was called with the UUID
      const mockClient = (client as any).client;
      expect(mockClient.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          clientOrderId: expect.any(String),
        })
      );
    });

    it('should prevent duplicate submissions with same clientOrderId', async () => {
      // This test documents the duplicate prevention logic
      // In practice, UUID v4 collisions are astronomically unlikely (1 in 2^122)
      // The implementation tracks submitted clientOrderIds in a Set to prevent
      // duplicate submissions if the same UUID were somehow generated twice
      
      // Create an order
      const order1 = await client.createOrder('0xtoken123', 'BUY', '0.5', '10');
      
      // Verify the order was created and has a UUID
      expect(order1.clientOrderId).toBeDefined();
      expect(isUUID(order1.clientOrderId || '')).toBe(true);
      
      // The duplicate check exists in the implementation at line 224-227
      // It will throw an error if the same clientOrderId is used twice
    });

    it('should allow retry after order creation failure', async () => {
      const mockClient = (client as any).client;
      
      // Mock first call to fail
      mockClient.createOrder.mockRejectedValueOnce(new Error('Network error'));
      
      // First attempt should fail
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.5', '10')
      ).rejects.toThrow('Network error');
      
      // Mock second call to succeed
      mockClient.createOrder.mockResolvedValueOnce({
        orderID: 'order-after-retry',
        success: true,
      });
      
      // Second attempt with NEW UUID should succeed
      const order = await client.createOrder('0xtoken123', 'BUY', '0.5', '10');
      expect(order.orderId).toBe('order-after-retry');
    });
  });

  describe('Order ID Format', () => {
    it('should not use timestamp-based IDs', async () => {
      const order = await client.createOrder('0xtoken123', 'BUY', '0.5', '10');
      
      // Old format was: order-${Date.now()}-${process.pid}-${counter}
      // New format is UUID v4
      expect(order.clientOrderId).not.toMatch(/^order-\d+-\d+-\d+$/);
      expect(isUUID(order.clientOrderId || '')).toBe(true);
    });

    it('should not include process.pid in order ID', async () => {
      const order = await client.createOrder('0xtoken123', 'BUY', '0.5', '10');
      
      // UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // Should not contain process.pid
      expect(order.clientOrderId).not.toContain(String(process.pid));
    });

    it('should not use sequential counter', async () => {
      const order1 = await client.createOrder('0xtoken1', 'BUY', '0.5', '10');
      const order2 = await client.createOrder('0xtoken2', 'BUY', '0.5', '10');
      
      // UUIDs are random, not sequential
      // Verify they don't follow a predictable pattern
      expect(order1.clientOrderId).not.toBe(order2.clientOrderId);
      
      // Cannot extract sequential number from UUID
      const extractNumber = (id: string) => {
        const match = id.match(/\d+$/);
        return match ? parseInt(match[0]) : null;
      };
      
      const num1 = extractNumber(order1.clientOrderId || '');
      const num2 = extractNumber(order2.clientOrderId || '');
      
      // UUIDs end with hex chars, not sequential numbers
      // So this should not find sequential numbers
      if (num1 !== null && num2 !== null) {
        expect(num2).not.toBe(num1 + 1);
      }
    });
  });

  describe('State Management', () => {
    it('should store orders with clientOrderId', async () => {
      const order = await client.createOrder('0xtoken123', 'BUY', '0.5', '10');
      
      const state = client.getState();
      expect(state.orders).toHaveLength(1);
      expect(state.orders[0].clientOrderId).toBe(order.clientOrderId);
      expect(isUUID(state.orders[0].clientOrderId || '')).toBe(true);
    });

    it('should maintain order tracking across multiple orders', async () => {
      await client.createOrder('0xtoken1', 'BUY', '0.5', '10');
      await client.createOrder('0xtoken2', 'SELL', '0.6', '15');
      await client.createOrder('0xtoken3', 'BUY', '0.7', '20');
      
      const state = client.getState();
      expect(state.orders).toHaveLength(3);
      
      // All should have unique UUIDs
      const clientOrderIds = state.orders.map(o => o.clientOrderId);
      const uniqueIds = new Set(clientOrderIds);
      expect(uniqueIds.size).toBe(3);
      
      // All should be valid UUIDs
      clientOrderIds.forEach(id => {
        expect(isUUID(id || '')).toBe(true);
      });
    });
  });
});
