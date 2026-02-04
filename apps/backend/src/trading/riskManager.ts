import { Order, Position } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { saveKillSwitchState, loadKillSwitchState, clearKillSwitchState } from '../utils/statePersistence';

export interface RiskManagerConfig {
  maxExposurePerMarket: number;
  maxOpenOrders: number;
  maxDrawdown: number;
  errorRateThreshold: number;
  errorRateWindow: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Risk Manager with circuit breakers
 * - Max exposure per market
 * - Max open orders
 * - Max drawdown
 * - Error rate circuit breaker
 */
export class RiskManager {
  private config: RiskManagerConfig;
  private operations: { timestamp: number; isError: boolean }[] = [];
  private killed = false;
  private pendingPersistenceOps: Promise<void>[] = [];

  constructor(config?: Partial<RiskManagerConfig>) {
    this.config = {
      maxExposurePerMarket: config?.maxExposurePerMarket ?? 1000,
      maxOpenOrders: config?.maxOpenOrders ?? 50,
      maxDrawdown: config?.maxDrawdown ?? 0.20,
      errorRateThreshold: config?.errorRateThreshold ?? 0.10,
      errorRateWindow: config?.errorRateWindow ?? 100,
    };

    logger.info('Risk manager initialized', {
      maxExposurePerMarket: this.config.maxExposurePerMarket,
      maxOpenOrders: this.config.maxOpenOrders,
      maxDrawdown: this.config.maxDrawdown,
      errorRateThreshold: this.config.errorRateThreshold,
      errorRateWindow: this.config.errorRateWindow,
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
    positions: Position[]
  ): RiskCheckResult {
    // Check if killed
    if (this.killed) {
      return {
        allowed: false,
        reason: 'Trading is killed by risk manager',
      };
    }

    // Check error rate circuit breaker
    if (this.isCircuitBreakerTripped()) {
      return {
        allowed: false,
        reason: 'Circuit breaker tripped: error rate too high',
      };
    }

    // Check max open orders
    const openOrders = orders.filter(o => o.status === 'OPEN');
    if (openOrders.length >= this.config.maxOpenOrders) {
      return {
        allowed: false,
        reason: `Max open orders limit reached: ${this.config.maxOpenOrders}`,
      };
    }

    // Check max exposure per market
    const orderSize = Number(size);
    const currentPosition = positions.find(p => p.tokenId === tokenId);
    const currentSignedSize = currentPosition ? Number(currentPosition.size) : 0;
    
    // Calculate new signed position size (positive = long, negative = short)
    const newSignedSize = currentSignedSize + (side === 'BUY' ? orderSize : -orderSize);
    const newExposure = Math.abs(newSignedSize);

    if (newExposure > this.config.maxExposurePerMarket) {
      return {
        allowed: false,
        reason: `Max exposure per market exceeded: ${newExposure} > ${this.config.maxExposurePerMarket}`,
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
   * Record an operation (success or error) for circuit breaker tracking
   */
  recordOperation(isError: boolean, errorMessage?: string): void {
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
   * Get current risk metrics
   */
  getMetrics(): {
    killed: boolean;
    recentErrors: number;
    circuitBreakerTripped: boolean;
  } {
    const recentOps = this.operations.filter(op => Date.now() - op.timestamp < 60000);
    const errorCount = recentOps.filter(op => op.isError).length;

    return {
      killed: this.killed,
      recentErrors: errorCount,
      circuitBreakerTripped: this.isCircuitBreakerTripped(),
    };
  }
}
