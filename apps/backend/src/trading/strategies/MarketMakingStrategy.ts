/**
 * Simple Market Making Strategy
 * 
 * Basic market making strategy that places bids and asks around the mid price.
 * Captures spread while managing inventory.
 * 
 * Parameters:
 * - spreadBps: Target spread in basis points (default: 100 = 1%)
 * - orderSize: Size for each order (default: 10)
 * - maxInventory: Maximum inventory position (default: 100)
 * - inventorySkew: Adjust quotes based on inventory (default: true)
 * - minSpread: Minimum market spread to quote (default: 0.005)
 * 
 * **WARNING: Simplified for testing. Production market making requires:**
 * - Proper risk management
 * - Latency optimization
 * - Adverse selection protection
 * - Dynamic spread adjustment
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
}

export class MarketMakingStrategy extends BaseStrategy {
  private params!: Required<MarketMakingParams>;

  constructor() {
    super(
      'market-making-strategy',
      'MarketMaking',
      '1.0.0',
      'Simple market making strategy with inventory management',
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
    };

    // Validate parameters
    if (this.params.spreadBps <= 0) {
      throw new Error('spreadBps must be positive');
    }
    if (this.params.orderSize <= 0) {
      throw new Error('orderSize must be positive');
    }
    if (this.params.maxInventory <= 0) {
      throw new Error('maxInventory must be positive');
    }
  }

  protected async onEvaluate(
    context: MarketContext,
    position?: Position,
  ): Promise<TradingDecision> {
    // Check if market spread is acceptable
    if (context.spread < this.params.minSpread) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: `Market spread too tight: ${context.spread.toFixed(4)}`,
      };
    }

    const currentInventory = position?.size || 0;
    const inventoryRatio = currentInventory / this.params.maxInventory;

    // Check inventory limits
    if (Math.abs(currentInventory) >= this.params.maxInventory) {
      // At max inventory - only quote on the side that reduces inventory
      if (currentInventory > 0) {
        // Long inventory - only offer to sell
        return this.createSellQuote(context, inventoryRatio);
      } else {
        // Short inventory - only bid to buy
        return this.createBuyQuote(context, inventoryRatio);
      }
    }

    // Normal market making - alternate between buy and sell
    // In a real implementation, would place both simultaneously
    // For simplicity, alternate based on inventory bias
    
    if (this.params.inventorySkew) {
      // Skew toward reducing inventory
      if (inventoryRatio > 0.5) {
        // Heavy long inventory - prefer selling
        return this.createSellQuote(context, inventoryRatio);
      } else if (inventoryRatio < -0.5) {
        // Heavy short inventory - prefer buying
        return this.createBuyQuote(context, inventoryRatio);
      }
    }

    // Balanced or no skewing - alternate based on timestamp for determinism
    // This ensures same inputs -> same outputs while still varying behavior
    const timestamp = Date.parse(context.timestamp);
    if (timestamp % 2 === 0) {
      return this.createBuyQuote(context, inventoryRatio);
    } else {
      return this.createSellQuote(context, inventoryRatio);
    }
  }

  /**
   * Create a buy quote (bid)
   */
  private createBuyQuote(context: MarketContext, inventoryRatio: number): TradingDecision {
    const targetSpread = this.params.spreadBps / 10000; // Convert bps to decimal
    
    // Calculate bid price with inventory skew
    let skewFactor = 0;
    if (this.params.inventorySkew) {
      // Reduce bid when long (negative skew)
      skewFactor = -inventoryRatio * (targetSpread / 2);
    }
    
    const bidPrice = context.mid - (targetSpread / 2) + skewFactor;
    
    // Ensure price is valid - log if clamping occurs
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
      confidence: 0.6 - Math.abs(inventoryRatio) * 0.2, // Lower confidence with higher inventory
      rationale: `Market making bid at ${finalPrice.toFixed(4)} (mid: ${context.mid.toFixed(4)}, inventory: ${inventoryRatio.toFixed(2)})`,
      metadata: {
        mid: context.mid,
        spread: context.spread,
        inventoryRatio,
        skewFactor,
      },
    };
  }

  /**
   * Create a sell quote (offer/ask)
   */
  private createSellQuote(context: MarketContext, inventoryRatio: number): TradingDecision {
    const targetSpread = this.params.spreadBps / 10000; // Convert bps to decimal
    
    // Calculate ask price with inventory skew
    let skewFactor = 0;
    if (this.params.inventorySkew) {
      // Reduce ask when short (negative skew)
      skewFactor = inventoryRatio * (targetSpread / 2);
    }
    
    const askPrice = context.mid + (targetSpread / 2) + skewFactor;
    
    // Ensure price is valid - log if clamping occurs
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
      confidence: 0.6 - Math.abs(inventoryRatio) * 0.2, // Lower confidence with higher inventory
      rationale: `Market making offer at ${finalPrice.toFixed(4)} (mid: ${context.mid.toFixed(4)}, inventory: ${inventoryRatio.toFixed(2)})`,
      metadata: {
        mid: context.mid,
        spread: context.spread,
        inventoryRatio,
        skewFactor,
      },
    };
  }
}
