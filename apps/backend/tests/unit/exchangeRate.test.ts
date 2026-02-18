import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExchangeRateClient } from '../../src/clients/exchangeRate';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    exchangeRateApiUrl: 'https://api.coingecko.com/api/v3',
    exchangeRateCacheTtlMs: 300000,
    retryAttempts: 3,
    retryDelay: 1000,
    retryTotalTimeout: 300000,
    circuitBreakerFailureThreshold: 5,
    circuitBreakerResetTimeoutMs: 60000,
    circuitBreakerSuccessThreshold: 2,
  },
}));

describe('ExchangeRateClient - GAP-007', () => {
  let client: ExchangeRateClient;
  let mockGet: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGet = vi.fn();
    mockedAxios.create = vi.fn(() => ({
      get: mockGet,
    }));

    client = new ExchangeRateClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (client) {
      client.destroy();
    }
  });

  describe('Constructor', () => {
    it('should create axios instance with correct base URL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.coingecko.com/api/v3',
          timeout: 10000,
        })
      );
    });

    it('should initialize circuit breaker with correct config', () => {
      expect(client).toBeDefined();
      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.state).toBe('closed');
    });

    it('should accept custom cache TTL', () => {
      const customClient = new ExchangeRateClient(60000);
      expect(customClient).toBeDefined();
      customClient.destroy();
    });
  });

  describe('getExchangeRate', () => {
    it('should fetch exchange rate successfully', async () => {
      const mockResponse = {
        data: {
          'usd-coin': {
            usd: 0.9998,
          },
        },
      };

      mockGet.mockResolvedValue(mockResponse);

      const result = await client.getExchangeRate('USDC', 'USD');

      expect(mockGet).toHaveBeenCalledWith('/simple/price', {
        params: {
          ids: 'usd-coin',
          vs_currencies: 'usd',
        },
      });
      expect(result).toEqual({
        from: 'USDC',
        to: 'USD',
        rate: 0.9998,
        timestamp: expect.any(Number),
      });
    });

    it('should handle same-currency case', async () => {
      const result = await client.getExchangeRate('USDC', 'USDC');

      expect(mockGet).not.toHaveBeenCalled();
      expect(result).toEqual({
        from: 'USDC',
        to: 'USDC',
        rate: 1.0,
        timestamp: expect.any(Number),
      });
    });

    it('should normalize currency symbols to uppercase', async () => {
      const mockResponse = {
        data: {
          'usd-coin': {
            usd: 0.9998,
          },
        },
      };

      mockGet.mockResolvedValue(mockResponse);

      const result = await client.getExchangeRate('usdc', 'usd');

      expect(result.from).toBe('USDC');
      expect(result.to).toBe('USD');
    });

    it('should support multiple cryptocurrencies', async () => {
      const currencies = [
        { from: 'BTC', coinId: 'bitcoin', rate: 45000 },
        { from: 'ETH', coinId: 'ethereum', rate: 2500 },
        { from: 'USDT', coinId: 'tether', rate: 1.0001 },
        { from: 'DAI', coinId: 'dai', rate: 0.9999 },
        { from: 'MATIC', coinId: 'matic-network', rate: 0.85 },
        { from: 'POL', coinId: 'matic-network', rate: 0.85 },
      ];

      for (const { from, coinId, rate } of currencies) {
        mockGet.mockResolvedValue({
          data: {
            [coinId]: {
              usd: rate,
            },
          },
        });

        const result = await client.getExchangeRate(from, 'USD');
        expect(result.from).toBe(from);
        expect(result.rate).toBe(rate);
      }
    });

    it('should throw error for unsupported currency', async () => {
      await expect(
        client.getExchangeRate('INVALID', 'USD')
      ).rejects.toThrow('Unsupported source currency: INVALID');
    });

    it('should throw error when rate not found in response', async () => {
      mockGet.mockResolvedValue({
        data: {
          'usd-coin': {
            // Missing 'usd' key
          },
        },
      });

      await expect(
        client.getExchangeRate('USDC', 'USD')
      ).rejects.toThrow('Exchange rate not found for USDC/USD');
    });
  });

  describe('Caching', () => {
    it('should cache exchange rates', async () => {
      const mockResponse = {
        data: {
          'usd-coin': {
            usd: 0.9998,
          },
        },
      };

      mockGet.mockResolvedValue(mockResponse);

      // First call - should fetch from API
      const result1 = await client.getExchangeRate('USDC', 'USD');
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await client.getExchangeRate('USDC', 'USD');
      expect(mockGet).toHaveBeenCalledTimes(1); // No additional call
      expect(result2.rate).toBe(result1.rate);
    });

    it('should expire cache after TTL', async () => {
      const shortTtlClient = new ExchangeRateClient(100); // 100ms TTL

      const mockResponse = {
        data: {
          'usd-coin': {
            usd: 0.9998,
          },
        },
      };

      mockGet.mockResolvedValue(mockResponse);

      // First call - should fetch from API
      await shortTtlClient.getExchangeRate('USDC', 'USD');
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call - should fetch again because cache expired
      await shortTtlClient.getExchangeRate('USDC', 'USD');
      expect(mockGet).toHaveBeenCalledTimes(2);

      shortTtlClient.destroy();
    });

    it('should cache different currency pairs separately', async () => {
      const mockResponses = [
        {
          data: {
            'usd-coin': {
              usd: 0.9998,
            },
          },
        },
        {
          data: {
            ethereum: {
              usd: 2500,
            },
          },
        },
      ];

      mockGet
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      await client.getExchangeRate('USDC', 'USD');
      await client.getExchangeRate('ETH', 'USD');

      expect(mockGet).toHaveBeenCalledTimes(2);

      // Both should now be cached
      await client.getExchangeRate('USDC', 'USD');
      await client.getExchangeRate('ETH', 'USD');

      expect(mockGet).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('should clear cache', async () => {
      const mockResponse = {
        data: {
          'usd-coin': {
            usd: 0.9998,
          },
        },
      };

      mockGet.mockResolvedValue(mockResponse);

      await client.getExchangeRate('USDC', 'USD');
      expect(mockGet).toHaveBeenCalledTimes(1);

      client.clearCache();

      await client.getExchangeRate('USDC', 'USD');
      expect(mockGet).toHaveBeenCalledTimes(2); // Cache was cleared
    });

    it('should return cache stats', async () => {
      const mockResponse = {
        data: {
          'usd-coin': {
            usd: 0.9998,
          },
        },
      };

      mockGet.mockResolvedValue(mockResponse);

      const stats1 = client.getCacheStats();
      expect(stats1.size).toBe(0);
      expect(stats1.entries).toHaveLength(0);

      await client.getExchangeRate('USDC', 'USD');

      const stats2 = client.getCacheStats();
      expect(stats2.size).toBe(1);
      expect(stats2.entries).toHaveLength(1);
      expect(stats2.entries[0]).toEqual({
        from: 'USDC',
        to: 'USD',
        age: expect.any(Number),
      });
    });
  });

  describe('getBatchExchangeRates', () => {
    it('should fetch multiple exchange rates', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: {
            'usd-coin': {
              usd: 0.9998,
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            ethereum: {
              usd: 2500,
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            bitcoin: {
              usd: 45000,
            },
          },
        });

      const results = await client.getBatchExchangeRates([
        ['USDC', 'USD'],
        ['ETH', 'USD'],
        ['BTC', 'USD'],
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].from).toBe('USDC');
      expect(results[1].from).toBe('ETH');
      expect(results[2].from).toBe('BTC');
      expect(mockGet).toHaveBeenCalledTimes(3);
    });

    it('should leverage cache for batch requests', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: {
            'usd-coin': {
              usd: 0.9998,
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            ethereum: {
              usd: 2500,
            },
          },
        });

      // First batch - should fetch from API
      await client.getBatchExchangeRates([
        ['USDC', 'USD'],
        ['ETH', 'USD'],
      ]);
      expect(mockGet).toHaveBeenCalledTimes(2);

      // Second batch - should use cache
      await client.getBatchExchangeRates([
        ['USDC', 'USD'],
        ['ETH', 'USD'],
      ]);
      expect(mockGet).toHaveBeenCalledTimes(2); // No additional calls
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported currency', async () => {
      await expect(
        client.getExchangeRate('INVALID', 'USD')
      ).rejects.toThrow('Unsupported source currency: INVALID');
      
      // Should not make API call for unsupported currency
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('should throw error when rate not found in API response', async () => {
      mockGet.mockResolvedValue({
        data: {
          'usd-coin': {
            // Missing 'usd' key - API returned data but not for requested currency
          },
        },
      });

      await expect(
        client.getExchangeRate('USDC', 'USD')
      ).rejects.toThrow('Exchange rate not found for USDC/USD');
    });

    it('should throw error for zero rate value', async () => {
      mockGet.mockResolvedValue({
        data: {
          'usd-coin': {
            usd: 0,
          },
        },
      });

      await expect(
        client.getExchangeRate('USDC', 'USD')
      ).rejects.toThrow('Invalid exchange rate received for USDC/USD: 0');
    });

    it('should throw error for negative rate value', async () => {
      mockGet.mockResolvedValue({
        data: {
          'usd-coin': {
            usd: -0.5,
          },
        },
      });

      await expect(
        client.getExchangeRate('USDC', 'USD')
      ).rejects.toThrow('Invalid exchange rate received for USDC/USD: -0.5');
    });

    it('should throw error for NaN rate value', async () => {
      mockGet.mockResolvedValue({
        data: {
          'usd-coin': {
            usd: NaN,
          },
        },
      });

      await expect(
        client.getExchangeRate('USDC', 'USD')
      ).rejects.toThrow('Invalid exchange rate received for USDC/USD');
    });

    it('should throw error for Infinity rate value', async () => {
      mockGet.mockResolvedValue({
        data: {
          'usd-coin': {
            usd: Infinity,
          },
        },
      });

      await expect(
        client.getExchangeRate('USDC', 'USD')
      ).rejects.toThrow('Invalid exchange rate received for USDC/USD');
    });

    it('should throw error for non-numeric rate value', async () => {
      mockGet.mockResolvedValue({
        data: {
          'usd-coin': {
            usd: '0.9998' as any, // String instead of number
          },
        },
      });

      await expect(
        client.getExchangeRate('USDC', 'USD')
      ).rejects.toThrow('Invalid exchange rate received for USDC/USD');
    });
  });

  describe('Circuit Breaker', () => {
    it('should have circuit breaker metrics available', () => {
      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.state).toBe('closed');
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
    });

    it('should reset circuit breaker manually', () => {
      expect(client.getCircuitBreakerMetrics().state).toBe('closed');
      client.resetCircuitBreaker();
      expect(client.getCircuitBreakerMetrics().state).toBe('closed');
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on destroy', () => {
      const stats1 = client.getCacheStats();
      expect(stats1).toBeDefined();

      client.destroy();

      const stats2 = client.getCacheStats();
      expect(stats2.size).toBe(0);
    });
  });
});
