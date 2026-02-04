import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TradingClient } from '../src/clients/tradingClient';

// Mock the config to enable live trading
vi.mock('../src/config', () => ({
  config: {
    liveTrading: true,
    complianceAccepted: true,
    privateKey: '0x' + '1'.repeat(64),
    clobApiUrl: 'https://clob.polymarket.com',
    chainId: 137,
    retryAttempts: 3,
    retryDelay: 1000,
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
    key: '0x' + '1'.repeat(64),
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

// Mock the ClobClient SDK
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

// Mock the ClobClient REST client
vi.mock('../src/clients/clob', () => {
  const mockGetMarketMetadata = vi.fn();
  return {
    ClobClient: class MockClobRestClient {
      getMarketMetadata = mockGetMarketMetadata;
      getOrderbook = vi.fn();
      getCircuitBreakerMetrics = vi.fn();
      resetCircuitBreaker = vi.fn();
      destroy = vi.fn();
    },
    __mockGetMarketMetadata: mockGetMarketMetadata,
  };
});

describe('TradingClient - Market Constraints', () => {
  let client: TradingClient;
  let mockGetMarketMetadata: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mock function from the module
    const clobModule = await import('../src/clients/clob');
    mockGetMarketMetadata = (clobModule as any).__mockGetMarketMetadata;
    
    // Default mock: return valid market metadata
    mockGetMarketMetadata.mockResolvedValue({
      tickSize: '0.01',
      minOrderSize: '1',
    });
    
    client = new TradingClient();
    await client.initialize();
  });

  afterEach(() => {
    client.destroy();
  });

  describe('Market Metadata Fetching', () => {
    it('should fetch market metadata on first order', async () => {
      await client.createOrder('0xtoken123', 'BUY', '0.55', '10');
      
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(1);
      expect(mockGetMarketMetadata).toHaveBeenCalledWith('0xtoken123');
    });

    it('should cache market metadata for subsequent orders', async () => {
      await client.createOrder('0xtoken123', 'BUY', '0.55', '10');
      await client.createOrder('0xtoken123', 'SELL', '0.60', '15');
      
      // Should only call API once due to caching
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(1);
    });

    it('should fetch metadata separately for different tokens', async () => {
      await client.createOrder('0xtoken1', 'BUY', '0.55', '10');
      await client.createOrder('0xtoken2', 'BUY', '0.60', '15');
      
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(2);
      expect(mockGetMarketMetadata).toHaveBeenCalledWith('0xtoken1');
      expect(mockGetMarketMetadata).toHaveBeenCalledWith('0xtoken2');
    });

    it('should throw error when API fails to fetch metadata', async () => {
      mockGetMarketMetadata.mockRejectedValueOnce(new Error('API error'));
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.55', '10')
      ).rejects.toThrow('Cannot validate order: failed to fetch market constraints');
    });

    it('should reject invalid tick size from API', async () => {
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: '0.05', // Invalid tick size
        minOrderSize: '1',
      });
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.55', '10')
      ).rejects.toThrow('Invalid tick size from market metadata');
    });

    it('should reject non-string tick size from API', async () => {
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: 0.01, // Number instead of string
        minOrderSize: '1',
      });
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.55', '10')
      ).rejects.toThrow('Invalid tick size from market metadata');
    });

    it('should accept all valid tick sizes', async () => {
      const validTickSizes = ['0.1', '0.01', '0.001', '0.0001'];
      
      for (const tickSize of validTickSizes) {
        mockGetMarketMetadata.mockResolvedValueOnce({
          tickSize,
          minOrderSize: '1',
        });
        
        // Use a price that aligns with this tick size
        const price = tickSize === '0.1' ? '0.5' : '0.55';
        await client.createOrder(`0xtoken-${tickSize}`, 'BUY', price, '10');
      }
      
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(4);
    });
  });

  describe('Order Validation with Constraints', () => {
    it('should reject order with price not aligned to tick size', async () => {
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: '0.01',
        minOrderSize: '1',
      });
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.555', '10') // 0.555 not aligned with 0.01
      ).rejects.toThrow('price must align with tick size');
    });

    it('should reject order below minimum size', async () => {
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: '0.01',
        minOrderSize: '10',
      });
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.55', '5') // 5 < 10
      ).rejects.toThrow('size must be at least');
    });

    it('should accept order that meets all constraints', async () => {
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: '0.01',
        minOrderSize: '1',
      });
      
      const order = await client.createOrder('0xtoken123', 'BUY', '0.55', '10');
      
      expect(order).toBeDefined();
      expect(order.price).toBe('0.55');
      expect(order.size).toBe('10');
    });

    it('should validate with different tick sizes correctly', async () => {
      // Tick size 0.001 allows more precision
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: '0.001',
        minOrderSize: '1',
      });
      
      const order = await client.createOrder('0xtoken123', 'BUY', '0.555', '10');
      
      expect(order).toBeDefined();
      expect(order.price).toBe('0.555');
    });
  });

  describe('Cache Management', () => {
    it('should clear cache for specific token', async () => {
      await client.createOrder('0xtoken123', 'BUY', '0.55', '10');
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(1);
      
      // Clear cache for this token
      client.clearMarketConstraintsCache('0xtoken123');
      
      // Next order should fetch again
      await client.createOrder('0xtoken123', 'BUY', '0.55', '10');
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache entries', async () => {
      await client.createOrder('0xtoken1', 'BUY', '0.55', '10');
      await client.createOrder('0xtoken2', 'BUY', '0.55', '10');
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(2);
      
      // Clear all cache
      client.clearMarketConstraintsCache();
      
      // Next orders should fetch again
      mockGetMarketMetadata.mockClear();
      await client.createOrder('0xtoken1', 'BUY', '0.55', '10');
      await client.createOrder('0xtoken2', 'BUY', '0.55', '10');
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(2);
    });

    it('should not affect other tokens when clearing specific cache', async () => {
      await client.createOrder('0xtoken1', 'BUY', '0.55', '10');
      await client.createOrder('0xtoken2', 'BUY', '0.55', '10');
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(2);
      
      // Clear cache for token1 only
      client.clearMarketConstraintsCache('0xtoken1');
      mockGetMarketMetadata.mockClear();
      
      // Token1 should fetch, token2 should use cache
      await client.createOrder('0xtoken1', 'BUY', '0.55', '10');
      await client.createOrder('0xtoken2', 'BUY', '0.55', '10');
      expect(mockGetMarketMetadata).toHaveBeenCalledTimes(1);
      expect(mockGetMarketMetadata).toHaveBeenCalledWith('0xtoken1');
    });
  });

  describe('Resource Cleanup', () => {
    it('should have destroy method', () => {
      expect(client.destroy).toBeDefined();
      expect(typeof client.destroy).toBe('function');
    });

    it('should call clearMarketConstraintsCache', () => {
      expect(client.clearMarketConstraintsCache).toBeDefined();
      expect(typeof client.clearMarketConstraintsCache).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should provide clear error message for invalid tick size', async () => {
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: '0.05',
        minOrderSize: '1',
      });
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.55', '10')
      ).rejects.toThrow(/Invalid tick size from market metadata for 0xtoken123: 0.05/);
    });

    it('should provide clear error message when API call fails', async () => {
      mockGetMarketMetadata.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.55', '10')
      ).rejects.toThrow(/Cannot validate order: failed to fetch market constraints for 0xtoken123/);
    });

    it('should handle null/undefined tick size from API', async () => {
      mockGetMarketMetadata.mockResolvedValueOnce({
        tickSize: null,
        minOrderSize: '1',
      });
      
      await expect(
        client.createOrder('0xtoken123', 'BUY', '0.55', '10')
      ).rejects.toThrow('Invalid tick size from market metadata');
    });
  });
});
