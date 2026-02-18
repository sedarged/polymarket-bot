/**
 * Trading Strategies Module
 * 
 * Exports all strategy classes and provides auto-registration
 * for the strategy factory.
 */

// Core types and abstractions
export * from './types';
export { BaseStrategy } from './BaseStrategy';
export { StrategyFactory } from './StrategyFactory';

// Strategy implementations
export { RandomStrategy } from './RandomStrategy';
export { TrendFollowingStrategy } from './TrendFollowingStrategy';
export { MarketMakingStrategy } from './MarketMakingStrategy';

// Auto-register all strategies
import { StrategyFactory } from './StrategyFactory';
import { RandomStrategy } from './RandomStrategy';
import { TrendFollowingStrategy } from './TrendFollowingStrategy';
import { MarketMakingStrategy } from './MarketMakingStrategy';

/**
 * Register all built-in strategies with the factory
 * Call this once at application startup
 */
export function registerStrategies(): void {
  // Random Strategy
  StrategyFactory.register({
    type: 'random',
    factory: () => new RandomStrategy(),
    description: 'Random trading strategy for testing',
    defaultConfig: {
      strategyId: '',
      type: 'random',
      enabled: true,
      params: {
        buyProbability: 0.3,
        sellProbability: 0.3,
        maxSize: 10,
        minSpread: 0.01,
      },
    },
  });

  // Trend Following Strategy
  StrategyFactory.register({
    type: 'trend-following',
    factory: () => new TrendFollowingStrategy(),
    description: 'Momentum-based trend following strategy',
    defaultConfig: {
      strategyId: '',
      type: 'trend-following',
      enabled: true,
      params: {
        lookbackPeriod: 10,
        trendThreshold: 0.02,
        maxPositionSize: 50,
        minSpread: 0.01,
        stopLoss: 0.05,
      },
    },
  });

  // Market Making Strategy
  StrategyFactory.register({
    type: 'market-making',
    factory: () => new MarketMakingStrategy(),
    description: 'Simple market making with inventory management',
    defaultConfig: {
      strategyId: '',
      type: 'market-making',
      enabled: true,
      params: {
        spreadBps: 100,
        orderSize: 10,
        maxInventory: 100,
        inventorySkew: true,
        minSpread: 0.005,
      },
    },
  });
}
