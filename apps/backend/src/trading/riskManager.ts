import { Order, Position } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { saveKillSwitchState, loadKillSwitchState, clearKillSwitchState } from '../utils/statePersistence';
import { CircuitBreaker, CircuitState } from '../utils/circuitBreaker';
import { getAlertingService } from '../utils/alerting';
import { FeeRateValidator } from './feeRateValidator';
import type { MarketConfigEntry } from '../config';

export interface RiskManagerConfig {
  maxExposurePerMarket: number;
  maxOpenOrders: number;
  maxDrawdown: number;
  errorRateThreshold: number;
  errorRateWindow: number;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerResetTimeoutMs?: number;
  circuitBreakerSuccessThreshold?: number;
  maxFeeRateBps?: number;
  markets?: MarketConfigEntry[];
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

// Default values for risk manager configuration
const DEFAULT_MAX_FEE_RATE_BPS = 50;

/**
 * Risk Manager with circuit breakers
 * - Max exposure per market
 * - Max open orders
 * - Max drawdown
 * - Circuit breaker with auto-reset (Audit Finding A-018)
 * - Fee rate checking (GAP-019)
 * - Per-market config overrides (GAP-001)
 */
export class RiskManager {
  private config: RiskManagerConfig;
  private operations: { timestamp: number; isError: boolean }[] = [];
  private killed = false;
  private pendingPersistenceOps: Promise<void>[] = [];
  private circuitBreaker: CircuitBreaker;
  private feeRateValidator: FeeRateValidator;
  private markets: Map<string, MarketConfigEntry>;

  constructor(config?: Partial<RiskManagerConfig>) {
    // Validate config values before applying
    if (config?.maxDrawdown !== undefined && (config.maxDrawdown < 0 || config.maxDrawdown > 1)) {
      throw new Error(`Invalid maxDrawdown: ${config.maxDrawdown}. Must be between 0 and 1.`);
    }
    if (config?.errorRateThreshold !== undefined && (config.errorRateThreshold < 0 || config.errorRateThreshold > 1)) {
      throw new Error(`Invalid errorRateThreshold: ${config.errorRateThreshold}. Must be between 0 and 1.`);
    }
    if (config?.maxOpenOrders !== undefined && config.maxOpenOrders <= 0) {
      throw new Error(`Invalid maxOpenOrders: ${config.maxOpenOrders}. Must be > 0.`);
    }
    if (config?.maxExposurePerMarket !== undefined && config.maxExposurePerMarket <= 0) {
      throw new Error(`Invalid maxExposurePerMarket: ${config.maxExposurePerMarket}. Must be > 0.`);
    }

    this.config = {
      maxExposurePerMarket: config?.maxExposurePerMarket ?? 1000,
      maxOpenOrders: config?.maxOpenOrders ?? 50,
      maxDrawdown: config?.maxDrawdown ?? 0.20,
      errorRateThreshold: config?.errorRateThreshold ?? 0.10,
      errorRateWindow: config?.errorRateWindow ?? 100,
      circuitBreakerFailureThreshold: config?.circuitBreakerFailureThreshold ?? 5,
      circuitBreakerResetTimeoutMs: config?.circuitBreakerResetTimeoutMs ?? 60000,
      circuitBreakerSuccessThreshold: config?.circuitBreakerSuccessThreshold ?? 2,
      maxFeeRateBps: config?.maxFeeRateBps ?? DEFAULT_MAX_FEE_RATE_BPS,
      markets: config?.markets,
    };

    // Initialize per-market config map for efficient lookup (GAP-001)
    this.markets = new Map();
    if (this.config.markets) {
      for (const market of this.config.markets) {
        if (market.tokenId) {
          this.markets.set(market.tokenId, market);
        }
      }
    }

    // Initialize circuit breaker with auto-reset capability (Audit Finding A-018)
    this.circuitBreaker = new CircuitBreaker({
      name: 'risk-manager',
      failureThreshold: this.config.circuitBreakerFailureThreshold,
      resetTimeout: this.config.circuitBreakerResetTimeoutMs,
      successThreshold: this.config.circuitBreakerSuccessThreshold,
    });

    // Initialize fee rate validator (GAP-019)
    this.feeRateValidator = new FeeRateValidator(this.config.maxFeeRateBps ?? DEFAULT_MAX_FEE_RATE_BPS);

    // Set up circuit breaker event listeners for logging
    this.circuitBreaker.on('open', (metrics) => {
      logger.error('Circuit breaker opened - blocking new orders', {
        failures: metrics.failures,
        consecutiveFailures: metrics.consecutiveFailures,
        resetTimeoutMs: this.config.circuitBreakerResetTimeoutMs,
      });
    });

    this.circuitBreaker.on('half-open', () => {
      logger.info('Circuit breaker half-open - testing recovery', {
        successThreshold: this.config.circuitBreakerSuccessThreshold,
      });
    });

    this.circuitBreaker.on('closed', (metrics) => {
      logger.info('Circuit breaker closed - normal operation resumed', {
        totalRequests: metrics.totalRequests,
      });
    });

    logger.info('Risk manager initialized', {
      maxExposurePerMarket: this.config.maxExposurePerMarket,
      maxOpenOrders: this.config.maxOpenOrders,
      maxDrawdown: this.config.maxDrawdown,
      errorRateThreshold: this.config.errorRateThreshold,
      errorRateWindow: this.config.errorRateWindow,
      maxFeeRateBps: this.config.maxFeeRateBps,
      circuitBreaker: {
        failureThreshold: this.config.circuitBreakerFailureThreshold,
        resetTimeoutMs: this.config.circuitBreakerResetTimeoutMs,
        successThreshold: this.config.circuitBreakerSuccessThreshold,
      },
    });
  }

  /**
   * Restore kill switch state from persistent storage
   * Should be called during startup before enabling trading
   * FAIL-CLOSED: On unexpected errors, activates kill switch for safety
   */
  async restoreState(): Promise<void> {
    try {
      const state = await loadKillSwitchState();
      
      if (state && state.killed) {
        this.killed = true;
        logger.warn('Kill switch state restored from disk - trading disabled', {
          timestamp: state.timestamp,
          age: Date.now() - state.timestamp,
          reason: state.reason,
        });
      } else {
        logger.info('No active kill switch state found - trading enabled');
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      
      // Missing state file is treated as "no prior kill condition"
      if (err && err.code === 'ENOENT') {
        logger.info('No kill switch state file found - assuming no prior kill condition');
        return;
      }
      
      // Fail closed on unexpected restoration errors: force kill switch active
      this.killed = true;
      logger.error('CRITICAL: Failed to restore kill switch state - kill switch forced ACTIVE', {
        error: error instanceof Error ? error.message : String(error),
        code: err && err.code,
        stack: error instanceof Error ? error.stack : undefined,
      });
      logger.warn(
        'Kill switch is ACTIVE due to state restoration failure - trading disabled until manual operator reset'
      );
    }
  }

  /**
   * Check if a new order should be allowed
   */
  checkOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    size: string,
    orders: Order[],
    positions: Position[],
    feeRateBps?: number
  ): RiskCheckResult {
    // Check if killed
    if (this.killed) {
      return {
        allowed: false,
        reason: 'Trading is killed by risk manager',
      };
    }

    // Check circuit breaker - now with auto-reset capability (Audit Finding A-018)
    if (this.circuitBreaker.isOpen()) {
      return {
        allowed: false,
        reason: 'Circuit breaker is open: error rate too high',
      };
    }

    // Also check legacy error rate tracking for backward compatibility
    if (this.isCircuitBreakerTripped()) {
      return {
        allowed: false,
        reason: 'Circuit breaker tripped: error rate too high',
      };
    }

    // Check fee rate (GAP-019)
    const feeCheck = this.feeRateValidator.checkFeeRate(feeRateBps, tokenId);
    if (!feeCheck.allowed) {
      return {
        allowed: false,
        reason: feeCheck.reason,
      };
    }

    // Check max open orders (including partially filled orders)
    const openOrders = orders.filter(o => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED');
    if (openOrders.length >= this.config.maxOpenOrders) {
      return {
        allowed: false,
        reason: `Max open orders limit reached: ${this.config.maxOpenOrders}`,
      };
    }

    // Check max exposure per market (GAP-001: use per-market override if available)
    const orderSize = Number(size);
    const currentPosition = positions.find(p => p.tokenId === tokenId);
    const currentSignedSize = currentPosition ? Number(currentPosition.size) : 0;
    
    // Calculate new signed position size (positive = long, negative = short)
    const newSignedSize = currentSignedSize + (side === 'BUY' ? orderSize : -orderSize);
    const newExposure = Math.abs(newSignedSize);

    // Get per-market limit or fall back to global limit
    const marketConfig = this.markets.get(tokenId);
    const maxExposure = marketConfig?.maxPositionSize ?? this.config.maxExposurePerMarket;

    if (newExposure > maxExposure) {
      return {
        allowed: false,
        reason: `Max exposure per market exceeded: ${newExposure} > ${maxExposure}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if drawdown limit has been exceeded
   */
  checkDrawdown(initialBalance: number, currentBalance: number, totalPnl: number): RiskCheckResult {
    const currentValue = currentBalance + totalPnl;
    const drawdown = (initialBalance - currentValue) / initialBalance;

    if (drawdown > this.config.maxDrawdown) {
      logger.error('Max drawdown exceeded', {
        drawdown,
        maxDrawdown: this.config.maxDrawdown,
        initialBalance,
        currentValue,
      });

      return {
        allowed: false,
        reason: `Max drawdown exceeded: ${(drawdown * 100).toFixed(2)}% > ${(this.config.maxDrawdown * 100).toFixed(2)}%`,
      };
    }

    return { allowed: true };
  }

   /**
    * Record an operation (success or error) for legacy circuit breaker tracking.
    * 
    * NOTE: This does NOT affect the new CircuitBreaker class (Audit Finding A-018),
    * which must be used by wrapping operations with getCircuitBreaker().execute()
    * 
    * This method maintains the legacy error-rate based circuit breaker that uses
    * isCircuitBreakerTripped() to check if error rate exceeds threshold.
    */
   recordOperation(isError: boolean, errorMessage?: string): void {
     // Legacy tracking maintained for backward compatibility and historical error rate calculation
     // The legacy isCircuitBreakerTripped() method uses this data for error rate-based checking
     this.operations.push({
       timestamp: Date.now(),
       isError,
     });

     // Keep only recent operations (last minute)
     const now = Date.now();
     this.operations = this.operations.filter(e => now - e.timestamp < 60000);

     if (isError && errorMessage) {
       logger.warn('Error recorded for circuit breaker', {
         error: errorMessage,
         recentOperations: this.operations.length,
         recentErrors: this.operations.filter(op => op.isError).length,
       });
     }
     
     // Check error rate and send alert if threshold exceeded
     if (this.operations.length >= this.config.errorRateWindow) {
       const lastWindowOps = this.operations.slice(-this.config.errorRateWindow);
       const errorCount = lastWindowOps.filter(op => op.isError).length;
       const errorRate = errorCount / this.config.errorRateWindow;
       
       const alerting = getAlertingService();
       if (alerting) {
         alerting.alertHighErrorRate(errorRate, this.config.errorRateWindow).catch((error) => {
           logger.error('Failed to send error rate alert', {
             error: error instanceof Error ? error.message : String(error),
           });
         });
       }
     }

     // NOTE: The new CircuitBreaker class is NOT directly tracked via recordOperation()
     // It's used by wrapping critical operations with breaker.execute() in the calling code
     // This maintains both systems during transition to full CircuitBreaker adoption
   }

  /**
   * Record an error for circuit breaker tracking
   */
  recordError(error: string): void {
    this.recordOperation(true, error);
  }

  /**
   * Check if circuit breaker is tripped
   */
  isCircuitBreakerTripped(): boolean {
    const now = Date.now();
    const recentOps = this.operations.filter(e => now - e.timestamp < 60000);

    // Need at least errorRateWindow operations to check
    if (recentOps.length < this.config.errorRateWindow) {
      return false;
    }

    // Calculate error rate from the last errorRateWindow operations
    const lastWindowOps = recentOps.slice(-this.config.errorRateWindow);
    const errorCount = lastWindowOps.filter(op => op.isError).length;
    const errorRate = errorCount / this.config.errorRateWindow;

    if (errorRate > this.config.errorRateThreshold) {
      logger.error('Circuit breaker tripped', {
        errorRate,
        threshold: this.config.errorRateThreshold,
        errorCount,
        windowSize: this.config.errorRateWindow,
      });
      return true;
    }

    return false;
  }

  /**
   * Activate kill switch - no new orders allowed
   */
  kill(reason?: string): void {
    this.killed = true;
    logger.error('Kill switch activated', { reason });
    
    // Send alert if alerting service is configured
    const alerting = getAlertingService();
    if (alerting) {
      alerting.alertKillSwitch(reason || 'Kill switch manually activated').catch((error) => {
        logger.error('Failed to send kill switch alert', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    
    // Persist state to disk (async, but don't wait - best effort)
    const persistOp = saveKillSwitchState({
      killed: true,
      timestamp: Date.now(),
      reason,
    }).catch((error) => {
      logger.error('Failed to persist kill switch state', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    
    this.pendingPersistenceOps.push(persistOp);
  }

  /**
   * Check if kill switch is active
   */
  isKilled(): boolean {
    return this.killed;
  }

  /**
   * Reset kill switch (for recovery)
   */
  reset(): void {
    this.killed = false;
    this.operations = [];
    
    // Also reset the circuit breaker to allow new operations (Audit Finding A-018)
    this.circuitBreaker.reset();
    
    logger.info('Risk manager reset');
    
    // Clear persisted state (async, but don't wait - best effort)
    const persistOp = clearKillSwitchState().catch((error) => {
      logger.error('Failed to clear kill switch state', {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn('Failed to clear kill switch state; kill switch may remain active on next restart. Manual cleanup of persisted kill switch state may be required.');
    });
    
    this.pendingPersistenceOps.push(persistOp);
  }

  /**
   * Wait for any pending persistence operations to complete
   * Useful for testing to avoid race conditions
   */
  async waitForPersistence(): Promise<void> {
    if (this.pendingPersistenceOps.length > 0) {
      await Promise.all(this.pendingPersistenceOps);
      this.pendingPersistenceOps = [];
    }
  }

  /**
   * Update per-market config (for hot-reload support)
   * GAP-001: Allows updating market config without restarting
   */
  updateMarkets(markets: MarketConfigEntry[] | undefined): void {
    this.config.markets = markets;
    this.markets.clear();
    if (markets) {
      for (const market of markets) {
        if (market.tokenId) {
          this.markets.set(market.tokenId, market);
        }
      }
      logger.info('Updated per-market config', { marketCount: markets.length });
    } else {
      logger.info('Cleared per-market config');
    }
  }

  /**
   * Get current risk metrics including circuit breaker state
   */
  getMetrics(): {
    killed: boolean;
    recentErrors: number;
    circuitBreakerTripped: boolean;
    circuitBreakerState: CircuitState;
    circuitBreakerMetrics: {
      failures: number;
      successes: number;
      consecutiveFailures: number;
      consecutiveSuccesses: number;
    };
  } {
    const recentOps = this.operations.filter(op => Date.now() - op.timestamp < 60000);
    const errorCount = recentOps.filter(op => op.isError).length;
    const breakerMetrics = this.circuitBreaker.getMetrics();

    return {
      killed: this.killed,
      recentErrors: errorCount,
      circuitBreakerTripped: this.isCircuitBreakerTripped(),
      circuitBreakerState: breakerMetrics.state,
      circuitBreakerMetrics: {
        failures: breakerMetrics.failures,
        successes: breakerMetrics.successes,
        consecutiveFailures: breakerMetrics.consecutiveFailures,
        consecutiveSuccesses: breakerMetrics.consecutiveSuccesses,
      },
    };
  }

  /**
   * Get the circuit breaker instance for use in API call wrapping
   * This allows external code to wrap operations with circuit breaker protection
   * 
   * @example
   * ```typescript
   * const result = await riskManager.getCircuitBreaker().execute(async () => {
   *   return await apiClient.placeOrder(order);
   * });
   * ```
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Get the fee rate validator instance for standalone fee rate checks (GAP-019)
   */
  getFeeRateValidator(): FeeRateValidator {
    return this.feeRateValidator;
  }

  /**
   * Clean up resources when shutting down
   */
  destroy(): void {
    this.circuitBreaker.destroy();
  }
}
