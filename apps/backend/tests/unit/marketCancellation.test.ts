import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingClient } from '../../src/clients/tradingClient';

/**
 * Market-Specific Cancellation Tests - PR-006
 * 
 * Tests for cancelMarketOrders() method which provides selective
 * order cancellation for a specific market using the DELETE /orders/market endpoint.
 * 
 * Related Issue: #234 (PR-006), #227 (CLOB API Expansion)
 */

vi.mock('../../src/config', () => ({
  config: {
    liveTrading: true,
    complianceAccepted: true,
    privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    clobApiUrl: 'https://clob.polymarket.com',
    gammaApiUrl: 'https://gamma-api.polymarket.com',
    wsMarketUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    enablePeriodicReconciliation: false,
    reconciliationIntervalMs: 300000,
    retryAttempts: 3,
    retryDelay: 1000,
    retryTotalTimeout: 30000,
  },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/utils/metrics', () => ({
  orderCancellations: {
    inc: vi.fn(),
  },
  openOrders: {
    dec: vi.fn(),
    inc: vi.fn(),
    set: vi.fn(),
  },
  ordersTotal: {
    inc: vi.fn(),
  },
}));

describe('TradingClient - Market-Specific Cancellation (PR-006)', () => {
  let client: TradingClient;
  let mockClobClient: any;

  // Helper function to create mock orders
  const createMockOrder = (
    orderId: string,
    tokenId: string,
    status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED',
    filledSize: string = '0',
    size: string = '100'
  ) => ({
    orderId,
    tokenId,
    status,
    clientOrderId: `client-${orderId}`,
    side: 'BUY' as const,
    price: '0.5',
    size,
    createdAt: Date.now(),
    filledSize,
    remainingSize: String(Number(size) - Number(filledSize)),
  });

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    client = new TradingClient();
    
    // Mock the internal SDK client
    mockClobClient = {
      cancelMarketOrders: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      postOrders: vi.fn(),
      cancelOrder: vi.fn(),
      cancelAll: vi.fn(),
    };
    
    // Inject mock client
    (client as any).client = mockClobClient;
    (client as any).wallet = { address: '0xtest' };
  });

  describe('cancelMarketOrders', () => {
    it('should cancel all orders for a specific token', async () => {
      // Set up test state with orders from multiple markets
      (client as any).state.orders = [
        createMockOrder('order1', 'token-abc', 'OPEN'),
        createMockOrder('order2', 'token-abc', 'PARTIALLY_FILLED', '50', '200'),
        createMockOrder('order3', 'token-xyz', 'OPEN'),
      ];

      await client.cancelMarketOrders('token-abc');

      // Verify SDK method was called with correct params
      expect(mockClobClient.cancelMarketOrders).toHaveBeenCalledWith({
        market: 'token-abc',
        asset_id: undefined,
      });

      // Verify local state was updated correctly
      const state = client.getState();
      expect(state.orders[0].status).toBe('CANCELLED'); // order1
      expect(state.orders[1].status).toBe('CANCELLED'); // order2
      expect(state.orders[2].status).toBe('OPEN'); // order3 (different market)
    });

    it('should support assetId parameter', async () => {
      (client as any).state.orders = [];

      await client.cancelMarketOrders(undefined, 'asset-123');

      expect(mockClobClient.cancelMarketOrders).toHaveBeenCalledWith({
        market: undefined,
        asset_id: 'asset-123',
      });
    });

    it('should throw error if neither tokenId nor assetId provided', async () => {
      await expect(client.cancelMarketOrders()).rejects.toThrow(
        'Either tokenId or assetId must be provided'
      );
    });

    it('should throw error if client not initialized', async () => {
      (client as any).client = null;

      await expect(client.cancelMarketOrders('token-abc')).rejects.toThrow(
        'Trading client not initialized'
      );
    });

    it('should handle empty order list gracefully', async () => {
      (client as any).state.orders = [];

      await client.cancelMarketOrders('token-abc');

      expect(mockClobClient.cancelMarketOrders).toHaveBeenCalled();
      // Should not throw
    });

    it('should only cancel open and partially filled orders', async () => {
      (client as any).state.orders = [
        createMockOrder('order1', 'token-abc', 'OPEN'),
        createMockOrder('order2', 'token-abc', 'FILLED', '100'),
        createMockOrder('order3', 'token-abc', 'CANCELLED'),
        createMockOrder('order4', 'token-abc', 'PARTIALLY_FILLED', '50'),
      ];

      await client.cancelMarketOrders('token-abc');

      const state = client.getState();
      expect(state.orders[0].status).toBe('CANCELLED'); // Was OPEN
      expect(state.orders[1].status).toBe('FILLED'); // Unchanged
      expect(state.orders[2].status).toBe('CANCELLED'); // Unchanged
      expect(state.orders[3].status).toBe('CANCELLED'); // Was PARTIALLY_FILLED
    });

    it('should handle API errors gracefully', async () => {
      (client as any).state.orders = [
        createMockOrder('order1', 'token-abc', 'OPEN'),
      ];

      mockClobClient.cancelMarketOrders.mockRejectedValue(
        new Error('Network error')
      );

      await expect(client.cancelMarketOrders('token-abc')).rejects.toThrow(
        'Network error'
      );

      // State should not be updated on error
      const state = client.getState();
      expect(state.orders[0].status).toBe('OPEN');
    });

    it('should log performance metrics', async () => {
      const { logger } = await import('../../src/utils/logger');
      
      (client as any).state.orders = [
        createMockOrder('order1', 'token-abc', 'OPEN'),
      ];

      await client.cancelMarketOrders('token-abc');

      expect(logger.info).toHaveBeenCalledWith(
        'Cancelling all orders for market',
        expect.objectContaining({
          tokenId: 'token-abc',
          orderCount: 1,
          method: 'cancelMarketOrders',
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Market orders cancelled',
        expect.objectContaining({
          tokenId: 'token-abc',
          totalOrders: 1,
          durationMs: expect.any(Number),
        })
      );
    });

    it('should update metrics for each cancelled order', async () => {
      const { orderCancellations, openOrders } = await import('../../src/utils/metrics');
      
      (client as any).state.orders = [
        createMockOrder('order1', 'token-abc', 'OPEN'),
        createMockOrder('order2', 'token-abc', 'PARTIALLY_FILLED', '50'),
      ];

      await client.cancelMarketOrders('token-abc');

      expect(orderCancellations.inc).toHaveBeenCalledTimes(2);
      expect(orderCancellations.inc).toHaveBeenCalledWith({ 
        reason: 'market-cancel', 
        mode: 'live' 
      });
      
      expect(openOrders.dec).toHaveBeenCalledTimes(2);
      expect(openOrders.dec).toHaveBeenCalledWith({ mode: 'live' });
    });
  });
});
