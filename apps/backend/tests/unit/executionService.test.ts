/**
 * Unit tests for ExecutionService (GAP-006)
 * 
 * Tests cover:
 * - Market order execution
 * - Limit order execution
 * - Conditional order execution
 * - Error handling and retry logic
 * - Order cancellation
 * - Execution timeouts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExecutionService,
  OrderTypeEnum,
  ExecutionStrategy,
  ExecutionStatus,
  OrderExecutionRequest,
  MarketOrderParams,
  LimitOrderParams,
  ConditionalOrderParams,
  OrderRejectedError,
  ExecutionTimeoutError,
} from '../../src/trading/executionService';
import { TradingClient } from '../../src/clients/tradingClient';
import { Order } from '@polymarket/shared';

// Mock TradingClient
vi.mock('../../src/clients/tradingClient');

describe('ExecutionService', () => {
  let executionService: ExecutionService;
  let mockTradingClient: any;

  beforeEach(() => {
    // Create mock trading client
    mockTradingClient = {
      createOrder: vi.fn(),
      cancelOrder: vi.fn(),
      cancelMarketOrders: vi.fn(),
    };

    executionService = new ExecutionService(mockTradingClient);
  });

  describe('Market Orders', () => {
    it('should execute a market BUY order successfully', async () => {
      const mockOrder: Order = {
        orderId: 'order-123',
        tokenId: 'token-456',
        side: 'BUY',
        price: '0.99',
        size: '100',
        status: 'OPEN',
        createdAt: Date.now(),
      };

      mockTradingClient.createOrder.mockResolvedValue(mockOrder);

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'token-456',
          side: 'BUY',
          size: '100',
          slippageTolerance: 0.01,
        } as MarketOrderParams,
        context: {
          executionId: 'exec-1',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.order).toEqual(mockOrder);
      expect(result.executionId).toBe('exec-1');
      expect(result.retryAttempts).toBe(0);
      expect(mockTradingClient.createOrder).toHaveBeenCalledWith(
        'token-456',
        'BUY',
        '0.99',
        '100'
      );
    });

    it('should execute a market SELL order successfully', async () => {
      const mockOrder: Order = {
        orderId: 'order-789',
        tokenId: 'token-456',
        side: 'SELL',
        price: '0.01',
        size: '50',
        status: 'OPEN',
        createdAt: Date.now(),
      };

      mockTradingClient.createOrder.mockResolvedValue(mockOrder);

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'token-456',
          side: 'SELL',
          size: '50',
        } as MarketOrderParams,
        context: {
          executionId: 'exec-2',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.order).toEqual(mockOrder);
      expect(mockTradingClient.createOrder).toHaveBeenCalledWith(
        'token-456',
        'SELL',
        '0.01',
        '50'
      );
    });

    it('should handle market order failure', async () => {
      mockTradingClient.createOrder.mockRejectedValue(new Error('Insufficient balance'));

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'token-456',
          side: 'BUY',
          size: '1000',
        } as MarketOrderParams,
        context: {
          executionId: 'exec-3',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Insufficient balance');
      expect(result.order).toBeUndefined();
    });
  });

  describe('Limit Orders', () => {
    it('should execute a limit order successfully', async () => {
      const mockOrder: Order = {
        orderId: 'order-limit-1',
        tokenId: 'token-789',
        side: 'BUY',
        price: '0.55',
        size: '200',
        status: 'OPEN',
        createdAt: Date.now(),
      };

      mockTradingClient.createOrder.mockResolvedValue(mockOrder);

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: 'token-789',
          side: 'BUY',
          price: '0.55',
          size: '200',
          timeInForce: 'GTC',
        } as LimitOrderParams,
        context: {
          executionId: 'exec-4',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.order).toEqual(mockOrder);
      expect(mockTradingClient.createOrder).toHaveBeenCalledWith(
        'token-789',
        'BUY',
        '0.55',
        '200'
      );
    });

    it('should handle limit order with different time in force', async () => {
      const mockOrder: Order = {
        orderId: 'order-limit-2',
        tokenId: 'token-789',
        side: 'SELL',
        price: '0.65',
        size: '150',
        status: 'OPEN',
        createdAt: Date.now(),
      };

      mockTradingClient.createOrder.mockResolvedValue(mockOrder);

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: 'token-789',
          side: 'SELL',
          price: '0.65',
          size: '150',
          timeInForce: 'IOC',
        } as LimitOrderParams,
        context: {
          executionId: 'exec-5',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.order).toEqual(mockOrder);
    });
  });

  describe('Conditional Orders', () => {
    it('should throw error for conditional orders (not yet implemented)', async () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.CONDITIONAL,
          tokenId: 'token-999',
          side: 'BUY',
          price: '0.60',
          size: '100',
          triggerPrice: '0.50',
          triggerCondition: 'BELOW',
        } as ConditionalOrderParams,
        context: {
          executionId: 'exec-6',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      // AUDIT FIX: Conditional orders now return REJECTED (not FAILED) for cleaner error handling
      expect(result.status).toBe(ExecutionStatus.REJECTED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Conditional orders are not yet supported');
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel an order successfully', async () => {
      mockTradingClient.cancelOrder.mockResolvedValue(undefined);

      const result = await executionService.cancelOrder('order-123', 'exec-7');

      expect(result).toBe(true);
      expect(mockTradingClient.cancelOrder).toHaveBeenCalledWith('order-123');
    });

    it('should handle cancellation failure', async () => {
      mockTradingClient.cancelOrder.mockRejectedValue(new Error('Order not found'));

      const result = await executionService.cancelOrder('order-999', 'exec-8');

      expect(result).toBe(false);
    });

    it('should cancel all orders for a token', async () => {
      mockTradingClient.cancelMarketOrders.mockResolvedValue(5);

      const result = await executionService.cancelAllOrders('token-456', 'exec-9');

      expect(result).toBe(5);
      expect(mockTradingClient.cancelMarketOrders).toHaveBeenCalledWith('token-456');
    });

    it('should handle cancel all orders failure', async () => {
      mockTradingClient.cancelMarketOrders.mockRejectedValue(new Error('API error'));

      const result = await executionService.cancelAllOrders('token-456', 'exec-10');

      expect(result).toBe(0);
    });
  });

  describe('Execution Timeouts', () => {
    it('should reject order if deadline is exceeded', async () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'token-456',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'exec-11',
          deadline: Date.now() - 1000, // Already expired
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Execution deadline exceeded');
    });

    it('should complete order before deadline', async () => {
      const mockOrder: Order = {
        orderId: 'order-deadline',
        tokenId: 'token-456',
        side: 'BUY',
        price: '0.99',
        size: '100',
        status: 'OPEN',
        createdAt: Date.now(),
      };

      mockTradingClient.createOrder.mockResolvedValue(mockOrder);

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'token-456',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'exec-12',
          deadline: Date.now() + 60000, // 60 seconds in future
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.order).toEqual(mockOrder);
    });
  });

  describe('Execution Metadata', () => {
    it('should track execution time', async () => {
      const mockOrder: Order = {
        orderId: 'order-meta',
        tokenId: 'token-456',
        side: 'BUY',
        price: '0.99',
        size: '100',
        status: 'OPEN',
        createdAt: Date.now(),
      };

      mockTradingClient.createOrder.mockImplementation(async () => {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockOrder;
      });

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'token-456',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'exec-13',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
          metadata: {
            strategyName: 'test-strategy',
            customField: 'custom-value',
          },
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(100);
      expect(result.executionId).toBe('exec-13');
    });

    it('should include retry attempts in result', async () => {
      const mockOrder: Order = {
        orderId: 'order-retry',
        tokenId: 'token-456',
        side: 'BUY',
        price: '0.99',
        size: '100',
        status: 'OPEN',
        createdAt: Date.now(),
      };

      mockTradingClient.createOrder.mockResolvedValue(mockOrder);

      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'token-456',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'exec-14',
          executionStrategy: ExecutionStrategy.RETRY,
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1000,
          },
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.retryAttempts).toBeDefined();
      expect(result.retryAttempts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Types', () => {
    it('should create OrderRejectedError with proper fields', () => {
      const params: MarketOrderParams = {
        orderType: OrderTypeEnum.MARKET,
        tokenId: 'token-456',
        side: 'BUY',
        size: '100',
      };

      const error = new OrderRejectedError('Order rejected', 'Insufficient balance', params);

      expect(error.name).toBe('OrderRejectedError');
      expect(error.message).toBe('Order rejected');
      expect(error.reason).toBe('Insufficient balance');
      expect(error.orderParams).toEqual(params);
    });

    it('should create ExecutionTimeoutError with proper fields', () => {
      const deadline = Date.now() + 60000;
      const error = new ExecutionTimeoutError('Timeout', 'exec-15', deadline);

      expect(error.name).toBe('ExecutionTimeoutError');
      expect(error.message).toBe('Timeout');
      expect(error.executionId).toBe('exec-15');
      expect(error.deadline).toBe(deadline);
    });
  });

  describe('Statistics', () => {
    it('should return execution statistics', () => {
      const stats = executionService.getExecutionStats();

      expect(stats).toHaveProperty('totalExecutions');
      expect(stats).toHaveProperty('successfulExecutions');
      expect(stats).toHaveProperty('failedExecutions');
      expect(stats).toHaveProperty('averageExecutionTimeMs');
    });
  });

  describe('Unsupported Order Types', () => {
    it('should reject unsupported order types', async () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: 'INVALID_TYPE' as any,
          tokenId: 'token-456',
          side: 'BUY',
          size: '100',
        },
        context: {
          executionId: 'exec-16',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Unsupported order type');
    });
  });
});
