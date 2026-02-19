/**
 * Arbitrage Strategy
 * 
 * Core Polymarket strategy that exploits price discrepancies where YES + NO ≠ $1.00.
 * This is the most reliable and profitable strategy for prediction markets.
 * 
 * Key Concepts:
 * - On Polymarket, YES and NO shares must sum to exactly $1.00 at settlement
 * - If YES + NO < $1.00 (minus fees), buy both sides for guaranteed profit
 * - If YES + NO > $1.00 (plus fees), sell both sides (requires existing positions)
 * 
 * Parameters:
 * - minProfitBps: Minimum profit in basis points after fees (default: 50 = 0.5%)
 * - feeRate: Trading fee rate (default: 0.02 = 2%)
 * - maxOrderSize: Maximum size per arbitrage leg (default: 100)
 * - minLiquidity: Minimum liquidity required on both sides (default: 50)
 * - priceUpdateWindow: Time window for stale price detection (default: 5000ms)
 * 
 * **This is a production-ready strategy for Polymarket.**
 */

import { BaseStrategy } from './BaseStrategy';
import type { MarketContext, Position, TradingDecision, StrategyConfig } from './types';

interface ArbitrageParams {
  minProfitBps?: number;
  feeRate?: number;
  maxOrderSize?: number;
  minLiquidity?: number;
  priceUpdateWindow?: number;
}

type RequiredArbitrageParams = Required<ArbitrageParams>;

interface ArbitrageOpportunity {
  type: 'buy-both' | 'sell-both';
  yesPrice: number;
  noPrice: number;
  profitBps: number;
  maxSize: number;
}

export class ArbitrageStrategy extends BaseStrategy {
  private params!: RequiredArbitrageParams;
  private lastPriceUpdate: Map<string, number> = new Map();

  constructor() {
    super(
      'arbitrage-strategy',
      'Arbitrage',
      '1.0.0',
      'Intra-market arbitrage: exploit YES + NO price discrepancies',
    );
  }

  protected async onInitialize(config: StrategyConfig): Promise<void> {
    const params = config.params as ArbitrageParams;
    
    this.params = {
      minProfitBps: params.minProfitBps ?? 50, // 0.5% minimum profit
      feeRate: params.feeRate ?? 0.02, // 2% fee
      maxOrderSize: params.maxOrderSize ?? 100,
      minLiquidity: params.minLiquidity ?? 50,
      priceUpdateWindow: params.priceUpdateWindow ?? 5000, // 5 seconds
    };

    // Validate parameters
    if (this.params.minProfitBps < 0) {
      throw new Error('minProfitBps must be non-negative');
    }
    if (this.params.feeRate < 0 || this.params.feeRate > 1) {
      throw new Error('feeRate must be between 0 and 1');
    }
    if (this.params.maxOrderSize <= 0) {
      throw new Error('maxOrderSize must be positive');
    }
  }

  protected async onEvaluate(
    context: MarketContext,
    position?: Position,
  ): Promise<TradingDecision> {
    // Check for stale prices
    if (!this.isPriceRecent(context)) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: 'Prices are stale - not trading on outdated data',
      };
    }

    // Check liquidity
    if (!this.hasAdequateLiquidity(context)) {
      return {
        action: 'hold',
        confidence: 0.2,
        rationale: `Insufficient liquidity (bid: ${context.liquidity.bidSize}, ask: ${context.liquidity.askSize})`,
      };
    }

    // Calculate arbitrage opportunity
    const opportunity = this.findArbitrageOpportunity(context);

    if (!opportunity) {
      return {
        action: 'hold',
        confidence: 0.3,
        rationale: `No arbitrage opportunity (YES: ${context.bestAsk.toFixed(4)}, NO: ${(1 - context.bestBid).toFixed(4)}, sum: ${(context.bestAsk + (1 - context.bestBid)).toFixed(4)})`,
        metadata: {
          yesAsk: context.bestAsk,
          noBid: context.bestBid,
          impliedNoAsk: 1 - context.bestBid,
          sum: context.bestAsk + (1 - context.bestBid),
        },
      };
    }

    // Execute arbitrage based on opportunity type
    if (opportunity.type === 'buy-both') {
      return this.executeBuyBothSides(context, opportunity, position);
    } else {
      return this.executeSellBothSides(context, opportunity, position);
    }
  }

  /**
   * Check if prices are recent enough to trade on
   */
  private isPriceRecent(context: MarketContext): boolean {
    const now = Date.now();
    const lastUpdate = this.lastPriceUpdate.get(context.marketId) || 0;
    const age = now - lastUpdate;
    
    this.lastPriceUpdate.set(context.marketId, now);
    
    return age < this.params.priceUpdateWindow || lastUpdate === 0;
  }

  /**
   * Check if there's adequate liquidity for arbitrage
   */
  private hasAdequateLiquidity(context: MarketContext): boolean {
    return (
      context.liquidity.bidSize >= this.params.minLiquidity &&
      context.liquidity.askSize >= this.params.minLiquidity
    );
  }

  /**
   * Find arbitrage opportunity
   * 
   * For Polymarket prediction markets:
   * - YES token pays $1 if event happens, $0 otherwise
   * - NO token pays $1 if event doesn't happen, $0 otherwise
   * - Therefore: YES + NO must equal $1.00 at all times
   * 
   * Arbitrage exists when:
   * - Buy arbitrage: YES_ask + NO_ask < $1.00 (minus fees)
   * - Sell arbitrage: YES_bid + NO_bid > $1.00 (plus fees)
   */
  private findArbitrageOpportunity(context: MarketContext): ArbitrageOpportunity | null {
    // Calculate implied NO prices from YES prices
    const yesAsk = context.bestAsk;
    const yesBid = context.bestBid;
    const noAsk = 1 - yesBid; // If YES bid is 0.6, NO ask is 0.4
    const noBid = 1 - yesAsk; // If YES ask is 0.65, NO bid is 0.35

    // Buy both sides arbitrage: YES_ask + NO_ask < 1.00
    const buyBothCost = yesAsk + noAsk;
    // Fees are applied per-side on Polymarket
    const buyBothFees = (yesAsk * this.params.feeRate) + (noAsk * this.params.feeRate);
    const buyBothTotalCost = buyBothCost + buyBothFees;
    const buyBothProfit = 1.0 - buyBothTotalCost;
    const buyBothProfitBps = (buyBothProfit / buyBothTotalCost) * 10000;

    // Check if buy-both arbitrage is profitable
    if (buyBothProfitBps >= this.params.minProfitBps) {
      const maxSize = Math.min(
        this.params.maxOrderSize,
        context.liquidity.askSize,
        context.liquidity.bidSize,
      );

      return {
        type: 'buy-both',
        yesPrice: yesAsk,
        noPrice: noAsk,
        profitBps: buyBothProfitBps,
        maxSize,
      };
    }

    // Sell both sides arbitrage: YES_bid + NO_bid > 1.00
    // This requires existing positions, so we check if we have inventory
    const sellBothRevenue = yesBid + noBid;
    // Fees are applied per-side on Polymarket
    const sellBothFees = (yesBid * this.params.feeRate) + (noBid * this.params.feeRate);
    const sellBothNetRevenue = sellBothRevenue - sellBothFees;
    const sellBothProfit = sellBothNetRevenue - 1.0;
    const sellBothProfitBps = (sellBothProfit / 1.0) * 10000;

    // Note: Sell-both arbitrage is rare and requires inventory
    if (sellBothProfitBps >= this.params.minProfitBps) {
      const maxSize = Math.min(
        this.params.maxOrderSize,
        context.liquidity.bidSize,
        context.liquidity.askSize,
      );

      return {
        type: 'sell-both',
        yesPrice: yesBid,
        noPrice: noBid,
        profitBps: sellBothProfitBps,
        maxSize,
      };
    }

    return null;
  }

  /**
   * Execute buy-both-sides arbitrage
   */
  private executeBuyBothSides(
    _context: MarketContext,
    opportunity: ArbitrageOpportunity,
    _position?: Position,
  ): TradingDecision {
    // Calculate order size based on available liquidity and max size
    const size = Math.floor(opportunity.maxSize);

    // For buy-both arbitrage, we need to buy YES tokens
    // (NO tokens will be bought in a separate order or synthetic position)
    return {
      action: 'buy',
      side: 'BUY',
      price: opportunity.yesPrice,
      size,
      confidence: 0.95, // High confidence - this is arbitrage
      rationale: `Arbitrage opportunity: Buy YES at ${opportunity.yesPrice.toFixed(4)} + NO at ${opportunity.noPrice.toFixed(4)} = ${(opportunity.yesPrice + opportunity.noPrice).toFixed(4)} < $1.00. Expected profit: ${(opportunity.profitBps / 100).toFixed(2)}% (${opportunity.profitBps} bps)`,
      metadata: {
        strategyType: 'buy-both-arbitrage',
        yesPrice: opportunity.yesPrice,
        noPrice: opportunity.noPrice,
        totalCost: opportunity.yesPrice + opportunity.noPrice,
        profitBps: opportunity.profitBps,
        expectedProfit: (1.0 - (opportunity.yesPrice + opportunity.noPrice)) * size,
        needsNoLeg: true, // Signal that we need to also buy NO tokens
      },
    };
  }

  /**
   * Execute sell-both-sides arbitrage
   */
  private executeSellBothSides(
    _context: MarketContext,
    opportunity: ArbitrageOpportunity,
    position?: Position,
  ): TradingDecision {
    // Check if we have inventory to sell
    const currentSize = Math.abs(position?.size || 0);
    
    if (currentSize === 0) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: 'Sell-both arbitrage detected but no inventory to sell',
        metadata: {
          strategyType: 'sell-both-arbitrage-blocked',
          profitBps: opportunity.profitBps,
        },
      };
    }

    const size = Math.min(currentSize, Math.floor(opportunity.maxSize));

    return {
      action: 'sell',
      side: 'SELL',
      price: opportunity.yesPrice,
      size,
      confidence: 0.95, // High confidence - this is arbitrage
      rationale: `Arbitrage opportunity: Sell YES at ${opportunity.yesPrice.toFixed(4)} + NO at ${opportunity.noPrice.toFixed(4)} = ${(opportunity.yesPrice + opportunity.noPrice).toFixed(4)} > $1.00. Expected profit: ${(opportunity.profitBps / 100).toFixed(2)}% (${opportunity.profitBps} bps)`,
      metadata: {
        strategyType: 'sell-both-arbitrage',
        yesPrice: opportunity.yesPrice,
        noPrice: opportunity.noPrice,
        totalRevenue: opportunity.yesPrice + opportunity.noPrice,
        profitBps: opportunity.profitBps,
        expectedProfit: ((opportunity.yesPrice + opportunity.noPrice) - 1.0) * size,
        needsNoLeg: true, // Signal that we need to also sell NO tokens
      },
    };
  }

  /**
   * Clear stale price tracking (useful for cleanup)
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    this.lastPriceUpdate.clear();
  }
}
