import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClobClient } from '../src/clients/clob';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

describe('CLOB Client - Audit Finding A-025', () => {
  let client: ClobClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock axios.create to return a mock instance
    mockedAxios.create = vi.fn(() => ({
      get: vi.fn(),
    }));

    client = new ClobClient();
  });

  describe('Constructor', () => {
    it('should create axios instance with correct base URL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('clob.polymarket.com'),
          timeout: 10000,
        })
      );
    });

    it('should initialize circuit breaker with correct config', () => {
      // Circuit breaker is initialized in constructor
      expect(client).toBeDefined();
      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.state).toBe('closed');
    });
  });

  describe('getOrderbook', () => {
    it('should fetch orderbook successfully', async () => {
      const mockOrderbook = {
        market: 'test-market',
        asset_id: 'test-token',
        bids: [
          { price: '0.55', size: '100' },
          { price: '0.54', size: '200' },
        ],
        asks: [
          { price: '0.56', size: '150' },
          { price: '0.57', size: '250' },
        ],
        timestamp: Date.now(),
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockOrderbook,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getOrderbook('test-token');

      expect(mockGet).toHaveBeenCalledWith('/book', {
        params: { token_id: 'test-token' },
      });
      expect(result).toEqual(mockOrderbook);
    });

    it('should pass correct token_id parameter', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: { bids: [], asks: [] },
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await client.getOrderbook('my-token-123');

      expect(mockGet).toHaveBeenCalledWith('/book', {
        params: { token_id: 'my-token-123' },
      });
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          // Fail first 2 attempts with network error
          const error: any = new Error('Network error');
          error.code = 'ECONNRESET';
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: { bids: [], asks: [] },
        });
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getOrderbook('test-token');

      expect(mockGet).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ bids: [], asks: [] });
    });

    it('should not retry on permanent errors (4xx)', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        response: { status: 400 },
        isAxiosError: true,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getOrderbook('test-token')).rejects.toThrow();

      // Should only try once for 4xx errors
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit errors (429)', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          const error: any = new Error('Rate limited');
          error.response = { status: 429 };
          error.isAxiosError = true;
          error.code = 'ERR_BAD_REQUEST';
          error.message = 'Request failed with status code 429';
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: { bids: [], asks: [] },
        });
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getOrderbook('test-token');

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ bids: [], asks: [] });
    });

    it('should use circuit breaker to prevent cascade failures', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Service down'));

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      // Make 3 failing requests - circuit breaker should open after threshold
      for (let i = 0; i < 3; i++) {
        try {
          await client.getOrderbook('test-token');
        } catch (error) {
          // Expected to fail
        }
      }

      const metrics = client.getCircuitBreakerMetrics();
      // Circuit breaker should track failures
      expect(metrics.failures).toBeGreaterThan(0);
    }, 10000); // Increase timeout for this test
  });

  describe('getCircuitBreakerMetrics', () => {
    it('should return circuit breaker metrics', () => {
      const metrics = client.getCircuitBreakerMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.state).toBeDefined();
      expect(metrics.failures).toBeDefined();
      expect(metrics.successes).toBeDefined();
    });

    it('should track successful requests', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: { bids: [], asks: [] },
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await client.getOrderbook('test-token');

      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics.successes).toBeGreaterThan(0);
    });

    it('should track failed requests', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Network error'));

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      try {
        await client.getOrderbook('test-token');
      } catch (error) {
        // Expected to fail
      }

      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics.failures).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getOrderbook('test-token')).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getOrderbook('test-token')).rejects.toThrow();
    });

    it('should handle malformed responses', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: null,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getOrderbook('test-token');
      expect(result).toBeNull();
    });
  });

  describe('Integration with Retry Logic', () => {
    it('should respect retry configuration', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        callCount++;
        const error: any = new Error('Temporary error');
        error.code = 'ETIMEDOUT';
        return Promise.reject(error);
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getOrderbook('test-token')).rejects.toThrow();

      // Should have retried multiple times based on config
      expect(mockGet.mock.calls.length).toBeGreaterThan(1);
    });

    it('should apply exponential backoff with jitter', async () => {
      const timestamps: number[] = [];
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        timestamps.push(Date.now());
        callCount++;
        // Only fail first 2 attempts to avoid long test
        if (callCount < 3) {
          const error: any = new Error('Temporary error');
          error.code = 'ETIMEDOUT';
          return Promise.reject(error);
        }
        // Succeed on 3rd attempt
        return Promise.resolve({
          data: { bids: [], asks: [] },
        });
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await client.getOrderbook('test-token');

      // Check that delays increase between retries
      if (timestamps.length >= 3) {
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];
        // Second delay should be greater than or equal to first (exponential backoff)
        // Allow margin for jitter which can reduce the delay
        expect(delay2).toBeGreaterThanOrEqual(delay1 * 0.5);
      }
    }, 30000); // Increase timeout for this test
  });

  describe('getPrice - PR-005', () => {
    it('should fetch current price for BUY side successfully', async () => {
      const mockPrice = { price: '0.55' };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockPrice,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPrice('test-token', 'BUY');

      expect(mockGet).toHaveBeenCalledWith('/price', {
        params: { token_id: 'test-token', side: 'BUY' },
      });
      expect(result).toBe('0.55');
    });

    it('should fetch current price for SELL side successfully', async () => {
      const mockPrice = { price: '0.45' };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockPrice,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPrice('test-token', 'SELL');

      expect(mockGet).toHaveBeenCalledWith('/price', {
        params: { token_id: 'test-token', side: 'SELL' },
      });
      expect(result).toBe('0.45');
    });

    it('should handle price precision correctly', async () => {
      const mockPrice = { price: '0.123456789' };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockPrice,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPrice('test-token', 'BUY');

      // Price should remain as string for precision
      expect(typeof result).toBe('string');
      expect(result).toBe('0.123456789');
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          const error: any = new Error('Network error');
          error.code = 'ECONNRESET';
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: { price: '0.50' },
        });
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPrice('test-token', 'BUY');

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(result).toBe('0.50');
    });
  });

  describe('getLastTrade - PR-005', () => {
    it('should fetch last trade successfully', async () => {
      const mockLastTrade = {
        token_id: 'test-token',
        price: '0.55',
        size: '100',
        timestamp: '2026-02-06T12:00:00Z',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockLastTrade,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getLastTrade('test-token');

      expect(mockGet).toHaveBeenCalledWith('/lasttrade', {
        params: { token_id: 'test-token' },
      });
      expect(result).toEqual(mockLastTrade);
    });

    it('should include all trade fields', async () => {
      const mockLastTrade = {
        token_id: 'my-token',
        price: '0.75',
        size: '250',
        timestamp: '2026-02-06T12:30:00Z',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockLastTrade,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getLastTrade('my-token');

      expect(result.token_id).toBe('my-token');
      expect(result.price).toBe('0.75');
      expect(result.size).toBe('250');
      expect(result.timestamp).toBe('2026-02-06T12:30:00Z');
    });

    it('should handle missing last trade gracefully', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        response: { status: 404 },
        isAxiosError: true,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getLastTrade('no-trades-token')).rejects.toThrow();
    });
  });

  describe('getSpread - PR-005', () => {
    it('should fetch spread successfully', async () => {
      const mockSpread = {
        token_id: 'test-token',
        bid: '0.48',
        ask: '0.52',
        spread: '0.04',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockSpread,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getSpread('test-token');

      expect(mockGet).toHaveBeenCalledWith('/spread', {
        params: { token_id: 'test-token' },
      });
      expect(result).toEqual(mockSpread);
    });

    it('should include bid, ask, and spread', async () => {
      const mockSpread = {
        token_id: 'my-token',
        bid: '0.30',
        ask: '0.35',
        spread: '0.05',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockSpread,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getSpread('my-token');

      expect(result.bid).toBe('0.30');
      expect(result.ask).toBe('0.35');
      expect(result.spread).toBe('0.05');
    });

    it('should handle tight spreads', async () => {
      const mockSpread = {
        token_id: 'liquid-token',
        bid: '0.4999',
        ask: '0.5001',
        spread: '0.0002',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockSpread,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getSpread('liquid-token');

      expect(result.spread).toBe('0.0002');
    });

    it('should handle wide spreads', async () => {
      const mockSpread = {
        token_id: 'illiquid-token',
        bid: '0.10',
        ask: '0.90',
        spread: '0.80',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockSpread,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getSpread('illiquid-token');

      expect(result.spread).toBe('0.80');
    });
  });

  describe('getMidpoint - PR-005', () => {
    it('should fetch midpoint successfully', async () => {
      const mockMidpoint = {
        token_id: 'test-token',
        midpoint: '0.50',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockMidpoint,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getMidpoint('test-token');

      expect(mockGet).toHaveBeenCalledWith('/midpoint', {
        params: { token_id: 'test-token' },
      });
      expect(result).toEqual(mockMidpoint);
    });

    it('should include token_id and midpoint', async () => {
      const mockMidpoint = {
        token_id: 'my-token',
        midpoint: '0.625',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockMidpoint,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getMidpoint('my-token');

      expect(result.token_id).toBe('my-token');
      expect(result.midpoint).toBe('0.625');
    });

    it('should handle precise midpoint calculations', async () => {
      const mockMidpoint = {
        token_id: 'precise-token',
        midpoint: '0.5123456',
      };

      const mockGet = vi.fn().mockResolvedValue({
        data: mockMidpoint,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getMidpoint('precise-token');

      expect(result.midpoint).toBe('0.5123456');
    });

    it('should handle empty orderbook gracefully', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        response: { 
          status: 400,
          data: { error: 'Midpoint undefined - orderbook empty' }
        },
        isAxiosError: true,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getMidpoint('empty-book-token')).rejects.toThrow();
    });
  });

  describe('Price Endpoints - Edge Cases', () => {
    it('should handle rate limiting for price queries', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          const error: any = new Error('Rate limited');
          error.response = { status: 429 };
          error.isAxiosError = true;
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: { price: '0.50' },
        });
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPrice('test-token', 'BUY');

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(result).toBe('0.50');
    });

    it('should use circuit breaker for all price endpoints', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Service down'));

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      // Try all endpoints and verify circuit breaker tracks failures
      try { await client.getPrice('test', 'BUY'); } catch {}
      try { await client.getLastTrade('test'); } catch {}
      try { await client.getSpread('test'); } catch {}
      try { await client.getMidpoint('test'); } catch {}

      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics.failures).toBeGreaterThan(0);
    }, 30000); // Increased timeout for multiple retries across 4 endpoints

    it('should handle API errors consistently across endpoints', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        response: { status: 500 },
        isAxiosError: true,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getPrice('test', 'BUY')).rejects.toThrow();
      await expect(client.getLastTrade('test')).rejects.toThrow();
      await expect(client.getSpread('test')).rejects.toThrow();
      await expect(client.getMidpoint('test')).rejects.toThrow();
    });
  });

  describe('getPriceHistory - PR-006', () => {
    it('should fetch price history successfully', async () => {
      const mockHistory = [
        { t: 1707235200, p: '0.50', v: '1000' },
        { t: 1707238800, p: '0.52', v: '1200' },
        { t: 1707242400, p: '0.51', v: '900' },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockHistory,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPriceHistory('test-token', {
        interval: '1h',
        startTs: 1707235200,
        endTs: 1707242400,
      });

      expect(mockGet).toHaveBeenCalledWith('/prices/history', {
        params: { 
          token_id: 'test-token',
          interval: '1h',
          startTs: 1707235200,
          endTs: 1707242400,
        },
      });
      
      // Check transformation
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        timestamp: 1707235200,
        price: '0.50',
        volume: '1000',
      });
      expect(result[2]).toEqual({
        timestamp: 1707242400,
        price: '0.51',
        volume: '900',
      });
    });

    it('should support different time intervals', async () => {
      const mockHistory = [
        { t: 1707235200, p: '0.55' },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockHistory,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      // Test 6h interval
      await client.getPriceHistory('test-token', { interval: '6h' });
      expect(mockGet).toHaveBeenCalledWith('/prices/history', {
        params: { 
          token_id: 'test-token',
          interval: '6h',
        },
      });

      // Test 1d interval
      await client.getPriceHistory('test-token', { interval: '1d' });
      expect(mockGet).toHaveBeenCalledWith('/prices/history', {
        params: { 
          token_id: 'test-token',
          interval: '1d',
        },
      });

      // Test 1w interval
      await client.getPriceHistory('test-token', { interval: '1w' });
      expect(mockGet).toHaveBeenCalledWith('/prices/history', {
        params: { 
          token_id: 'test-token',
          interval: '1w',
        },
      });

      // Test max interval
      await client.getPriceHistory('test-token', { interval: 'max' });
      expect(mockGet).toHaveBeenCalledWith('/prices/history', {
        params: { 
          token_id: 'test-token',
          interval: 'max',
        },
      });
    });

    it('should handle optional fidelity parameter', async () => {
      const mockHistory = [
        { t: 1707235200, p: '0.50' },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockHistory,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await client.getPriceHistory('test-token', {
        interval: '1h',
        fidelity: 100,
      });

      expect(mockGet).toHaveBeenCalledWith('/prices/history', {
        params: { 
          token_id: 'test-token',
          interval: '1h',
          fidelity: 100,
        },
      });
    });

    it('should handle missing volume data', async () => {
      const mockHistory = [
        { t: 1707235200, p: '0.50' }, // No volume
        { t: 1707238800, p: '0.52', v: '1200' }, // With volume
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockHistory,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPriceHistory('test-token');

      expect(result[0].volume).toBeUndefined();
      expect(result[1].volume).toBe('1200');
    });

    it('should handle empty history', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: [],
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPriceHistory('test-token');

      expect(result).toEqual([]);
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Service unavailable');
          error.response = { status: 503 };
          error.isAxiosError = true;
          throw error;
        }
        return { data: [{ t: 1707235200, p: '0.50' }] };
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      const result = await client.getPriceHistory('test-token');

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });

    it('should handle API errors gracefully', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        response: { status: 404 },
        isAxiosError: true,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new ClobClient();

      await expect(client.getPriceHistory('nonexistent-token')).rejects.toThrow();
    });
  });
});
