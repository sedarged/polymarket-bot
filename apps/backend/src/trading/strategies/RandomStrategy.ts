/**
 * Random Strategy
 * 
 * Simple test strategy that makes random trading decisions.
 * Useful for testing the strategy framework and backtesting infrastructure.
 * 
 * Parameters:
 * - buyProbability: Probability of buying (0-1, default: 0.3)
 * - sellProbability: Probability of selling (0-1, default: 0.3)
 * - maxSize: Maximum order size (default: 10)
 * - minSpread: Minimum spread to trade (default: 0.01)
 * 
 * **WARNING: For testing only. Do NOT use in live trading.**
 */

import { BaseStrategy } from './BaseStrategy';
import type { MarketContext, Position, TradingDecision, StrategyConfig } from './types';

interface RandomStrategyParams {
  buyProbability?: number;
  sellProbability?: number;
  maxSize?: number;
  minSpread?: number;
  seed?: number; // For reproducible randomness in tests
}

export class RandomStrategy extends BaseStrategy {
  private params!: Required<RandomStrategyParams>;
  private rng: () => number;

  constructor() {
    super(
      'random-strategy',
      'Random',
      '1.0.0',
      'Random trading strategy for testing',
    );
    
    // Default to Math.random, but allow seeded RNG for tests
    this.rng = Math.random;
  }

  protected async onInitialize(config: StrategyConfig): Promise<void> {
    const params = config.params as RandomStrategyParams;
    
    this.params = {
      buyProbability: params.buyProbability ?? 0.3,
      sellProbability: params.sellProbability ?? 0.3,
      maxSize: params.maxSize ?? 10,
      minSpread: params.minSpread ?? 0.01,
      seed: params.seed,
    };

    // Validate probabilities
    if (this.params.buyProbability < 0 || this.params.buyProbability > 1) {
      throw new Error('buyProbability must be between 0 and 1');
    }
    if (this.params.sellProbability < 0 || this.params.sellProbability > 1) {
      throw new Error('sellProbability must be between 0 and 1');
    }
    if (this.params.buyProbability + this.params.sellProbability > 1) {
      throw new Error('buyProbability + sellProbability cannot exceed 1');
    }

    // Setup seeded RNG if provided (for testing)
    if (this.params.seed !== undefined) {
      this.rng = this.seededRandom(this.params.seed);
    }
  }

  protected async onEvaluate(
    context: MarketContext,
    position?: Position,
  ): Promise<TradingDecision> {
    // Check if spread is acceptable
    if (context.spread < this.params.minSpread) {
      return {
        action: 'hold',
        confidence: 0.1,
        rationale: `Spread too tight: ${context.spread.toFixed(4)} < ${this.params.minSpread}`,
      };
    }

    // Generate random decision
    const rand = this.rng();
    
    // Buy decision
    if (rand < this.params.buyProbability) {
      const size = Math.floor(this.rng() * this.params.maxSize) + 1;
      // Buy at mid price (simplified for testing)
      const price = context.mid;
      
      return {
        action: 'buy',
        side: 'BUY',
        price,
        size,
        confidence: this.rng() * 0.5 + 0.3, // 0.3 to 0.8
        rationale: `Random buy decision (probability: ${this.params.buyProbability})`,
        metadata: {
          spread: context.spread,
          mid: context.mid,
        },
      };
    }
    
    // Sell decision
    if (rand < this.params.buyProbability + this.params.sellProbability) {
      const size = Math.floor(this.rng() * this.params.maxSize) + 1;
      // Sell at mid price (simplified for testing)
      const price = context.mid;
      
      return {
        action: 'sell',
        side: 'SELL',
        price,
        size,
        confidence: this.rng() * 0.5 + 0.3, // 0.3 to 0.8
        rationale: `Random sell decision (probability: ${this.params.sellProbability})`,
        metadata: {
          spread: context.spread,
          mid: context.mid,
        },
      };
    }
    
    // Hold (most common)
    return {
      action: 'hold',
      confidence: 0.5,
      rationale: 'Random hold decision',
    };
  }

  /**
   * Simple seeded random number generator (for testing)
   * Uses a linear congruential generator
   */
  private seededRandom(seed: number): () => number {
    let current = seed;
    return () => {
      current = (current * 1103515245 + 12345) & 0x7fffffff;
      return current / 0x7fffffff;
    };
  }
}
