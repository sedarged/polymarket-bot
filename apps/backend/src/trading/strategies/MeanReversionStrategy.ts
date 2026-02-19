/**
 * Mean Reversion Strategy
 * 
 * Prediction markets often overreact to news, creating mean-reversion opportunities.
 * This strategy identifies when prices deviate too far from historical averages
 * and bets on a return to equilibrium.
 * 
 * Key Concepts for Polymarket:
 * - Markets overreact to breaking news (e.g., election polls)
 * - Prices often revert after initial knee-jerk reactions
 * - Look for excessive moves beyond statistical norms
 * 
 * Parameters:
 * - lookbackPeriod: Number of price updates for mean calculation (default: 20)
 * - minSpread: Minimum spread to trade (default: 0.01)
 * - maxPositionSize: Maximum position size (default: 50)
 * - entryThreshold: Z-score threshold for entry (default: 2.0)
 * - exitThreshold: Z-score threshold for exit (default: 0.5)
 * - cooldownPeriod: Minimum time between trades (ms) (default: 60000 = 1 min)
 * 
 * **Suitable for prediction markets with volatile news cycles.**
 */

import { BaseStrategy } from './BaseStrategy';
import type { MarketContext, Position, TradingDecision, StrategyConfig } from './types';

interface MeanReversionParams {
  lookbackPeriod?: number;
  minSpread?: number;
  maxPositionSize?: number;
  entryThreshold?: number;
  exitThreshold?: number;
  cooldownPeriod?: number;
}

type RequiredMeanReversionParams = Required<MeanReversionParams>;

interface PriceStats {
  mean: number;
  stdDev: number;
  zScore: number;
  currentPrice: number;
}

interface PricePoint {
  price: number;
  timestamp: string;
}

export class MeanReversionStrategy extends BaseStrategy {
  private params!: RequiredMeanReversionParams;
  private priceHistory: Map<string, PricePoint[]> = new Map();
  private lastTradeTime: Map<string, number> = new Map();

  constructor() {
    super(
      'mean-reversion-strategy',
      'MeanReversion',
      '1.0.0',
      'Mean reversion strategy for prediction markets with overreactions',
    );
  }

  protected async onInitialize(config: StrategyConfig): Promise<void> {
    const params = config.params as MeanReversionParams;
    
    this.params = {
      lookbackPeriod: params.lookbackPeriod ?? 20,
      minSpread: params.minSpread ?? 0.01,
      maxPositionSize: params.maxPositionSize ?? 50,
      entryThreshold: params.entryThreshold ?? 2.0,
      exitThreshold: params.exitThreshold ?? 0.5,
      cooldownPeriod: params.cooldownPeriod ?? 60000, // 1 minute
    };

    // Validate parameters
    if (this.params.lookbackPeriod < 5) {
      throw new Error('lookbackPeriod must be at least 5');
    }
    if (this.params.entryThreshold <= this.params.exitThreshold) {
      throw new Error('entryThreshold must be greater than exitThreshold');
    }
  }

  protected async onEvaluate(
    context: MarketContext,
    position?: Position,
  ): Promise<TradingDecision> {
    // Update price history
    this.updatePriceHistory(context);

    // Check spread
    if (context.spread < this.params.minSpread) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: `Spread too tight: ${context.spread.toFixed(4)}`,
      };
    }

    // Get price history for this market
    const history = this.priceHistory.get(context.marketId) || [];
    
    // Need enough history to calculate statistics
    if (history.length < this.params.lookbackPeriod) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: `Building price history: ${history.length}/${this.params.lookbackPeriod}`,
      };
    }

    // Check cooldown period
    if (!this.canTradeNow(context.marketId)) {
      return {
        action: 'hold',
        confidence: 0.2,
        rationale: 'In cooldown period after last trade',
      };
    }

    // Calculate price statistics
    const stats = this.calculatePriceStats(history, context.mid);

    // Check if we have an existing position
    const currentSize = position?.size || 0;

    // Exit logic: Close position if price reverted to mean
    if (currentSize !== 0) {
      return this.evaluateExit(context, stats, position!);
    }

    // Entry logic: Open position if price is far from mean
    return this.evaluateEntry(context, stats);
  }

  /**
   * Evaluate entry conditions
   */
  private evaluateEntry(context: MarketContext, stats: PriceStats): TradingDecision {
    const absZScore = Math.abs(stats.zScore);

    // Price is overextended above mean - sell (bet it will come down)
    if (stats.zScore > this.params.entryThreshold) {
      return {
        action: 'sell',
        side: 'SELL',
        price: context.bestBid,
        size: this.params.maxPositionSize,
        confidence: Math.min(0.9, 0.5 + (absZScore - this.params.entryThreshold) * 0.1),
        rationale: `Mean reversion entry: Price ${stats.currentPrice.toFixed(4)} is ${absZScore.toFixed(2)} std devs above mean ${stats.mean.toFixed(4)}. Expecting reversion.`,
        metadata: {
          zScore: stats.zScore,
          mean: stats.mean,
          stdDev: stats.stdDev,
          currentPrice: stats.currentPrice,
          strategy: 'mean-reversion-short',
        },
      };
    }

    // Price is overextended below mean - buy (bet it will come up)
    if (stats.zScore < -this.params.entryThreshold) {
      return {
        action: 'buy',
        side: 'BUY',
        price: context.bestAsk,
        size: this.params.maxPositionSize,
        confidence: Math.min(0.9, 0.5 + (absZScore - this.params.entryThreshold) * 0.1),
        rationale: `Mean reversion entry: Price ${stats.currentPrice.toFixed(4)} is ${absZScore.toFixed(2)} std devs below mean ${stats.mean.toFixed(4)}. Expecting reversion.`,
        metadata: {
          zScore: stats.zScore,
          mean: stats.mean,
          stdDev: stats.stdDev,
          currentPrice: stats.currentPrice,
          strategy: 'mean-reversion-long',
        },
      };
    }

    // Price is within normal range
    return {
      action: 'hold',
      confidence: 0.3,
      rationale: `Price within normal range (z-score: ${stats.zScore.toFixed(2)})`,
      metadata: {
        zScore: stats.zScore,
        mean: stats.mean,
        stdDev: stats.stdDev,
      },
    };
  }

  /**
   * Evaluate exit conditions
   */
  private evaluateExit(
    context: MarketContext,
    stats: PriceStats,
    position: Position,
  ): TradingDecision {
    const absZScore = Math.abs(stats.zScore);

    // Exit when price has reverted close enough to mean
    if (absZScore < this.params.exitThreshold) {
      const action = position.size > 0 ? 'sell' : 'buy';
      const side = position.size > 0 ? 'SELL' : 'BUY';
      const price = position.size > 0 ? context.bestBid : context.bestAsk;

      // Record trade time for cooldown
      this.lastTradeTime.set(context.marketId, Date.now());

      return {
        action,
        side,
        price,
        size: Math.abs(position.size),
        confidence: 0.85,
        rationale: `Mean reversion exit: Price ${stats.currentPrice.toFixed(4)} reverted to mean ${stats.mean.toFixed(4)} (z-score: ${stats.zScore.toFixed(2)}). Taking profit.`,
        metadata: {
          zScore: stats.zScore,
          mean: stats.mean,
          entryPrice: position.avgPrice,
          pnl: position.unrealizedPnl,
          strategy: 'mean-reversion-exit',
        },
      };
    }

    // Hold position - waiting for reversion
    return {
      action: 'hold',
      confidence: 0.6,
      rationale: `Holding mean reversion position (z-score: ${stats.zScore.toFixed(2)}, target: ${this.params.exitThreshold})`,
      metadata: {
        zScore: stats.zScore,
        mean: stats.mean,
        currentPnl: position.unrealizedPnl,
      },
    };
  }

  /**
   * Update price history for a market
   */
  private updatePriceHistory(context: MarketContext): void {
    let history = this.priceHistory.get(context.marketId);
    
    if (!history) {
      history = [];
      this.priceHistory.set(context.marketId, history);
    }

    history.push({
      price: context.mid,
      timestamp: context.timestamp,
    });

    // Keep only lookback period
    if (history.length > this.params.lookbackPeriod) {
      history.shift();
    }
  }

  /**
   * Calculate price statistics (mean, std dev, z-score)
   */
  private calculatePriceStats(history: PricePoint[], currentPrice: number): PriceStats {
    // Calculate mean
    const prices = history.map(p => p.price);
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // Calculate standard deviation
    const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / prices.length;
    const stdDev = Math.sqrt(variance);

    // Calculate z-score for current price
    const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;

    return {
      mean,
      stdDev,
      zScore,
      currentPrice,
    };
  }

  /**
   * Check if we can trade now (cooldown period check)
   */
  private canTradeNow(marketId: string): boolean {
    const lastTrade = this.lastTradeTime.get(marketId) || 0;
    const timeSinceLastTrade = Date.now() - lastTrade;
    return timeSinceLastTrade >= this.params.cooldownPeriod;
  }

  /**
   * Clear all tracking data
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    this.priceHistory.clear();
    this.lastTradeTime.clear();
  }
}
