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
 * - minPositionSize: Minimum position size when z-score is at entry threshold (default: 10)
 * - entryThreshold: Z-score threshold for entry (default: 2.0)
 * - exitThreshold: Z-score threshold for exit (default: 0.5)
 * - stopLossThreshold: Z-score at which we stop out if price moves further against us (default: 4.0)
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
  minPositionSize?: number;
  entryThreshold?: number;
  exitThreshold?: number;
  stopLossThreshold?: number;
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
      minPositionSize: params.minPositionSize ?? 10,
      entryThreshold: params.entryThreshold ?? 2.0,
      exitThreshold: params.exitThreshold ?? 0.5,
      stopLossThreshold: params.stopLossThreshold ?? 4.0,
      cooldownPeriod: params.cooldownPeriod ?? 60000, // 1 minute
    };

    if (this.params.lookbackPeriod < 5) {
      throw new Error('lookbackPeriod must be at least 5');
    }
    if (this.params.entryThreshold <= this.params.exitThreshold) {
      throw new Error('entryThreshold must be greater than exitThreshold');
    }
    if (this.params.stopLossThreshold <= this.params.entryThreshold) {
      throw new Error('stopLossThreshold must be greater than entryThreshold');
    }
    if (this.params.minPositionSize > this.params.maxPositionSize) {
      throw new Error('minPositionSize must not exceed maxPositionSize');
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
    const history = this.priceHistory.get(context.marketId) ?? [];

    // Need enough history to calculate statistics
    if (history.length < this.params.lookbackPeriod) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: `Building price history: ${history.length}/${this.params.lookbackPeriod}`,
      };
    }

    // Calculate price statistics
    const stats = this.calculatePriceStats(history, context.mid);

    // If we have a position, check exit / stop-loss first
    const currentSize = position?.size ?? 0;
    if (currentSize !== 0) {
      return this.evaluateExit(context, stats, position!);
    }

    // Check cooldown period before entering a new position
    if (!this.canTradeNow(context.marketId)) {
      return {
        action: 'hold',
        confidence: 0.2,
        rationale: 'In cooldown period after last trade',
      };
    }

    // Entry logic: open position if price is far from mean
    return this.evaluateEntry(context, stats);
  }

  /**
   * Evaluate entry conditions.
   * Position size scales proportionally with |z-score| between minPositionSize
   * and maxPositionSize, providing stronger sizing for stronger signals.
   */
  private evaluateEntry(context: MarketContext, stats: PriceStats): TradingDecision {
    const absZScore = Math.abs(stats.zScore);

    // Scale size from minPositionSize (at entryThreshold) to maxPositionSize (at stopLossThreshold)
    const sizeFraction = Math.min(
      1.0,
      (absZScore - this.params.entryThreshold) /
        (this.params.stopLossThreshold - this.params.entryThreshold),
    );
    const scaledSize = Math.round(
      this.params.minPositionSize +
        sizeFraction * (this.params.maxPositionSize - this.params.minPositionSize),
    );

    // Price is overextended above mean — sell (bet it will come down)
    if (stats.zScore > this.params.entryThreshold) {
      return {
        action: 'sell',
        side: 'SELL',
        price: context.bestBid,
        size: scaledSize,
        confidence: Math.min(0.9, 0.5 + (absZScore - this.params.entryThreshold) * 0.1),
        rationale: `Mean reversion entry (SHORT): price ${stats.currentPrice.toFixed(4)} is ${absZScore.toFixed(2)}σ above mean ${stats.mean.toFixed(4)}. Size ${scaledSize} (proportional to z-score). Expecting reversion.`,
        metadata: {
          zScore: stats.zScore,
          mean: stats.mean,
          stdDev: stats.stdDev,
          currentPrice: stats.currentPrice,
          scaledSize,
          strategy: 'mean-reversion-short',
        },
      };
    }

    // Price is overextended below mean — buy (bet it will come up)
    if (stats.zScore < -this.params.entryThreshold) {
      return {
        action: 'buy',
        side: 'BUY',
        price: context.bestAsk,
        size: scaledSize,
        confidence: Math.min(0.9, 0.5 + (absZScore - this.params.entryThreshold) * 0.1),
        rationale: `Mean reversion entry (LONG): price ${stats.currentPrice.toFixed(4)} is ${absZScore.toFixed(2)}σ below mean ${stats.mean.toFixed(4)}. Size ${scaledSize} (proportional to z-score). Expecting reversion.`,
        metadata: {
          zScore: stats.zScore,
          mean: stats.mean,
          stdDev: stats.stdDev,
          currentPrice: stats.currentPrice,
          scaledSize,
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
   * Evaluate exit conditions for an open position.
   * Exits on either:
   *   1. Profit-take: z-score reverts below exitThreshold (mean reversion succeeded)
   *   2. Stop-loss: z-score moves further against position beyond stopLossThreshold
   *      (reversion hypothesis is wrong — cut losses)
   */
  private evaluateExit(
    context: MarketContext,
    stats: PriceStats,
    position: Position,
  ): TradingDecision {
    const absZScore = Math.abs(stats.zScore);
    const isLong = position.size > 0;
    const exitAction = isLong ? 'sell' : 'buy';
    const exitSide = isLong ? 'SELL' : 'BUY';
    const exitPrice = isLong ? context.bestBid : context.bestAsk;

    // Stop-loss: price moved further against us — hypothesis failed
    // Long position hit stop when z-score is now strongly negative (price fell more)
    // Short position hit stop when z-score is now strongly positive (price rose more)
    const stopHit = isLong
      ? stats.zScore < -this.params.stopLossThreshold
      : stats.zScore > this.params.stopLossThreshold;

    if (stopHit) {
      this.lastTradeTime.set(context.marketId, Date.now());
      return {
        action: exitAction,
        side: exitSide,
        price: exitPrice,
        size: Math.abs(position.size),
        confidence: 0.95, // High conviction — protecting capital is paramount
        rationale: `Mean reversion STOP-LOSS: z-score ${stats.zScore.toFixed(2)} exceeded stop threshold ±${this.params.stopLossThreshold}. Price: ${stats.currentPrice.toFixed(4)}, entry was at: ${position.avgPrice.toFixed(4)}. Cutting losses.`,
        metadata: {
          zScore: stats.zScore,
          mean: stats.mean,
          stopLossThreshold: this.params.stopLossThreshold,
          entryPrice: position.avgPrice,
          unrealizedPnl: position.unrealizedPnl,
          strategy: 'mean-reversion-stop-loss',
        },
      };
    }

    // Profit-take: price reverted close enough to mean
    if (absZScore < this.params.exitThreshold) {
      this.lastTradeTime.set(context.marketId, Date.now());
      return {
        action: exitAction,
        side: exitSide,
        price: exitPrice,
        size: Math.abs(position.size),
        confidence: 0.85,
        rationale: `Mean reversion exit (PROFIT): price ${stats.currentPrice.toFixed(4)} reverted to mean ${stats.mean.toFixed(4)} (z-score: ${stats.zScore.toFixed(2)}). Taking profit. PnL: ${position.unrealizedPnl.toFixed(4)}`,
        metadata: {
          zScore: stats.zScore,
          mean: stats.mean,
          entryPrice: position.avgPrice,
          pnl: position.unrealizedPnl,
          strategy: 'mean-reversion-exit',
        },
      };
    }

    // Hold position — waiting for reversion (or stop)
    return {
      action: 'hold',
      confidence: 0.6,
      rationale: `Holding mean reversion position (z-score: ${stats.zScore.toFixed(2)}, profit target: ±${this.params.exitThreshold}, stop: ±${this.params.stopLossThreshold})`,
      metadata: {
        zScore: stats.zScore,
        mean: stats.mean,
        currentPnl: position.unrealizedPnl,
      },
    };
  }

  /**
   * Update price history for a market (rolling window).
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

    // Keep only the lookback window
    if (history.length > this.params.lookbackPeriod) {
      history.shift();
    }
  }

  /**
   * Calculate price statistics (mean, stddev, z-score) for a price history.
   * Uses sample variance (N-1) for an unbiased estimate.
   */
  private calculatePriceStats(history: PricePoint[], currentPrice: number): PriceStats {
    const prices = history.map(p => p.price);
    const n = prices.length;

    // Mean
    const mean = prices.reduce((sum, p) => sum + p, 0) / n;

    // Sample standard deviation (N-1) to avoid bias with small samples
    const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
    const variance = n > 1
      ? squaredDiffs.reduce((sum, d) => sum + d, 0) / (n - 1)
      : 0;
    const stdDev = Math.sqrt(variance);

    // Z-score for the current price
    const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;

    return { mean, stdDev, zScore, currentPrice };
  }

  /**
   * Check if we can trade now (cooldown period after last exit).
   */
  private canTradeNow(marketId: string): boolean {
    const lastTrade = this.lastTradeTime.get(marketId) ?? 0;
    return Date.now() - lastTrade >= this.params.cooldownPeriod;
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    this.priceHistory.clear();
    this.lastTradeTime.clear();
  }
}
