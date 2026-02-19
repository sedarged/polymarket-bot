import { logger } from '../utils/logger';

/**
 * Result of fee rate validation check
 */
export interface FeeRateCheckResult {
  allowed: boolean;
  reason?: string;
  feeRateBps?: number;
  maxFeeRateBps?: number;
}

/**
 * Fee Rate Validator (GAP-019)
 * 
 * Validates that trading fees do not exceed configured maximum rates.
 * Protects against excessive costs and increases predictability.
 * 
 * Fee rates are expressed in basis points (bps):
 * - 1 bps = 0.01% = 0.0001
 * - 50 bps = 0.5% = 0.005
 * - 100 bps = 1.0% = 0.01
 * 
 * @see {@link ../../../../docs/adr/} for architecture decisions
 */
export class FeeRateValidator {
  private maxFeeRateBps: number;

  constructor(maxFeeRateBps: number) {
    if (!Number.isFinite(maxFeeRateBps)) {
      throw new Error('maxFeeRateBps must be a finite number');
    }
    if (maxFeeRateBps < 0 || maxFeeRateBps > 10000) {
      throw new Error('maxFeeRateBps must be between 0 and 10000 (0% to 100%)');
    }
    this.maxFeeRateBps = maxFeeRateBps;
    
    logger.info('Fee rate validator initialized', {
      maxFeeRateBps,
      maxFeeRatePercent: (maxFeeRateBps / 100).toFixed(2) + '%',
    });
  }

  /**
   * Check if a fee rate is within acceptable limits
   * 
   * @param feeRateBps - Fee rate in basis points (optional, if undefined treats as 0)
   * @param tokenId - Token ID for logging purposes
   * @returns FeeRateCheckResult with allowed status and details
   */
  checkFeeRate(feeRateBps: number | undefined, tokenId?: string): FeeRateCheckResult {
    // Treat undefined or null fee rate as 0 (no fee)
    const actualFeeRateBps = feeRateBps ?? 0;
    
    // Validate fee rate is finite
    if (!Number.isFinite(actualFeeRateBps)) {
      logger.warn('Invalid non-finite fee rate detected', {
        feeRateBps: actualFeeRateBps,
        tokenId,
      });
      return {
        allowed: false,
        reason: `Invalid fee rate: ${actualFeeRateBps} bps (must be a finite number)`,
        feeRateBps: actualFeeRateBps,
        maxFeeRateBps: this.maxFeeRateBps,
      };
    }
    
    // Validate fee rate is non-negative
    if (actualFeeRateBps < 0) {
      logger.warn('Invalid negative fee rate detected', {
        feeRateBps: actualFeeRateBps,
        tokenId,
      });
      return {
        allowed: false,
        reason: `Invalid fee rate: ${actualFeeRateBps} bps (must be non-negative)`,
        feeRateBps: actualFeeRateBps,
        maxFeeRateBps: this.maxFeeRateBps,
      };
    }

    // Check if fee rate exceeds maximum
    if (actualFeeRateBps > this.maxFeeRateBps) {
      logger.warn('Fee rate exceeds maximum', {
        feeRateBps: actualFeeRateBps,
        feeRatePercent: (actualFeeRateBps / 100).toFixed(2) + '%',
        maxFeeRateBps: this.maxFeeRateBps,
        maxFeeRatePercent: (this.maxFeeRateBps / 100).toFixed(2) + '%',
        tokenId,
        category: 'orderFlow',
      });
      
      return {
        allowed: false,
        reason: `Fee rate ${actualFeeRateBps} bps (${(actualFeeRateBps / 100).toFixed(2)}%) exceeds maximum ${this.maxFeeRateBps} bps (${(this.maxFeeRateBps / 100).toFixed(2)}%)`,
        feeRateBps: actualFeeRateBps,
        maxFeeRateBps: this.maxFeeRateBps,
      };
    }

    // Fee rate is acceptable
    return {
      allowed: true,
      feeRateBps: actualFeeRateBps,
      maxFeeRateBps: this.maxFeeRateBps,
    };
  }

  /**
   * Get the current maximum fee rate in basis points
   */
  getMaxFeeRateBps(): number {
    return this.maxFeeRateBps;
  }

  /**
   * Update the maximum fee rate (for dynamic configuration)
   * 
   * @param newMaxFeeRateBps - New maximum fee rate in basis points
   */
  setMaxFeeRateBps(newMaxFeeRateBps: number): void {
    if (!Number.isFinite(newMaxFeeRateBps)) {
      throw new Error('maxFeeRateBps must be a finite number');
    }
    if (newMaxFeeRateBps < 0 || newMaxFeeRateBps > 10000) {
      throw new Error('maxFeeRateBps must be between 0 and 10000 (0% to 100%)');
    }
    
    const oldMax = this.maxFeeRateBps;
    this.maxFeeRateBps = newMaxFeeRateBps;
    
    logger.info('Fee rate validator configuration updated', {
      oldMaxFeeRateBps: oldMax,
      newMaxFeeRateBps,
      newMaxFeeRatePercent: (newMaxFeeRateBps / 100).toFixed(2) + '%',
    });
  }
}
