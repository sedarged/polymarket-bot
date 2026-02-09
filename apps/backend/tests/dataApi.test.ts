import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { DataApiClient, ActivityEvent } from '../src/clients/dataApi';
import { Position, Fill } from '@polymarket/shared';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('DataApiClient', () => {
  let client: DataApiClient;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

    // Create client
    client = new DataApiClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct base URL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://data-api.polymarket.com',
        timeout: 10000,
      });
    });

    it('should initialize circuit breaker with correct config', () => {
      const metrics = client.getCircuitBreakerMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.state).toBe('closed');
    });
  });

  describe('getPositions', () => {
    const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const mockPositions: Position[] = [
      {
        tokenId: '0xtoken1',
        size: '100',
        averagePrice: '0.55',
        marketValue: '55',
        unrealizedPnl: '5',
      },
      {
        tokenId: '0xtoken2',
        size: '50',
        averagePrice: '0.45',
        marketValue: '22.5',
        unrealizedPnl: '-2.5',
      },
    ];

    it('should fetch positions successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockPositions });

      const result = await client.getPositions(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/positions', {
        params: {
          address: mockAddress,
        },
      });
      expect(result).toEqual(mockPositions);
    });

    it('should support tokenId filter', async () => {
      const filteredPositions = [mockPositions[0]];
      mockAxiosInstance.get.mockResolvedValue({ data: filteredPositions });

      const result = await client.getPositions(mockAddress, { 
        tokenId: '0xtoken1' 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/positions', {
        params: {
          address: mockAddress,
          tokenId: '0xtoken1',
        },
      });
      expect(result).toEqual(filteredPositions);
    });

    it('should support pagination parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockPositions });

      await client.getPositions(mockAddress, { 
        limit: 50, 
        offset: 10 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/positions', {
        params: {
          address: mockAddress,
          limit: 50,
          offset: 10,
        },
      });
    });

    it('should handle empty positions array', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await client.getPositions(mockAddress);

      expect(result).toEqual([]);
    });

    it('should retry on transient errors', async () => {
      // First call fails with network error, second succeeds
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: mockPositions });

      const result = await client.getPositions(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockPositions);
    });

    it('should not retry on 404 errors', async () => {
      // Error message must contain '404' for classifyError to detect it as PERMANENT
      const error = new Error('Request failed with status code 404');
      (error as Error & { response: { status: number } }).response = { status: 404 };
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.getPositions(mockAddress)).rejects.toThrow();
      // Should not retry permanent errors - only called once
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it('should handle rate limit errors with retry', async () => {
      // Error message must contain 'rate limit' or '429' for classifyError
      const rateLimitError = new Error('Request failed with status code 429 - Rate limit exceeded');
      (rateLimitError as Error & { response: { status: number } }).response = { status: 429 };
      
      mockAxiosInstance.get
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ data: mockPositions });

      const result = await client.getPositions(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockPositions);
    });
  });

  describe('getTrades', () => {
    const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const mockTrades: Fill[] = [
      {
        orderId: 'order1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '100',
        timestamp: 1234567890000,
        fee: '0.11',
        fillId: 'fill1',
      },
      {
        orderId: 'order2',
        tokenId: '0xtoken2',
        side: 'SELL',
        price: '0.45',
        size: '50',
        timestamp: 1234567900000,
        fee: '0.045',
        fillId: 'fill2',
      },
    ];

    it('should fetch trades successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockTrades });

      const result = await client.getTrades(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trades', {
        params: {
          address: mockAddress,
        },
      });
      expect(result).toEqual(mockTrades);
    });

    it('should support tokenId filter', async () => {
      const filteredTrades = [mockTrades[0]];
      mockAxiosInstance.get.mockResolvedValue({ data: filteredTrades });

      const result = await client.getTrades(mockAddress, { 
        tokenId: '0xtoken1' 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trades', {
        params: {
          address: mockAddress,
          tokenId: '0xtoken1',
        },
      });
      expect(result).toEqual(filteredTrades);
    });

    it('should support time range filtering', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockTrades });

      const startTime = Date.now() - 86400000; // 24 hours ago
      const endTime = Date.now();

      await client.getTrades(mockAddress, { 
        startTime, 
        endTime 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trades', {
        params: {
          address: mockAddress,
          startTime,
          endTime,
        },
      });
    });

    it('should support pagination parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockTrades });

      await client.getTrades(mockAddress, { 
        limit: 100, 
        offset: 50 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trades', {
        params: {
          address: mockAddress,
          limit: 100,
          offset: 50,
        },
      });
    });

    it('should handle empty trades array', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await client.getTrades(mockAddress);

      expect(result).toEqual([]);
    });

    it('should support combined filters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockTrades });

      const params = {
        tokenId: '0xtoken1',
        startTime: 1234567800000,
        endTime: 1234567900000,
        limit: 50,
        offset: 10,
      };

      await client.getTrades(mockAddress, params);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trades', {
        params: {
          address: mockAddress,
          ...params,
        },
      });
    });

    it('should retry on timeout errors', async () => {
      // Error message must contain 'timeout' for classifyError
      const timeoutError = new Error('Request timed out');
      (timeoutError as Error & { code: string }).code = 'ECONNABORTED';
      
      mockAxiosInstance.get
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({ data: mockTrades });

      const result = await client.getTrades(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockTrades);
    });
  });

  describe('getActivity', () => {
    const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const mockActivity: ActivityEvent[] = [
      {
        id: 'event1',
        address: mockAddress,
        eventType: 'order_created',
        tokenId: '0xtoken1',
        orderId: 'order1',
        details: { price: '0.55', size: '100' },
        timestamp: 1234567890000,
      },
      {
        id: 'event2',
        address: mockAddress,
        eventType: 'trade',
        tokenId: '0xtoken1',
        orderId: 'order1',
        details: { price: '0.55', size: '100', fee: '0.11' },
        timestamp: 1234567895000,
      },
      {
        id: 'event3',
        address: mockAddress,
        eventType: 'order_cancelled',
        tokenId: '0xtoken2',
        orderId: 'order2',
        details: {},
        timestamp: 1234567900000,
      },
    ];

    it('should fetch activity successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockActivity });

      const result = await client.getActivity(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/activity', {
        params: {
          address: mockAddress,
        },
      });
      expect(result).toEqual(mockActivity);
    });

    it('should support eventType filter', async () => {
      const filteredActivity = [mockActivity[1]];
      mockAxiosInstance.get.mockResolvedValue({ data: filteredActivity });

      const result = await client.getActivity(mockAddress, { 
        eventType: 'trade' 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/activity', {
        params: {
          address: mockAddress,
          eventType: 'trade',
        },
      });
      expect(result).toEqual(filteredActivity);
    });

    it('should support time range filtering', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockActivity });

      const startTime = 1234567890000;
      const endTime = 1234567900000;

      await client.getActivity(mockAddress, { 
        startTime, 
        endTime 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/activity', {
        params: {
          address: mockAddress,
          startTime,
          endTime,
        },
      });
    });

    it('should support pagination parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockActivity });

      await client.getActivity(mockAddress, { 
        limit: 200, 
        offset: 100 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/activity', {
        params: {
          address: mockAddress,
          limit: 200,
          offset: 100,
        },
      });
    });

    it('should handle empty activity array', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await client.getActivity(mockAddress);

      expect(result).toEqual([]);
    });

    it('should support combined filters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockActivity });

      const params = {
        eventType: 'trade',
        startTime: 1234567890000,
        endTime: 1234567900000,
        limit: 100,
        offset: 0,
      };

      await client.getActivity(mockAddress, params);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/activity', {
        params: {
          address: mockAddress,
          ...params,
        },
      });
    });
  });

  describe('circuit breaker', () => {
    it('should provide circuit breaker metrics', () => {
      const metrics = client.getCircuitBreakerMetrics();
      
      expect(metrics).toHaveProperty('state');
      expect(metrics).toHaveProperty('failures');
      expect(metrics).toHaveProperty('successes');
      expect(['closed', 'open', 'half-open']).toContain(metrics.state);
    });

    // Note: Full circuit breaker state transition tests (open/half-open/closed) are not
    // included due to the time delays involved in retry logic (exponential backoff).
    // The circuit breaker functionality itself is tested in unit tests for the
    // CircuitBreaker class. Here we verify that the DataApiClient properly initializes
    // and exposes circuit breaker metrics for monitoring.
  });

  describe('error handling', () => {
    const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as Error & { code: string }).code = 'ECONNREFUSED';
      mockAxiosInstance.get.mockRejectedValue(networkError);

      await expect(client.getPositions(mockAddress)).rejects.toThrow();
    });

    it('should handle 500 errors with retry', async () => {
      const serverError = new Error('Internal server error - status 500');
      (serverError as Error & { response: { status: number } }).response = { status: 500 };
      
      mockAxiosInstance.get
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: [] });

      const result = await client.getPositions(mockAddress);
      expect(result).toEqual([]);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should not retry 400 errors', async () => {
      // Error message must contain '400' for classifyError to detect as PERMANENT
      const badRequestError = new Error('Bad request - status 400');
      (badRequestError as Error & { response: { status: number } }).response = { status: 400 };
      mockAxiosInstance.get.mockRejectedValue(badRequestError);

      await expect(client.getPositions(mockAddress)).rejects.toThrow();
      // Should not retry permanent errors - only called once
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid JSON responses', async () => {
      const parseError = new Error('Invalid JSON');
      mockAxiosInstance.get.mockRejectedValue(parseError);

      await expect(client.getPositions(mockAddress)).rejects.toThrow();
    });
  });

  describe('API alignment verification', () => {
    it('should use correct endpoint for positions', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });
      
      await client.getPositions('0xaddress');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/positions',
        expect.any(Object)
      );
    });

    it('should use correct endpoint for trades', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });
      
      await client.getTrades('0xaddress');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/trades',
        expect.any(Object)
      );
    });

    it('should use correct endpoint for activity', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });
      
      await client.getActivity('0xaddress');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/activity',
        expect.any(Object)
      );
    });

    it('should use correct base URL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://data-api.polymarket.com',
        })
      );
    });

    it('should set appropriate timeout', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });
  });

  describe('getHistory - PR-014', () => {
    const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const mockHistory = [
      {
        id: 'hist-1',
        eventType: 'market_created',
        timestamp: 1234567890000,
        data: { marketId: 'market-1' },
      },
      {
        id: 'hist-2',
        eventType: 'order_placed',
        timestamp: 1234567895000,
        data: { orderId: 'order-1' },
      },
    ];

    it('should fetch history successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockHistory });

      const result = await client.getHistory(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/history', {
        params: {
          address: mockAddress,
        },
      });
      expect(result).toEqual(mockHistory);
    });

    it('should support eventType filter', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [mockHistory[0]] });

      const result = await client.getHistory(mockAddress, { 
        eventType: 'market_created' 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/history', {
        params: {
          address: mockAddress,
          eventType: 'market_created',
        },
      });
      expect(result).toEqual([mockHistory[0]]);
    });

    it('should support time range filtering', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockHistory });

      const startTime = 1234567890000;
      const endTime = 1234567900000;

      await client.getHistory(mockAddress, { 
        startTime, 
        endTime 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/history', {
        params: {
          address: mockAddress,
          startTime,
          endTime,
        },
      });
    });

    it('should support pagination parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockHistory });

      await client.getHistory(mockAddress, { 
        limit: 100, 
        offset: 50 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/history', {
        params: {
          address: mockAddress,
          limit: 100,
          offset: 50,
        },
      });
    });

    it('should handle empty history array', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await client.getHistory(mockAddress);

      expect(result).toEqual([]);
    });

    it('should retry on transient errors', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: mockHistory });

      const result = await client.getHistory(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockHistory);
    });
  });

  describe('getReplay - PR-014', () => {
    const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const mockReplay = [
      {
        id: 'replay-1',
        eventType: 'price_change',
        timestamp: 1234567890000,
        data: { price: '0.55', tokenId: '0xtoken1' },
      },
      {
        id: 'replay-2',
        eventType: 'trade_executed',
        timestamp: 1234567895000,
        data: { size: '100', price: '0.55' },
      },
    ];

    it('should fetch replay data successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockReplay });

      const result = await client.getReplay(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/replay', {
        params: {
          address: mockAddress,
        },
      });
      expect(result).toEqual(mockReplay);
    });

    it('should support eventType filter', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [mockReplay[0]] });

      const result = await client.getReplay(mockAddress, { 
        eventType: 'price_change' 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/replay', {
        params: {
          address: mockAddress,
          eventType: 'price_change',
        },
      });
      expect(result).toEqual([mockReplay[0]]);
    });

    it('should support time range for backtesting', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockReplay });

      const startTime = 1234567890000;
      const endTime = 1234567900000;

      await client.getReplay(mockAddress, { 
        startTime, 
        endTime 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/replay', {
        params: {
          address: mockAddress,
          startTime,
          endTime,
        },
      });
    });

    it('should support pagination parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockReplay });

      await client.getReplay(mockAddress, { 
        limit: 1000, 
        offset: 0 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/replay', {
        params: {
          address: mockAddress,
          limit: 1000,
          offset: 0,
        },
      });
    });

    it('should handle empty replay array', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await client.getReplay(mockAddress);

      expect(result).toEqual([]);
    });

    it('should support combined filters for backtesting', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockReplay });

      const params = {
        eventType: 'trade_executed',
        startTime: 1234567890000,
        endTime: 1234567900000,
        limit: 500,
        offset: 0,
      };

      await client.getReplay(mockAddress, params);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/replay', {
        params: {
          address: mockAddress,
          ...params,
        },
      });
    });

    it('should retry on transient errors', async () => {
      const timeoutError = new Error('Request timed out');
      (timeoutError as Error & { code: string }).code = 'ECONNABORTED';
      
      mockAxiosInstance.get
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({ data: mockReplay });

      const result = await client.getReplay(mockAddress);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockReplay);
    });
  });
});
