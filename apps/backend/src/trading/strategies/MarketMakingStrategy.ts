/**
 * Market Making Strategy
 *
 * Places bids and asks around the mid price, capturing the spread while
 * managing inventory. Suitable for Polymarket paper trading.
 *
 * Improvements over the original simplified version:
 * - Inventory skew sign is now correct (lowers ask when long, raises bid when short)
 * - Dynamic spread widens proportionally to recent price volatility
 * - State-based quoting replaces timestamp-based alternation
 *
 * Parameters:
 * - spreadBps: Base target spread in basis points (default: 100 = 1%)
 * - orderSize: Size for each order (default: 10)
 * - maxInventory: Maximum inventory position (default: 100)
 * - inventorySkew: Adjust quotes based on inventory (default: true)
 * - minSpread: Minimum market spread to quote (default: 0.005)
 * - volatilityWindow: Number of mid-price samples for volatility calc (default: 20)
 * - volatilityMultiplier: Spread widening factor per unit of stddev (default: 2.0)
 */

import { BaseStrategy } from './BaseStrategy';
import { logger } from '../../utils/logger';
import type { MarketContext, Position, TradingDecision, StrategyConfig } from './types';

interface MarketMakingParams {
  spreadBps?: number;
  orderSize?: number;
  maxInventory?: number;
  inventorySkew?: boolean;
  minSpread?: number;
  volatilityWindow?: number;
  volatilityMultiplier?: number;
}

export class MarketMakingStrategy extends BaseStrategy {
  private params!: Required<MarketMakingParams>;
  /** Track which side we quoted last to alternate in balanced state */
  private lastQuoteSide: Map<string, 'buy' | 'sell'> = new Map();
  /** Rolling mid-price history per market for volatility estimation */
  private midHistory: Map<string, number[]> = new Map();

  constructor() {
    super(
      'market-making-strategy',
      'MarketMaking',
      '1.0.0',
      'Market making strategy with inventory skew and volatility-adaptive spread',
    );
  }

  protected async onInitialize(config: StrategyConfig): Promise<void> {
    const params = config.params as MarketMakingParams;

    this.params = {
      spreadBps: params.spreadBps ?? 100,
      orderSize: params.orderSize ?? 10,
      maxInventory: params.maxInventory ?? 100,
      inventorySkew: params.inventorySkew ?? true,
      minSpread: params.minSpread ?? 0.005,
      volatilityWindow: params.volatilityWindow ?? 20,
      volatilityMultiplier: params.volatilityMultiplier ?? 2.0,
    };

    if (this.params.spreadBps <= 0) {
      throw new Error('spreadBps must be positive');
    }
    if (this.params.orderSize <= 0) {
      throw new Error('orderSize must be positive');
    }
    if (this.params.maxInventory <= 0) {
      throw new Error('maxInventory must be positive');
    }
    if (this.params.volatilityWindow < 5) {
      throw new Error('volatilityWindow must be at least 5');
    }
  }

  protected async onEvaluate(
    context: MarketContext,
    position?: Position,
  ): Promise<TradingDecision> {
    // Update mid-price history for volatility tracking
    this.updateMidHistory(context);

    // Check if market spread is acceptable
    if (context.spread < this.params.minSpread) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: `Market spread too tight: ${context.spread.toFixed(4)}`,
      };
    }

    const currentInventory = position?.size ?? 0;
    const inventoryRatio = currentInventory / this.params.maxInventory;

    // Calculate dynamic spread (widens with volatility)
    const dynamicSpread = this.computeDynamicSpread(context.marketId);

    // At max inventory — only quote on the reducing side
    if (Math.abs(currentInventory) >= this.params.maxInventory) {
      if (currentInventory > 0) {
        return this.createSellQuote(context, inventoryRatio, dynamicSpread);
      } else {
        return this.createBuyQuote(context, inventoryRatio, dynamicSpread);
      }
    }

    // Skew toward inventory-reducing side when significantly imbalanced
    if (this.params.inventorySkew) {
      if (inventoryRatio > 0.5) {
        return this.createSellQuote(context, inventoryRatio, dynamicSpread);
      } else if (inventoryRatio < -0.5) {
        return this.createBuyQuote(context, inventoryRatio, dynamicSpread);
      }
    }

    // Balanced inventory: alternate quote side using state (not timestamp)
    const lastSide = this.lastQuoteSide.get(context.marketId);
    if (lastSide !== 'buy') {
      this.lastQuoteSide.set(context.marketId, 'buy');
      return this.createBuyQuote(context, inventoryRatio, dynamicSpread);
    } else {
      this.lastQuoteSide.set(context.marketId, 'sell');
      return this.createSellQuote(context, inventoryRatio, dynamicSpread);
    }
  }

  /**
   * Maintain a rolling window of mid prices for volatility estimation.
   */
  private updateMidHistory(context: MarketContext): void {
    let history = this.midHistory.get(context.marketId);
    if (!history) {
      history = [];
      this.midHistory.set(context.marketId, history);
    }
    history.push(context.mid);
    if (history.length > this.params.volatilityWindow) {
      history.shift();
    }
  }

  /**
   * Compute a volatility-adjusted spread.
   * When price moves are larger, the spread widens to compensate for adverse selection.
   * Returns the spread as a decimal fraction (e.g. 0.01 = 1%).
   */
  private computeDynamicSpread(marketId: string): number {
    const baseSpread = this.params.spreadBps / 10000;
    const history = this.midHistory.get(marketId);

    if (!history || history.length < 5) {
      return baseSpread; // Not enough data — use base spread
    }

    // Compute returns (price changes) to estimate volatility
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      if (history[i - 1] > 0) {
        returns.push(history[i] - history[i - 1]);
      }
    }

    if (returns.length === 0) return baseSpread;

    const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Widen spread proportionally to volatility
    const dynamicSpread = baseSpread + this.params.volatilityMultiplier * stdDev;

    // Cap at 10% to avoid absurd spreads in very volatile markets
    return Math.min(0.10, dynamicSpread);
  }

  /**
   * Create a buy quote (bid).
   * When inventory is positive (long), lower the bid to avoid adding to a long position.
   * When inventory is negative (short), raise the bid to reduce the short.
   */
  private createBuyQuote(
    context: MarketContext,
    inventoryRatio: number,
    dynamicSpread: number,
  ): TradingDecision {
    // skewFactor: negative when long (lower bid), positive when short (raise bid)
    const skewFactor = this.params.inventorySkew
      ? -inventoryRatio * (dynamicSpread / 2)
      : 0;

    const bidPrice = context.mid - (dynamicSpread / 2) + skewFactor;
    const finalPrice = Math.max(0.01, Math.min(0.99, bidPrice));

    if (finalPrice !== bidPrice) {
      logger.warn('Market making bid price clamped', {
        strategyId: this.id,
        marketId: context.marketId,
        originalPrice: bidPrice,
        clampedPrice: finalPrice,
        mid: context.mid,
        inventoryRatio,
      });
    }

    return {
      action: 'buy',
      side: 'BUY',
      price: finalPrice,
      size: this.params.orderSize,
      confidence: 0.6 - Math.abs(inventoryRatio) * 0.2,
      rationale: `Market making bid at ${finalPrice.toFixed(4)} (mid: ${context.mid.toFixed(4)}, spread: ${(dynamicSpread * 10000).toFixed(0)} bps, inv: ${inventoryRatio.toFixed(2)})`,
      metadata: {
        mid: context.mid,
        spread: context.spread,
        dynamicSpreadBps: Math.round(dynamicSpread * 10000),
        inventoryRatio,
        skewFactor,
      },
    };
  }

  /**
   * Create a sell quote (offer/ask).
   * When inventory is positive (long), lower the ask to offload inventory faster.
   * When inventory is negative (short), raise the ask to avoid selling more.
   *
   * NOTE: skewFactor uses -inventoryRatio here (correct direction):
   *   long (ratio > 0)  → skewFactor < 0 → ask moves DOWN → sell more aggressively ✓
   *   short (ratio < 0) → skewFactor > 0 → ask moves UP   → avoid further selling ✓
   */
  private createSellQuote(
    context: MarketContext,
    inventoryRatio: number,
    dynamicSpread: number,
  ): TradingDecision {
    // skewFactor: negative when long (lower ask), positive when short (raise ask)
    const skewFactor = this.params.inventorySkew
      ? -inventoryRatio * (dynamicSpread / 2)
      : 0;

    const askPrice = context.mid + (dynamicSpread / 2) + skewFactor;
    const finalPrice = Math.max(0.01, Math.min(0.99, askPrice));

    if (finalPrice !== askPrice) {
      logger.warn('Market making ask price clamped', {
        strategyId: this.id,
        marketId: context.marketId,
        originalPrice: askPrice,
        clampedPrice: finalPrice,
        mid: context.mid,
        inventoryRatio,
      });
    }

    return {
      action: 'sell',
      side: 'SELL',
      price: finalPrice,
      size: this.params.orderSize,
      confidence: 0.6 - Math.abs(inventoryRatio) * 0.2,
      rationale: `Market making offer at ${finalPrice.toFixed(4)} (mid: ${context.mid.toFixed(4)}, spread: ${(dynamicSpread * 10000).toFixed(0)} bps, inv: ${inventoryRatio.toFixed(2)})`,
      metadata: {
        mid: context.mid,
        spread: context.spread,
        dynamicSpreadBps: Math.round(dynamicSpread * 10000),
        inventoryRatio,
        skewFactor,
      },
    };
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    this.lastQuoteSide.clear();
    this.midHistory.clear();
  }
}
