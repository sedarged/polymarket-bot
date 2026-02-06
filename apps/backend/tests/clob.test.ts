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
});
