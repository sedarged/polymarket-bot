/**
 * Strategy Error Logging Utilities
 * 
 * Provides comprehensive error logging and alerting for trading strategy execution failures.
 * 
 * Addresses:
 * - Issue #126: [Trading Logic] Log and alert strategy execution errors - Audit Finding A-012
 * - Audit Finding A-012: Error swallowing in strategy execution
 * 
 * Usage:
 * ```typescript
 * import { logStrategyError, executeStrategyWithErrorHandling } from './strategyErrorLogging';
 * 
 * // Option 1: Wrap strategy execution
 * const result = await executeStrategyWithErrorHandling(
 *   'momentum-strategy',
 *   async () => strategy.execute(marketData),
 *   { marketId: 'market-123', signals: { rsi: 70 } }
 * );
 * 
 * // Option 2: Manual error logging
 * try {
 *   await strategy.execute(marketData);
 * } catch (error) {
 *   logStrategyError('momentum-strategy', error, { marketId, signals });
 * }
 * ```
 */

import { logger } from './logger';
import { getAlertingService } from './alerting';

export interface StrategyContext {
  marketId?: string;
  signals?: Record<string, unknown>;
  decision?: unknown;
  [key: string]: unknown;
}

export interface StrategyExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
}

/**
 * Log a strategy execution error with full context
 * 
 * Logs the error with:
 * - Strategy name
 * - Error message and stack trace
 * - Input signals
 * - Market context
 * - Decision context (if available)
 * 
 * Also sends alert via alerting service if configured.
 */
export function logStrategyError(
  strategyName: string,
  error: Error | unknown,
  context: StrategyContext = {}
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  // Log with full context
  logger.error('Strategy execution error', {
    strategy: strategyName,
    error: errorObj.message,
    errorName: errorObj.name,
    stack: errorObj.stack,
    ...context,
  });
  
  // Send alert if alerting service is configured
  const alerting = getAlertingService();
  if (alerting) {
    alerting.alertStrategyError(strategyName, errorObj, context).catch((alertError) => {
      logger.error('Failed to send strategy error alert', {
        error: alertError instanceof Error ? alertError.message : String(alertError),
        originalStrategy: strategyName,
        originalError: errorObj.message,
      });
    });
  }
}

/**
 * Execute a strategy with comprehensive error handling
 * 
 * Wraps strategy execution with:
 * - Try-catch error handling
 * - Comprehensive error logging
 * - Alerting on failures
 * - Structured result type
 * 
 * Returns a result object that indicates success/failure without throwing.
 * This allows the calling code to decide how to handle failures.
 * 
 * @param strategyName - Name of the strategy for logging
 * @param strategyFn - Async function that executes the strategy
 * @param context - Additional context for error logging
 * @returns Promise with success flag and result or error
 */
export async function executeStrategyWithErrorHandling<T>(
  strategyName: string,
  strategyFn: () => Promise<T>,
  context: StrategyContext = {}
): Promise<StrategyExecutionResult<T>> {
  const startTime = Date.now();
  
  try {
    logger.debug('Executing strategy', {
      strategy: strategyName,
      ...context,
    });
    
    const result = await strategyFn();
    
    const duration = Date.now() - startTime;
    logger.info('Strategy executed successfully', {
      strategy: strategyName,
      durationMs: duration,
      ...context,
    });
    
    return {
      success: true,
      result,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Log error with full context
    logStrategyError(strategyName, errorObj, {
      ...context,
      durationMs: duration,
    });
    
    return {
      success: false,
      error: errorObj,
    };
  }
}

/**
 * Create a strategy executor with pre-configured context
 * 
 * Useful for creating a bound executor that always includes
 * the same context (e.g., market ID) for all executions.
 * 
 * @param strategyName - Name of the strategy
 * @param baseContext - Context to include in all executions
 * @returns Executor function that accepts strategy function
 */
export function createStrategyExecutor(
  strategyName: string,
  baseContext: StrategyContext = {}
) {
  return async <T>(
    strategyFn: () => Promise<T>,
    additionalContext: StrategyContext = {}
  ): Promise<StrategyExecutionResult<T>> => {
    return executeStrategyWithErrorHandling(
      strategyName,
      strategyFn,
      { ...baseContext, ...additionalContext }
    );
  };
}

/**
 * Log a strategy warning (non-fatal issue)
 * 
 * Use for non-critical issues that don't prevent strategy execution
 * but should be monitored (e.g., missing optional signals, degraded data quality)
 */
export function logStrategyWarning(
  strategyName: string,
  message: string,
  context: StrategyContext = {}
): void {
  logger.warn('Strategy warning', {
    strategy: strategyName,
    warning: message,
    ...context,
  });
}

/**
 * Log strategy execution metrics
 * 
 * Use to track strategy performance and behavior over time
 */
export function logStrategyMetrics(
  strategyName: string,
  metrics: {
    executionTimeMs: number;
    decision?: 'BUY' | 'SELL' | 'HOLD';
    confidence?: number;
    signalCount?: number;
    [key: string]: unknown;
  },
  context: StrategyContext = {}
): void {
  logger.info('Strategy metrics', {
    strategy: strategyName,
    ...metrics,
    ...context,
  });
}
