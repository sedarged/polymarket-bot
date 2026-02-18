/**
 * Trend Following Strategy
 * 
 * Simple momentum-based strategy that follows price trends.
 * Buys when price is trending up, sells when trending down.
 * 
 * Parameters:
 * - lookbackPeriod: Number of price updates to consider for trend (default: 10)
 * - trendThreshold: Minimum price change % to consider a trend (default: 0.02 = 2%)
 * - maxPositionSize: Maximum position size (default: 50)
 * - minSpread: Minimum spread to trade (default: 0.01)
 * - stopLoss: Stop loss % (default: 0.05 = 5%)
 * 
 * **WARNING: Simplified for testing. Not production-ready.**
 */

import { BaseStrategy } from './BaseStrategy';
import type { MarketContext, Position, TradingDecision, StrategyConfig } from './types';

interface TrendFollowingParams {
  lookbackPeriod?: number;
  trendThreshold?: number;
  maxPositionSize?: number;
  minSpread?: number;
  stopLoss?: number;
}

interface PricePoint {
  price: number;
  timestamp: string;
}

export class TrendFollowingStrategy extends BaseStrategy {
  private params!: Required<TrendFollowingParams>;
  private priceHistory: Map<string, PricePoint[]> = new Map();

  constructor() {
    super(
      'trend-following-strategy',
      'TrendFollowing',
      '1.0.0',
      'Momentum-based trend following strategy',
    );
  }

  protected async onInitialize(config: StrategyConfig): Promise<void> {
    const params = config.params as TrendFollowingParams;
    
    this.params = {
      lookbackPeriod: params.lookbackPeriod ?? 10,
      trendThreshold: params.trendThreshold ?? 0.02,
      maxPositionSize: params.maxPositionSize ?? 50,
      minSpread: params.minSpread ?? 0.01,
      stopLoss: params.stopLoss ?? 0.05,
    };

    // Validate parameters
    if (this.params.lookbackPeriod < 2) {
      throw new Error('lookbackPeriod must be at least 2');
    }
    if (this.params.trendThreshold < 0) {
      throw new Error('trendThreshold must be non-negative');
    }
    if (this.params.maxPositionSize <= 0) {
      throw new Error('maxPositionSize must be positive');
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
    
    // Need enough history to calculate trend
    if (history.length < this.params.lookbackPeriod) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: `Insufficient price history: ${history.length}/${this.params.lookbackPeriod}`,
      };
    }

    // Calculate trend
    const trend = this.calculateTrend(history);
    const trendDirection = trend > this.params.trendThreshold ? 'up' :
                          trend < -this.params.trendThreshold ? 'down' : 'flat';

    // Check stop loss if we have a position
    if (position && position.size !== 0) {
      const currentPrice = context.mid;
      const pnlPercent = (currentPrice - position.avgPrice) / position.avgPrice;
      
      // Long position with loss
      if (position.size > 0 && pnlPercent < -this.params.stopLoss) {
        return {
          action: 'sell',
          side: 'SELL',
          price: context.bestBid,
          size: Math.abs(position.size),
          confidence: 0.9,
          rationale: `Stop loss triggered: ${(pnlPercent * 100).toFixed(2)}% loss`,
          metadata: { trend, trendDirection, stopLoss: true },
        };
      }
      
      // Short position with loss
      if (position.size < 0 && pnlPercent > this.params.stopLoss) {
        return {
          action: 'buy',
          side: 'BUY',
          price: context.bestAsk,
          size: Math.abs(position.size),
          confidence: 0.9,
          rationale: `Stop loss triggered: ${(pnlPercent * 100).toFixed(2)}% loss`,
          metadata: { trend, trendDirection, stopLoss: true },
        };
      }
    }

    // Trend following logic
    if (trendDirection === 'up') {
      // Uptrend: Buy or add to long position
      const currentSize = position?.size || 0;
      
      if (currentSize < this.params.maxPositionSize) {
        const size = Math.min(10, this.params.maxPositionSize - currentSize);
        
        return {
          action: 'buy',
          side: 'BUY',
          price: context.bestAsk,
          size,
          confidence: Math.min(0.9, 0.5 + Math.abs(trend)),
          rationale: `Uptrend detected: ${(trend * 100).toFixed(2)}% over ${this.params.lookbackPeriod} periods`,
          metadata: { trend, trendDirection },
        };
      }
    } else if (trendDirection === 'down') {
      // Downtrend: Sell or add to short position
      const currentSize = position?.size || 0;
      
      if (currentSize > -this.params.maxPositionSize) {
        const size = Math.min(10, this.params.maxPositionSize + currentSize);
        
        return {
          action: 'sell',
          side: 'SELL',
          price: context.bestBid,
          size,
          confidence: Math.min(0.9, 0.5 + Math.abs(trend)),
          rationale: `Downtrend detected: ${(trend * 100).toFixed(2)}% over ${this.params.lookbackPeriod} periods`,
          metadata: { trend, trendDirection },
        };
      }
    }

    // No clear trend or already at max position
    return {
      action: 'hold',
      confidence: 0.3,
      rationale: `No actionable trend (${(trend * 100).toFixed(2)}%)`,
      metadata: { trend, trendDirection },
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

    // Keep only lookback period + 1 (for calculation)
    if (history.length > this.params.lookbackPeriod) {
      history.shift();
    }
  }

  /**
   * Calculate price trend as percentage change
   * Positive = uptrend, Negative = downtrend
   */
  private calculateTrend(history: PricePoint[]): number {
    if (history.length < 2) {
      return 0;
    }

    const firstPrice = history[0].price;
    const lastPrice = history[history.length - 1].price;
    
    return (lastPrice - firstPrice) / firstPrice;
  }

  /**
   * Clear price history (useful for testing)
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    this.priceHistory.clear();
  }
}
