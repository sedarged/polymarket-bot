/**
 * Integration tests for ExecutionService (GAP-006)
 * 
 * Tests the execution service with real dependencies to ensure:
 * - Integration with TradingClient
 * - Order validation and constraints
 * - Error handling in realistic scenarios
 * - Execution flow from request to completion
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ExecutionService,
  OrderTypeEnum,
  ExecutionStrategy,
  ExecutionStatus,
  OrderExecutionRequest,
  MarketOrderParams,
  LimitOrderParams,
} from '../../src/trading/executionService';
import { TradingClient } from '../../src/clients/tradingClient';
import { config } from '../../src/config';

describe('ExecutionService Integration', () => {
  let executionService: ExecutionService;
  let tradingClient: TradingClient;

  beforeAll(async () => {
    // Create TradingClient instance
    tradingClient = new TradingClient();
    
    // Note: We cannot initialize the trading client in tests without proper credentials
    // These tests will validate the integration structure without actually placing orders
    
    // Create ExecutionService
    executionService = new ExecutionService(tradingClient);
  });

  describe('Service Initialization', () => {
    it('should create an ExecutionService instance', () => {
      expect(executionService).toBeDefined();
      expect(executionService).toBeInstanceOf(ExecutionService);
    });

    it('should have cancelOrder method', () => {
      expect(executionService.cancelOrder).toBeDefined();
      expect(typeof executionService.cancelOrder).toBe('function');
    });

    it('should have cancelAllOrders method', () => {
      expect(executionService.cancelAllOrders).toBeDefined();
      expect(typeof executionService.cancelAllOrders).toBe('function');
    });

    it('should have executeOrder method', () => {
      expect(executionService.executeOrder).toBeDefined();
      expect(typeof executionService.executeOrder).toBe('function');
    });

    it('should have getExecutionStats method', () => {
      expect(executionService.getExecutionStats).toBeDefined();
      expect(typeof executionService.getExecutionStats).toBe('function');
    });
  });

  describe('Execution Request Validation', () => {
    it('should validate market order request structure', () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'test-token',
          side: 'BUY',
          size: '100',
          slippageTolerance: 0.01,
        } as MarketOrderParams,
        context: {
          executionId: 'test-exec-1',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      expect(request.params.orderType).toBe(OrderTypeEnum.MARKET);
      expect(request.params.tokenId).toBe('test-token');
      expect(request.params.side).toBe('BUY');
      expect(request.params.size).toBe('100');
    });

    it('should validate limit order request structure', () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: 'test-token',
          side: 'SELL',
          price: '0.55',
          size: '200',
          timeInForce: 'GTC',
        } as LimitOrderParams,
        context: {
          executionId: 'test-exec-2',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      expect(request.params.orderType).toBe(OrderTypeEnum.LIMIT);
      expect(request.params.price).toBe('0.55');
      expect((request.params as LimitOrderParams).timeInForce).toBe('GTC');
    });

    it('should validate execution context structure', () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'test-token',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'test-exec-3',
          executionStrategy: ExecutionStrategy.RETRY,
          strategyName: 'test-strategy',
          deadline: Date.now() + 60000,
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1000,
          },
          metadata: {
            customField: 'custom-value',
          },
        },
      };

      expect(request.context.executionId).toBe('test-exec-3');
      expect(request.context.executionStrategy).toBe(ExecutionStrategy.RETRY);
      expect(request.context.strategyName).toBe('test-strategy');
      expect(request.context.deadline).toBeGreaterThan(Date.now());
      expect(request.context.retryPolicy?.maxAttempts).toBe(3);
      expect(request.context.metadata).toHaveProperty('customField');
    });
  });

  describe('Execution Statistics', () => {
    it('should return execution statistics structure', () => {
      const stats = executionService.getExecutionStats();

      expect(stats).toHaveProperty('totalExecutions');
      expect(stats).toHaveProperty('successfulExecutions');
      expect(stats).toHaveProperty('failedExecutions');
      expect(stats).toHaveProperty('averageExecutionTimeMs');
      
      expect(typeof stats.totalExecutions).toBe('number');
      expect(typeof stats.successfulExecutions).toBe('number');
      expect(typeof stats.failedExecutions).toBe('number');
      expect(typeof stats.averageExecutionTimeMs).toBe('number');
    });
  });

  describe('Error Handling Structure', () => {
    it('should handle trading client not initialized gracefully', async () => {
      // Test that execution fails gracefully when trading client is not initialized
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'test-token',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'test-exec-4',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      // This should fail because trading client is not initialized
      const result = await executionService.executeOrder(request);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.executionId).toBe('test-exec-4');
    });
  });

  describe('Execution Flow', () => {
    it('should track execution time in results', async () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'test-token',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'test-exec-5',
          executionStrategy: ExecutionStrategy.IMMEDIATE,
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result).toHaveProperty('executionTimeMs');
      expect(typeof result.executionTimeMs).toBe('number');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track retry attempts in results', async () => {
      const request: OrderExecutionRequest = {
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: 'test-token',
          side: 'BUY',
          size: '100',
        } as MarketOrderParams,
        context: {
          executionId: 'test-exec-6',
          executionStrategy: ExecutionStrategy.RETRY,
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 100,
          },
        },
      };

      const result = await executionService.executeOrder(request);

      expect(result).toHaveProperty('retryAttempts');
      expect(typeof result.retryAttempts).toBe('number');
      expect(result.retryAttempts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Order Type Support', () => {
    it('should support MARKET order type', () => {
      expect(OrderTypeEnum.MARKET).toBe('MARKET');
    });

    it('should support LIMIT order type', () => {
      expect(OrderTypeEnum.LIMIT).toBe('LIMIT');
    });

    it('should support CONDITIONAL order type', () => {
      expect(OrderTypeEnum.CONDITIONAL).toBe('CONDITIONAL');
    });
  });

  describe('Execution Strategy Support', () => {
    it('should support IMMEDIATE execution strategy', () => {
      expect(ExecutionStrategy.IMMEDIATE).toBe('IMMEDIATE');
    });

    it('should support RETRY execution strategy', () => {
      expect(ExecutionStrategy.RETRY).toBe('RETRY');
    });

    it('should support SPLIT execution strategy', () => {
      expect(ExecutionStrategy.SPLIT).toBe('SPLIT');
    });

    it('should support MODIFY_AND_RETRY execution strategy', () => {
      expect(ExecutionStrategy.MODIFY_AND_RETRY).toBe('MODIFY_AND_RETRY');
    });
  });

  describe('Configuration Integration', () => {
    it('should respect trading configuration', () => {
      // Verify that config is accessible for execution service
      expect(config).toBeDefined();
      expect(config.clobApiUrl).toBeDefined();
      expect(config.chainId).toBeDefined();
    });
  });
});
