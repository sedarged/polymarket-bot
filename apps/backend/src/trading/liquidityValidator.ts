import { logger } from '../utils/logger';
import { Orderbook, OrderbookLevel } from '@polymarket/shared';

/**
 * Result of liquidity validation check
 */
export interface LiquidityCheckResult {
  allowed: boolean;
  reason?: string;
  availableLiquidity?: string;
  requiredLiquidity?: string;
  bestPrice?: string;
}

/**
 * Configuration for liquidity validation
 */
export interface LiquidityValidatorConfig {
  /**
   * Minimum liquidity threshold as a multiplier of order size.
   * For example, 1.0 means order size must be <= available liquidity,
   * 1.5 means available liquidity must be at least 1.5x the order size.
   * Default: 1.0 (order size must not exceed available liquidity)
   */
  minLiquidityMultiplier?: number;

  /**
   * Maximum price levels to check in the orderbook.
   * For example, 5 means check liquidity across top 5 price levels.
   * Default: 10
   */
  maxPriceLevels?: number;

  /**
   * Maximum age of orderbook data in milliseconds.
   * If orderbook is older than this, it's considered stale.
   * Default: 5000 (5 seconds)
   */
  maxOrderbookAgeMs?: number;
}

const DEFAULT_MIN_LIQUIDITY_MULTIPLIER = 1.0;
const DEFAULT_MAX_PRICE_LEVELS = 10;
const DEFAULT_MAX_ORDERBOOK_AGE_MS = 5000;

/**
 * Liquidity Validator (GAP-014)
 * 
 * Validates that sufficient market liquidity exists before placing orders.
 * This prevents failed or partial executions and improves average fill quality.
 * 
 * Features:
 * - Pre-trade liquidity checks against live orderbook data
 * - Configurable liquidity thresholds
 * - Depth analysis across multiple price levels
 * - Stale data detection and safe failure
 * - Integration with orderbook cache
 * 
 * Liquidity Calculation:
 * - For BUY orders: Checks available size on the ASK side (sellers)
 * - For SELL orders: Checks available size on the BID side (buyers)
 * - Accumulates liquidity across multiple price levels up to maxPriceLevels
 * - Compares against minLiquidityMultiplier * orderSize threshold
 * 
 * Safety:
 * - Rejects orders when orderbook data is missing
 * - Rejects orders when orderbook data is stale
 * - Provides clear rejection reasons for debugging
 * - Logs all validation decisions for audit trail
 * 
 * @see {@link ../../../../REPORTS/GAP_ANALYSIS.md} - GAP-014
 * @see {@link ../../../../docs/adr/} for architecture decisions
 */
export class LiquidityValidator {
  private minLiquidityMultiplier: number;
  private maxPriceLevels: number;
  private maxOrderbookAgeMs: number;

  constructor(config: LiquidityValidatorConfig = {}) {
    this.minLiquidityMultiplier = config.minLiquidityMultiplier ?? DEFAULT_MIN_LIQUIDITY_MULTIPLIER;
    this.maxPriceLevels = config.maxPriceLevels ?? DEFAULT_MAX_PRICE_LEVELS;
    this.maxOrderbookAgeMs = config.maxOrderbookAgeMs ?? DEFAULT_MAX_ORDERBOOK_AGE_MS;

    // Validate configuration
    if (!Number.isFinite(this.minLiquidityMultiplier) || this.minLiquidityMultiplier <= 0) {
      throw new Error('minLiquidityMultiplier must be a positive finite number');
    }
    if (!Number.isFinite(this.maxPriceLevels) || this.maxPriceLevels < 1) {
      throw new Error('maxPriceLevels must be a positive finite number >= 1');
    }
    if (!Number.isFinite(this.maxOrderbookAgeMs) || this.maxOrderbookAgeMs <= 0) {
      throw new Error('maxOrderbookAgeMs must be a positive finite number');
    }

    logger.info('Liquidity validator initialized', {
      minLiquidityMultiplier: this.minLiquidityMultiplier,
      maxPriceLevels: this.maxPriceLevels,
      maxOrderbookAgeMs: this.maxOrderbookAgeMs,
      gap: 'GAP-014',
    });
  }

  /**
   * Check if sufficient liquidity exists for an order
   * 
   * @param tokenId - Token ID for the order
   * @param side - Order side (BUY or SELL)
   * @param size - Order size (in decimal string format)
   * @param orderbook - Current orderbook snapshot (optional, null if missing)
   * @param orderbookTimestamp - Timestamp when orderbook was captured
   * @returns LiquidityCheckResult with allowed status and details
   */
  checkLiquidity(
    tokenId: string,
    side: 'BUY' | 'SELL',
    size: string,
    orderbook: Orderbook | null,
    orderbookTimestamp?: number
  ): LiquidityCheckResult {
    // Validate inputs
    if (!tokenId || tokenId.trim().length === 0) {
      return {
        allowed: false,
        reason: 'Invalid tokenId: must be non-empty string',
      };
    }

    const orderSize = parseFloat(size);
    if (!Number.isFinite(orderSize) || orderSize <= 0) {
      return {
        allowed: false,
        reason: `Invalid order size: ${size} (must be positive finite number)`,
      };
    }

    // Check if orderbook data is missing
    if (!orderbook) {
      logger.warn('Orderbook data missing for liquidity check', {
        tokenId,
        side,
        size,
        gap: 'GAP-014',
        category: 'orderFlow',
      });
      return {
        allowed: false,
        reason: 'Orderbook data missing - cannot validate liquidity',
      };
    }

    // Check if orderbook data is stale
    // Use provided timestamp, fall back to orderbook.timestamp, then skip check if neither available
    const now = Date.now();
    const effectiveTimestamp =
      orderbookTimestamp !== undefined
        ? orderbookTimestamp
        : orderbook.timestamp !== undefined
          ? orderbook.timestamp
          : undefined;

    if (effectiveTimestamp !== undefined) {
      const dataAge = now - effectiveTimestamp;
      if (dataAge > this.maxOrderbookAgeMs) {
        logger.warn('Orderbook data is stale', {
          tokenId,
          side,
          size,
          dataAgeMs: dataAge,
          maxAgeMs: this.maxOrderbookAgeMs,
          gap: 'GAP-014',
          category: 'orderFlow',
        });
        return {
          allowed: false,
          reason: `Orderbook data is stale (${dataAge}ms old, max ${this.maxOrderbookAgeMs}ms)`,
        };
      }
    }

    // Select the correct side of the book to check
    // For BUY orders, we need liquidity on the ASK side (sellers)
    // For SELL orders, we need liquidity on the BID side (buyers)
    const levels: OrderbookLevel[] = side === 'BUY' ? orderbook.asks : orderbook.bids;

    // Check if the book side is empty
    if (!levels || levels.length === 0) {
      logger.warn('Orderbook side is empty', {
        tokenId,
        side,
        size,
        bookSide: side === 'BUY' ? 'asks' : 'bids',
        gap: 'GAP-014',
        category: 'orderFlow',
      });
      return {
        allowed: false,
        reason: `No liquidity available on ${side === 'BUY' ? 'ask' : 'bid'} side`,
      };
    }

    // Calculate available liquidity across price levels
    const availableLiquidity = this.calculateAvailableLiquidity(levels);
    const requiredLiquidity = orderSize * this.minLiquidityMultiplier;

    // Get best price for logging
    const bestPrice = levels[0]?.price;

    // Check if sufficient liquidity exists
    if (availableLiquidity < requiredLiquidity) {
      logger.warn('Insufficient liquidity for order', {
        tokenId,
        side,
        orderSize,
        availableLiquidity,
        requiredLiquidity,
        minLiquidityMultiplier: this.minLiquidityMultiplier,
        bestPrice,
        levelsChecked: Math.min(levels.length, this.maxPriceLevels),
        gap: 'GAP-014',
        category: 'orderFlow',
      });

      return {
        allowed: false,
        reason: `Insufficient liquidity: ${availableLiquidity.toFixed(6)} available, ${requiredLiquidity.toFixed(6)} required (${this.minLiquidityMultiplier}x order size)`,
        availableLiquidity: availableLiquidity.toString(),
        requiredLiquidity: requiredLiquidity.toString(),
        bestPrice,
      };
    }

    // Sufficient liquidity exists
    logger.debug('Liquidity check passed', {
      tokenId,
      side,
      orderSize,
      availableLiquidity,
      requiredLiquidity,
      bestPrice,
      levelsChecked: Math.min(levels.length, this.maxPriceLevels),
      gap: 'GAP-014',
    });

    return {
      allowed: true,
      availableLiquidity: availableLiquidity.toString(),
      requiredLiquidity: requiredLiquidity.toString(),
      bestPrice,
    };
  }

  /**
   * Calculate total available liquidity across price levels
   * 
   * @param levels - Price levels from orderbook (bids or asks)
   * @returns Total available size across levels (up to maxPriceLevels)
   */
  private calculateAvailableLiquidity(levels: OrderbookLevel[]): number {
    let totalLiquidity = 0;
    const levelsToCheck = Math.min(levels.length, this.maxPriceLevels);

    for (let i = 0; i < levelsToCheck; i++) {
      const level = levels[i];
      const levelSize = parseFloat(level.size);
      
      if (Number.isFinite(levelSize) && levelSize > 0) {
        totalLiquidity += levelSize;
      }
    }

    return totalLiquidity;
  }

  /**
   * Get current configuration
   */
  getConfig(): LiquidityValidatorConfig {
    return {
      minLiquidityMultiplier: this.minLiquidityMultiplier,
      maxPriceLevels: this.maxPriceLevels,
      maxOrderbookAgeMs: this.maxOrderbookAgeMs,
    };
  }

  /**
   * Update configuration (for dynamic adjustment)
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<LiquidityValidatorConfig>): void {
    if (config.minLiquidityMultiplier !== undefined) {
      if (!Number.isFinite(config.minLiquidityMultiplier) || config.minLiquidityMultiplier <= 0) {
        throw new Error('minLiquidityMultiplier must be a positive finite number');
      }
      this.minLiquidityMultiplier = config.minLiquidityMultiplier;
    }

    if (config.maxPriceLevels !== undefined) {
      if (!Number.isFinite(config.maxPriceLevels) || config.maxPriceLevels < 1) {
        throw new Error('maxPriceLevels must be a positive finite number >= 1');
      }
      this.maxPriceLevels = config.maxPriceLevels;
    }

    if (config.maxOrderbookAgeMs !== undefined) {
      if (!Number.isFinite(config.maxOrderbookAgeMs) || config.maxOrderbookAgeMs <= 0) {
        throw new Error('maxOrderbookAgeMs must be a positive finite number');
      }
      this.maxOrderbookAgeMs = config.maxOrderbookAgeMs;
    }

    logger.info('Liquidity validator configuration updated', {
      minLiquidityMultiplier: this.minLiquidityMultiplier,
      maxPriceLevels: this.maxPriceLevels,
      maxOrderbookAgeMs: this.maxOrderbookAgeMs,
      gap: 'GAP-014',
    });
  }
}
