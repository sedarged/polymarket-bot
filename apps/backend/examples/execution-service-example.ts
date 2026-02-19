#!/usr/bin/env tsx
/**
 * Example script demonstrating ExecutionService usage
 * 
 * This script shows how to:
 * 1. Initialize the execution service
 * 2. Place different types of orders
 * 3. Handle execution results
 * 4. Cancel orders
 * 
 * Usage:
 *   npm run example:execution
 * 
 * Note: This requires LIVE_TRADING=true and COMPLIANCE_ACCEPTED=true
 *       to actually place orders. Otherwise, it will demonstrate the
 *       structure without executing real trades.
 */

import { ExecutionService, OrderTypeEnum, ExecutionStrategy, ExecutionStatus } from '../src/trading/executionService';
import { TradingClient } from '../src/clients/tradingClient';
import { logger } from '../src/utils/logger';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  logger.info('Starting ExecutionService example');

  try {
    // Initialize trading client
    const tradingClient = new TradingClient();
    
    // Note: This will fail if LIVE_TRADING and COMPLIANCE_ACCEPTED are not set
    // That's intentional for safety
    try {
      await tradingClient.initialize();
    } catch (error) {
      logger.warn('Trading client initialization skipped (paper mode)', {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.info('To actually place orders, set LIVE_TRADING=true and COMPLIANCE_ACCEPTED=true');
      logger.info('This example will demonstrate the structure without real trades');
    }

    // Create execution service
    const executionService = new ExecutionService(tradingClient);

    logger.info('ExecutionService initialized successfully');

    // Example 1: Market Order
    logger.info('Example 1: Market Order');
    const marketOrderRequest = {
      params: {
        orderType: OrderTypeEnum.MARKET,
        tokenId: 'example-token-123',
        side: 'BUY' as const,
        size: '100',
        slippageTolerance: 0.01,
      },
      context: {
        executionId: uuidv4(),
        executionStrategy: ExecutionStrategy.IMMEDIATE,
        strategyName: 'example-strategy',
        metadata: {
          example: 'market-order',
        },
      },
    };

    logger.info('Placing market order', {
      tokenId: marketOrderRequest.params.tokenId,
      side: marketOrderRequest.params.side,
      size: marketOrderRequest.params.size,
    });

    const marketResult = await executionService.executeOrder(marketOrderRequest);

    logger.info('Market order result', {
      status: marketResult.status,
      executionId: marketResult.executionId,
      executionTimeMs: marketResult.executionTimeMs,
      retryAttempts: marketResult.retryAttempts,
      error: marketResult.error?.message,
    });

    // Example 2: Limit Order
    logger.info('Example 2: Limit Order');
    const limitOrderRequest = {
      params: {
        orderType: OrderTypeEnum.LIMIT,
        tokenId: 'example-token-456',
        side: 'SELL' as const,
        price: '0.65',
        size: '150',
        timeInForce: 'GTC' as const,
      },
      context: {
        executionId: uuidv4(),
        executionStrategy: ExecutionStrategy.RETRY,
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 1000,
        },
        metadata: {
          example: 'limit-order',
        },
      },
    };

    logger.info('Placing limit order', {
      tokenId: limitOrderRequest.params.tokenId,
      side: limitOrderRequest.params.side,
      price: limitOrderRequest.params.price,
      size: limitOrderRequest.params.size,
    });

    const limitResult = await executionService.executeOrder(limitOrderRequest);

    logger.info('Limit order result', {
      status: limitResult.status,
      executionId: limitResult.executionId,
      executionTimeMs: limitResult.executionTimeMs,
      retryAttempts: limitResult.retryAttempts,
      error: limitResult.error?.message,
    });

    // Example 3: Conditional Order (not yet implemented)
    logger.info('Example 3: Conditional Order (placeholder)');
    const conditionalOrderRequest = {
      params: {
        orderType: OrderTypeEnum.CONDITIONAL,
        tokenId: 'example-token-789',
        side: 'SELL' as const,
        price: '0.40',
        size: '100',
        triggerPrice: '0.45',
        triggerCondition: 'BELOW' as const,
      },
      context: {
        executionId: uuidv4(),
        executionStrategy: ExecutionStrategy.IMMEDIATE,
        metadata: {
          example: 'conditional-order',
        },
      },
    };

    logger.info('Placing conditional order (will fail with not-implemented error)', {
      tokenId: conditionalOrderRequest.params.tokenId,
      triggerPrice: conditionalOrderRequest.params.triggerPrice,
      triggerCondition: conditionalOrderRequest.params.triggerCondition,
    });

    const conditionalResult = await executionService.executeOrder(conditionalOrderRequest);

    logger.info('Conditional order result', {
      status: conditionalResult.status,
      executionId: conditionalResult.executionId,
      executionTimeMs: conditionalResult.executionTimeMs,
      error: conditionalResult.error?.message,
    });

    // Example 4: Execution Statistics
    logger.info('Example 4: Execution Statistics');
    const stats = executionService.getExecutionStats();

    logger.info('Execution statistics', {
      totalExecutions: stats.totalExecutions,
      successfulExecutions: stats.successfulExecutions,
      failedExecutions: stats.failedExecutions,
      averageExecutionTimeMs: stats.averageExecutionTimeMs,
    });

    // Example 5: Order Cancellation
    if (marketResult.order?.orderId) {
      logger.info('Example 5: Order Cancellation');
      const cancelled = await executionService.cancelOrder(
        marketResult.order.orderId,
        uuidv4()
      );

      logger.info('Cancellation result', {
        orderId: marketResult.order.orderId,
        cancelled,
      });
    }

    logger.info('ExecutionService example completed');
  } catch (error) {
    logger.error('Example failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
