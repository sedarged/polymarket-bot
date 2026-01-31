import { Order, Position } from '@polymarket/shared';
import { config } from '../config';
import { logger } from '../utils/logger';

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
  private errors: { timestamp: number; error: string }[] = [];
  private killed = false;

  constructor(config?: Partial<RiskManagerConfig>) {
    this.config = {
      maxExposurePerMarket: config?.maxExposurePerMarket ?? 1000,
      maxOpenOrders: config?.maxOpenOrders ?? 50,
      maxDrawdown: config?.maxDrawdown ?? 0.20,
      errorRateThreshold: config?.errorRateThreshold ?? 0.10,
      errorRateWindow: config?.errorRateWindow ?? 100,
    };

    logger.info('Risk manager initialized', this.config);
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
    const currentSize = currentPosition ? Math.abs(Number(currentPosition.size)) : 0;

    const newSize = side === 'BUY' 
      ? currentSize + orderSize 
      : Math.abs(currentSize - orderSize);

    if (newSize > this.config.maxExposurePerMarket) {
      return {
        allowed: false,
        reason: `Max exposure per market exceeded: ${newSize} > ${this.config.maxExposurePerMarket}`,
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
   * Record an error for circuit breaker tracking
   */
  recordError(error: string): void {
    this.errors.push({
      timestamp: Date.now(),
      error,
    });

    // Keep only recent errors within the window
    const now = Date.now();
    this.errors = this.errors.filter(e => now - e.timestamp < 60000); // Keep last minute

    logger.warn('Error recorded for circuit breaker', {
      error,
      recentErrors: this.errors.length,
    });
  }

  /**
   * Check if circuit breaker is tripped
   */
  isCircuitBreakerTripped(): boolean {
    const now = Date.now();
    const recentErrors = this.errors.filter(e => now - e.timestamp < 60000);

    // If we have enough operations to check
    if (recentErrors.length >= this.config.errorRateWindow * this.config.errorRateThreshold) {
      const errorRate = recentErrors.length / this.config.errorRateWindow;
      if (errorRate >= this.config.errorRateThreshold) {
        logger.error('Circuit breaker tripped', {
          errorRate,
          threshold: this.config.errorRateThreshold,
          recentErrors: recentErrors.length,
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Activate kill switch - no new orders allowed
   */
  kill(): void {
    this.killed = true;
    logger.error('Kill switch activated');
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
    this.errors = [];
    logger.info('Risk manager reset');
  }

  /**
   * Get current risk metrics
   */
  getMetrics(): {
    killed: boolean;
    recentErrors: number;
    circuitBreakerTripped: boolean;
  } {
    return {
      killed: this.killed,
      recentErrors: this.errors.length,
      circuitBreakerTripped: this.isCircuitBreakerTripped(),
    };
  }
}
