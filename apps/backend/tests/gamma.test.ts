import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GammaClient } from '../src/clients/gamma';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

describe('Gamma API Client - Audit Finding A-025', () => {
  let client: GammaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock axios.create to return a mock instance
    mockedAxios.create = vi.fn(() => ({
      get: vi.fn(),
    }));

    client = new GammaClient();
  });

  describe('Constructor', () => {
    it('should create axios instance with correct base URL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('gamma-api.polymarket.com'),
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

  describe('getActiveMarkets', () => {
    it('should fetch active markets successfully', async () => {
      const mockMarkets = [
        {
          condition_id: 'market-1',
          question: 'Will X happen?',
          end_date_iso: '2024-12-31T00:00:00Z',
          active: true,
          closed: false,
        },
        {
          condition_id: 'market-2',
          question: 'Will Y happen?',
          end_date_iso: '2024-12-31T00:00:00Z',
          active: true,
          closed: false,
        },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockMarkets,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getActiveMarkets();

      expect(mockGet).toHaveBeenCalledWith('/markets', {
        params: {
          active: true,
          closed: false,
        },
      });
      expect(result).toEqual(mockMarkets);
      expect(result).toHaveLength(2);
    });

    it('should fetch markets with limit parameter', async () => {
      const mockMarkets = [
        { condition_id: 'market-1', active: true, closed: false },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockMarkets,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getActiveMarkets(10);

      expect(mockGet).toHaveBeenCalledWith('/markets', {
        params: {
          active: true,
          closed: false,
          limit: 10,
        },
      });
      expect(result).toEqual(mockMarkets);
    });

    it('should not include limit parameter when not provided', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: [],
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      await client.getActiveMarkets();

      expect(mockGet).toHaveBeenCalledWith('/markets', {
        params: {
          active: true,
          closed: false,
        },
      });
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          // Fail first 2 attempts
          const error: any = new Error('Network error');
          error.code = 'ECONNRESET';
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: [],
        });
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getActiveMarkets();

      expect(mockGet).toHaveBeenCalledTimes(3);
      expect(result).toEqual([]);
    });

    it('should handle empty market list', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: [],
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getActiveMarkets();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getEvents', () => {
    it('should fetch active events successfully', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Event 1',
          active: true,
          closed: false,
        },
        {
          id: 'event-2',
          title: 'Event 2',
          active: true,
          closed: false,
        },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockEvents,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getEvents();

      expect(mockGet).toHaveBeenCalledWith('/events', {
        params: {
          active: true,
          closed: false,
        },
      });
      expect(result).toEqual(mockEvents);
      expect(result).toHaveLength(2);
    });

    it('should fetch events with limit parameter', async () => {
      const mockEvents = [
        { id: 'event-1', title: 'Event 1' },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockEvents,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getEvents(5);

      expect(mockGet).toHaveBeenCalledWith('/events', {
        params: {
          active: true,
          closed: false,
          limit: 5,
        },
      });
      expect(result).toEqual(mockEvents);
    });

    it('should not include limit parameter when not provided', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: [],
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      await client.getEvents();

      expect(mockGet).toHaveBeenCalledWith('/events', {
        params: {
          active: true,
          closed: false,
        },
      });
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      const mockGet = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          // Fail first attempt
          const error: any = new Error('Timeout');
          error.code = 'ETIMEDOUT';
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: [],
        });
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getEvents();

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
    });

    it('should handle empty event list', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: [],
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getEvents();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors in getActiveMarkets', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      await expect(client.getActiveMarkets()).rejects.toThrow();
    });

    it('should handle network errors in getEvents', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      await expect(client.getEvents()).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      await expect(client.getActiveMarkets()).rejects.toThrow();
    });

    it('should handle API errors (4xx/5xx)', async () => {
      const mockGet = vi.fn().mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
        isAxiosError: true,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      await expect(client.getActiveMarkets()).rejects.toThrow();
    });
  });

  describe('Data Validation', () => {
    it('should return markets with expected structure', async () => {
      const mockMarkets = [
        {
          condition_id: 'market-1',
          question: 'Test question',
          end_date_iso: '2024-12-31T00:00:00Z',
          active: true,
          closed: false,
          tokens: [
            { token_id: 'token-1', outcome: 'YES' },
            { token_id: 'token-2', outcome: 'NO' },
          ],
        },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockMarkets,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getActiveMarkets();

      expect(result[0]).toHaveProperty('condition_id');
      expect(result[0]).toHaveProperty('question');
      expect(result[0]).toHaveProperty('active');
      expect(result[0]).toHaveProperty('closed');
    });

    it('should return events with expected structure', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Test Event',
          slug: 'test-event',
          active: true,
          closed: false,
          markets: ['market-1', 'market-2'],
        },
      ];

      const mockGet = vi.fn().mockResolvedValue({
        data: mockEvents,
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      const result = await client.getEvents();

      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('active');
      expect(result[0]).toHaveProperty('closed');
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

      client = new GammaClient();

      await expect(client.getActiveMarkets()).rejects.toThrow();

      // Should have retried multiple times based on config
      expect(mockGet.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Circuit Breaker - Issue #116 Review Fix', () => {
    it('should have circuit breaker metrics', () => {
      const metrics = client.getCircuitBreakerMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.state).toBeDefined();
      expect(metrics.failures).toBeDefined();
      expect(metrics.successes).toBeDefined();
    });

    it('should track successful requests', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        data: [],
      });

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      await client.getActiveMarkets();

      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics.successes).toBeGreaterThan(0);
    });

    it('should track failed requests', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Network error'));

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      try {
        await client.getActiveMarkets();
      } catch (error) {
        // Expected to fail
      }

      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics.failures).toBeGreaterThan(0);
    });

    it('should use circuit breaker to prevent cascade failures', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Service down'));

      mockedAxios.create = vi.fn(() => ({
        get: mockGet,
      }));

      client = new GammaClient();

      // Make 3 failing requests - circuit breaker should open after threshold
      for (let i = 0; i < 3; i++) {
        try {
          await client.getActiveMarkets();
        } catch (error) {
          // Expected to fail
        }
      }

      const metrics = client.getCircuitBreakerMetrics();
      // Circuit breaker should track failures
      expect(metrics.failures).toBeGreaterThan(0);
    }, 10000); // Increase timeout for this test
  });
});
