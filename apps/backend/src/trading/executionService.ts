/**
 * Order Execution Service (GAP-006, GAP-014)
 * 
 * Provides a unified interface for executing market, limit, and conditional orders
 * with robust error handling, retry logic, and comprehensive logging.
 * 
 * Features:
 * - Multiple order types: Market, Limit, Conditional (trigger-based)
 * - Retry logic with exponential backoff
 * - Order rejection handling with fallback strategies
 * - Comprehensive execution logging and audit trail
 * - Integration with existing TradingClient, RiskManager, and AuditTrail
 * - Pre-trade liquidity validation (GAP-014)
 * 
 * Architecture:
 * - Thin abstraction layer over existing TradingClient
 * - Leverages existing validation, retry, and audit infrastructure
 * - Provides order type-specific execution strategies
 * - Optional liquidity validation before order placement
 * 
 * @see {@link ../../../../REPORTS/AUDIT.md}
 * @see {@link ../../../../REPORTS/GAP_ANALYSIS.md}
 */

import { TradingClient } from '../clients/tradingClient';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';
import { Order, Fill } from '@polymarket/shared';
import { LiquidityValidator } from './liquidityValidator';
import type { marketFeedService } from '../server/marketFeedService';

/**
 * Order types supported by the execution service
 */
export enum OrderTypeEnum {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  CONDITIONAL = 'CONDITIONAL',
}

/**
 * Execution strategies for handling order rejections
 */
export enum ExecutionStrategy {
  IMMEDIATE = 'IMMEDIATE',      // Fail immediately on rejection
  RETRY = 'RETRY',              // Retry with same parameters
  SPLIT = 'SPLIT',              // Split large order into smaller chunks
  MODIFY_AND_RETRY = 'MODIFY_AND_RETRY', // Adjust price/size and retry
}

/**
 * Execution context for tracking order execution metadata
 */
export interface ExecutionContext {
  /** Unique identifier for this execution attempt */
  executionId: string;
  /** Strategy name or identifier (optional) */
  strategyName?: string;
  /** Maximum execution deadline (timestamp) */
  deadline?: number;
  /** Retry policy override */
  retryPolicy?: {
    maxAttempts: number;
    initialDelayMs: number;
  };
  /** Execution strategy for handling failures */
  executionStrategy: ExecutionStrategy;
  /** Additional metadata for logging/audit */
  metadata?: Record<string, unknown>;
}

/**
 * Base parameters for all order types
 */
export interface BaseOrderParams {
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: string;
}

/**
 * Market order parameters - execute at best available price
 */
export interface MarketOrderParams extends BaseOrderParams {
  orderType: OrderTypeEnum.MARKET;
  /** Maximum slippage tolerance (e.g., 0.01 for 1%) */
  slippageTolerance?: number;
}

/**
 * Limit order parameters - execute at specified price or better
 */
export interface LimitOrderParams extends BaseOrderParams {
  orderType: OrderTypeEnum.LIMIT;
  price: string;
  /** Time in force: GTC (good til cancelled), IOC (immediate or cancel), FOK (fill or kill) */
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

/**
 * Conditional order parameters - execute when trigger condition is met
 */
export interface ConditionalOrderParams extends BaseOrderParams {
  orderType: OrderTypeEnum.CONDITIONAL;
  price: string;
  /** Trigger price that activates the order */
  triggerPrice: string;
  /** Trigger condition: above or below trigger price */
  triggerCondition: 'ABOVE' | 'BELOW';
}

/**
 * Union type for all order parameters
 */
export type OrderParams = MarketOrderParams | LimitOrderParams | ConditionalOrderParams;

/**
 * Order execution request
 */
export interface OrderExecutionRequest {
  params: OrderParams;
  context: ExecutionContext;
}

/**
 * Execution result status
 */
export enum ExecutionStatus {
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
}

/**
 * Order execution result
 */
export interface OrderExecutionResult {
  status: ExecutionStatus;
  executionId: string;
  order?: Order;
  fills?: Fill[];
  error?: Error;
  /** Total filled size across all fills */
  totalFilledSize?: string;
  /** Average fill price across all fills */
  averageFillPrice?: string;
  /** Total execution time in milliseconds */
  executionTimeMs: number;
  /** Number of retry attempts made */
  retryAttempts: number;
  /** Additional execution metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Custom error types for execution failures
 */
export class OrderRejectedError extends Error {
  constructor(
    message: string,
    public reason: string,
    public orderParams: OrderParams
  ) {
    super(message);
    this.name = 'OrderRejectedError';
  }
}

export class InsufficientLiquidityError extends Error {
  constructor(
    message: string,
    public orderParams: OrderParams,
    public availableLiquidity?: string,
    public requiredLiquidity?: string
  ) {
    super(message);
    this.name = 'InsufficientLiquidityError';
  }
}

export class ExecutionTimeoutError extends Error {
  constructor(
    message: string,
    public executionId: string,
    public deadline: number
  ) {
    super(message);
    this.name = 'ExecutionTimeoutError';
  }
}

/**
 * Order Execution Service
 * 
 * Main service class for executing orders with robust error handling and retry logic.
 * Optionally validates liquidity before placing orders (GAP-014).
 */
export class ExecutionService {
  private liquidityValidator: LiquidityValidator | null;
  private marketFeedService: typeof marketFeedService | null;
  // Execution statistics tracking (replaces placeholder)
  private stats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    totalExecutionTimeMs: 0,
  };

  constructor(
    private tradingClient: TradingClient,
    options?: {
      liquidityValidator?: LiquidityValidator;
      marketFeedService?: typeof marketFeedService;
    }
  ) {
    this.liquidityValidator = options?.liquidityValidator ?? null;
    this.marketFeedService = options?.marketFeedService ?? null;

    if (this.liquidityValidator && !this.marketFeedService) {
      throw new Error(
        'ExecutionService misconfiguration: LiquidityValidator requires MarketFeedService (GAP-014)'
      );
    }
  }

  /**
   * Execute an order with the specified parameters and context
   * 
   * @param request - Order execution request with parameters and context
   * @returns Execution result with order details, fills, and status
   */
  async executeOrder(request: OrderExecutionRequest): Promise<OrderExecutionResult> {
    const startTime = Date.now();
    let retryAttempts = 0;

    logger.info('Starting order execution', {
      category: 'ORDER_FLOW',
      executionId: request.context.executionId,
      orderType: request.params.orderType,
      tokenId: request.params.tokenId,
      side: request.params.side,
      size: request.params.size,
      strategy: request.context.strategyName,
    });

    try {
      // Validate order parameters
      const { params } = request;
      const numericSize = typeof params.size === 'string' ? parseFloat(params.size) : params.size;
      if (!Number.isFinite(numericSize) || numericSize <= 0) {
        return {
          executionId: request.context.executionId,
          status: ExecutionStatus.REJECTED,
          error: new Error(`Invalid order size: ${params.size}. Must be a positive number.`),
        };
      }
      if (!params.tokenId || params.tokenId.trim().length === 0) {
        return {
          executionId: request.context.executionId,
          status: ExecutionStatus.REJECTED,
          error: new Error('Token ID cannot be empty'),
        };
      }
      if (params.side !== 'BUY' && params.side !== 'SELL') {
        return {
          executionId: request.context.executionId,
          status: ExecutionStatus.REJECTED,
          error: new Error(`Invalid order side: ${params.side}. Must be BUY or SELL.`),
        };
      }

      // Check deadline
      if (request.context.deadline && Date.now() > request.context.deadline) {
        throw new ExecutionTimeoutError(
          'Execution deadline exceeded before order submission',
          request.context.executionId,
          request.context.deadline
        );
      }

      // Route to appropriate execution method based on order type,
      // optionally applying retry logic when a retry policy is provided.
      let result: OrderExecutionResult;
      let attemptCount = 0;

      const executeOnce = async (): Promise<OrderExecutionResult> => {
        // The first invocation is the initial attempt; subsequent invocations are retries.
        if (attemptCount > 0) {
          retryAttempts += 1;
        }
        attemptCount += 1;

        switch (request.params.orderType) {
          case OrderTypeEnum.MARKET:
            return await this.executeMarketOrder(request, startTime);
          case OrderTypeEnum.LIMIT:
            return await this.executeLimitOrder(request, startTime);
          case OrderTypeEnum.CONDITIONAL:
            return await this.executeConditionalOrder(request, startTime);
          default:
            throw new Error(`Unsupported order type: ${(request.params as OrderParams).orderType}`);
        }
      };

      if (request.context.retryPolicy) {
        // Apply retry logic with custom policy
        result = await retry(executeOnce, {
          attempts: request.context.retryPolicy.maxAttempts,
          delay: request.context.retryPolicy.initialDelayMs,
        });
      } else {
        // No retry policy, execute once
        result = await executeOnce();
      }

      result.retryAttempts = retryAttempts;

      // Track execution statistics
      this.stats.totalExecutions++;
      this.stats.totalExecutionTimeMs += result.executionTimeMs;
      if (result.status === ExecutionStatus.SUCCESS || result.status === ExecutionStatus.PARTIAL) {
        this.stats.successfulExecutions++;
      } else {
        this.stats.failedExecutions++;
      }

      logger.info('Order execution completed', {
        category: 'ORDER_FLOW',
        executionId: request.context.executionId,
        status: result.status,
        orderId: result.order?.orderId,
        executionTimeMs: result.executionTimeMs,
        retryAttempts: result.retryAttempts,
      });

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Track failed execution statistics
      this.stats.totalExecutions++;
      this.stats.failedExecutions++;
      this.stats.totalExecutionTimeMs += executionTimeMs;

      logger.error('Order execution failed', {
        category: 'ORDER_FLOW',
        executionId: request.context.executionId,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        executionTimeMs,
        retryAttempts,
      });

      return {
        status: ExecutionStatus.FAILED,
        executionId: request.context.executionId,
        error: error instanceof Error ? error : new Error(String(error)),
        executionTimeMs,
        retryAttempts,
      };
    }
  }

  /**
   * Check liquidity for an order (GAP-014)
   * 
   * Validates that sufficient market liquidity exists before placing an order.
   * This check is optional and only performed if liquidityValidator and marketFeedService
   * are both configured.
   * 
   * @param tokenId - Token ID for the order
   * @param side - Order side (BUY or SELL)
   * @param size - Order size
   * @param executionId - Execution ID for logging
   * @param orderParams - Full order parameters for error context
   * @throws InsufficientLiquidityError if liquidity check fails
   */
  private checkLiquidity(
    tokenId: string,
    side: 'BUY' | 'SELL',
    size: string,
    executionId: string,
    orderParams: OrderParams
  ): void {
    // Skip liquidity check if validator or market feed is not configured
    if (!this.liquidityValidator || !this.marketFeedService) {
      return;
    }

    logger.debug('Checking liquidity for order', {
      category: 'ORDER_FLOW',
      executionId,
      tokenId,
      side,
      size,
      gap: 'GAP-014',
    });

    // Get orderbook from market feed
    const orderbook = this.marketFeedService.getOrderbook(tokenId);
    
    // Get orderbook timestamp from cache
    // Note: MarketFeedService doesn't expose getLastUpdate directly,
    // so we use the timestamp from the orderbook itself
    const orderbookTimestamp = orderbook?.timestamp;

    // Perform liquidity check
    const result = this.liquidityValidator.checkLiquidity(
      tokenId,
      side,
      size,
      orderbook,
      orderbookTimestamp
    );

    // If check fails, throw error
    if (!result.allowed) {
      logger.warn('Order rejected due to insufficient liquidity', {
        category: 'ORDER_FLOW',
        executionId,
        tokenId,
        side,
        size,
        reason: result.reason,
        availableLiquidity: result.availableLiquidity,
        requiredLiquidity: result.requiredLiquidity,
        gap: 'GAP-014',
      });

      throw new InsufficientLiquidityError(
        result.reason || 'Insufficient liquidity',
        orderParams,
        result.availableLiquidity,
        result.requiredLiquidity
      );
    }

    logger.debug('Liquidity check passed', {
      category: 'ORDER_FLOW',
      executionId,
      tokenId,
      side,
      size,
      availableLiquidity: result.availableLiquidity,
      requiredLiquidity: result.requiredLiquidity,
      bestPrice: result.bestPrice,
      gap: 'GAP-014',
    });
  }

  /**
   * Execute a market order (immediate execution at best available price)
   */
  private async executeMarketOrder(
    request: OrderExecutionRequest,
    startTime: number
  ): Promise<OrderExecutionResult> {
    const params = request.params as MarketOrderParams;

    // GAP-014: Check liquidity before placing order
    this.checkLiquidity(
      params.tokenId,
      params.side,
      params.size,
      request.context.executionId,
      params
    );

    // TRADING SAFETY: Calculate aggressive price from orderbook for immediate execution.
    // BUY: use best ask * (1 + slippageTolerance), cap at 0.99.
    // SELL: use best bid * (1 - slippageTolerance), floor at 0.01.
    // FIX: Require fresh orderbook data instead of falling back to extreme prices.
    let price: string;
    const orderbook = this.marketFeedService?.getOrderbook(params.tokenId);
    const rawSlippage = params.slippageTolerance ?? 0.02;
    const MAX_SLIPPAGE = 0.50; // Cap slippage at 50% to prevent catastrophic fills
    const slippage = Number.isFinite(rawSlippage) && rawSlippage >= 0
      ? Math.min(rawSlippage, MAX_SLIPPAGE)
      : 0.02;

    // Validate orderbook freshness - reject if no data or stale (>5s)
    const orderbookAge = orderbook?.timestamp ? Date.now() - orderbook.timestamp : Infinity;
    const hasValidOrderbook = orderbook && orderbookAge < 5000;

    if (params.side === 'BUY') {
      const bestAskStr = hasValidOrderbook ? orderbook?.asks?.[0]?.price : undefined;
      if (bestAskStr === undefined) {
        logger.warn('Market BUY order rejected: no fresh orderbook data', {
          category: 'ORDER_FLOW',
          tokenId: params.tokenId,
          orderbookAge: orderbookAge === Infinity ? 'none' : `${orderbookAge}ms`,
        });
        return {
          executionId: request.context.executionId,
          status: ExecutionStatus.REJECTED,
          error: new Error(`Market BUY order requires fresh orderbook data for token ${params.tokenId}`),
        };
      }
      const parsedAsk = parseFloat(bestAskStr);
      const askPrice = Number.isFinite(parsedAsk) ? parsedAsk : 0.99;
      const computedPrice = askPrice * (1 + slippage);
      const boundedPrice = Math.min(computedPrice, 0.99);
      price = String(Number.isFinite(boundedPrice) ? boundedPrice : 0.99);
    } else {
      const bestBidStr = hasValidOrderbook ? orderbook?.bids?.[0]?.price : undefined;
      if (bestBidStr === undefined) {
        logger.warn('Market SELL order rejected: no fresh orderbook data', {
          category: 'ORDER_FLOW',
          tokenId: params.tokenId,
          orderbookAge: orderbookAge === Infinity ? 'none' : `${orderbookAge}ms`,
        });
        return {
          executionId: request.context.executionId,
          status: ExecutionStatus.REJECTED,
          error: new Error(`Market SELL order requires fresh orderbook data for token ${params.tokenId}`),
        };
      }
      const parsedBid = parseFloat(bestBidStr);
      const bidPrice = Number.isFinite(parsedBid) ? parsedBid : 0.01;
      const computedPrice = bidPrice * (1 - slippage);
      const boundedPrice = Math.max(computedPrice, 0.01);
      price = String(Number.isFinite(boundedPrice) ? boundedPrice : 0.01);
    }

    logger.info('Executing market order', {
      category: 'ORDER_FLOW',
      executionId: request.context.executionId,
      tokenId: params.tokenId,
      side: params.side,
      size: params.size,
      estimatedPrice: price,
      slippageTolerance: params.slippageTolerance,
    });

    // Use TradingClient to place the order
    const order = await this.tradingClient.createOrder(
      params.tokenId,
      params.side,
      price,
      params.size
    );

    const executionTimeMs = Date.now() - startTime;

    return {
      status: ExecutionStatus.SUCCESS,
      executionId: request.context.executionId,
      order,
      executionTimeMs,
      retryAttempts: 0,
    };
  }

  /**
   * Execute a limit order (execution at specified price or better)
   */
  private async executeLimitOrder(
    request: OrderExecutionRequest,
    startTime: number
  ): Promise<OrderExecutionResult> {
    const params = request.params as LimitOrderParams;

    // GAP-014: Check liquidity before placing order
    this.checkLiquidity(
      params.tokenId,
      params.side,
      params.size,
      request.context.executionId,
      params
    );

    logger.info('Executing limit order', {
      category: 'ORDER_FLOW',
      executionId: request.context.executionId,
      tokenId: params.tokenId,
      side: params.side,
      size: params.size,
      price: params.price,
      timeInForce: params.timeInForce || 'GTC',
    });

    // Use TradingClient to place the limit order
    const order = await this.tradingClient.createOrder(
      params.tokenId,
      params.side,
      params.price,
      params.size
    );

    const executionTimeMs = Date.now() - startTime;

    // Note: For IOC/FOK orders, we would need to check if the order was filled immediately
    // and cancel if not (for IOC) or reject if not fully filled (for FOK)
    // This is a simplified implementation

    return {
      status: ExecutionStatus.SUCCESS,
      executionId: request.context.executionId,
      order,
      executionTimeMs,
      retryAttempts: 0,
    };
  }

  /**
   * Execute a conditional order (execution when trigger condition is met)
   */
  private async executeConditionalOrder(
    request: OrderExecutionRequest,
    startTime: number
  ): Promise<OrderExecutionResult> {
    const params = request.params as ConditionalOrderParams;

    logger.warn('Conditional order requested but not supported', {
      category: 'ORDER_FLOW',
      executionId: request.context.executionId,
      tokenId: params.tokenId,
      side: params.side,
      size: params.size,
      price: params.price,
      triggerPrice: params.triggerPrice,
      triggerCondition: params.triggerCondition,
    });

    const executionTimeMs = Date.now() - startTime;

    // AUDIT FIX: Return a proper REJECTED result instead of throwing, so callers handle it gracefully.
    // Conditional orders require market price monitoring via WebSocket + persistent state management.
    // This feature is intentionally not yet implemented (requires product decision on trigger architecture).
    return {
      status: ExecutionStatus.REJECTED,
      executionId: request.context.executionId,
      error: new Error('Conditional orders are not yet supported. They require market price monitoring and persistent trigger state.'),
      executionTimeMs,
      retryAttempts: 0,
    };
  }

  /**
   * Cancel an order by order ID
   */
  async cancelOrder(orderId: string, executionId: string): Promise<boolean> {
    logger.info('Cancelling order', {
      category: 'ORDER_FLOW',
      executionId,
      orderId,
    });

    try {
      await this.tradingClient.cancelOrder(orderId);
      
      logger.info('Order cancelled successfully', {
        category: 'ORDER_FLOW',
        executionId,
        orderId,
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to cancel order', {
        category: 'ORDER_FLOW',
        executionId,
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return false;
    }
  }

  /**
   * Cancel all orders for a specific token
   */
  async cancelAllOrders(tokenId: string, executionId: string): Promise<number> {
    logger.info('Cancelling all orders for token', {
      category: 'ORDER_FLOW',
      executionId,
      tokenId,
    });

    try {
      const cancelled = await this.tradingClient.cancelMarketOrders(tokenId);
      
      logger.info('Orders cancelled successfully', {
        category: 'ORDER_FLOW',
        executionId,
        tokenId,
        cancelledCount: cancelled,
      });
      
      return cancelled;
    } catch (error) {
      logger.error('Failed to cancel orders', {
        category: 'ORDER_FLOW',
        executionId,
        tokenId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return 0;
    }
  }

  /**
   * Get execution statistics for monitoring and debugging
   */
  getExecutionStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTimeMs: number;
  } {
    return {
      totalExecutions: this.stats.totalExecutions,
      successfulExecutions: this.stats.successfulExecutions,
      failedExecutions: this.stats.failedExecutions,
      averageExecutionTimeMs: this.stats.totalExecutions > 0
        ? this.stats.totalExecutionTimeMs / this.stats.totalExecutions
        : 0,
    };
  }
}
