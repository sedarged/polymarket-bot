/**
 * Trading Strategies Module
 * 
 * Exports all strategy classes and provides auto-registration
 * for the strategy factory.
 * 
 * Strategies are designed specifically for Polymarket prediction markets:
 * - Arbitrage: Exploits YES + NO price discrepancies
 * - Mean Reversion: Fades overreactions to news
 * - Market Making: Provides liquidity for spread capture
 * - Random: Testing and framework validation only
 */

// Core types and abstractions
export * from './types';
export { BaseStrategy } from './BaseStrategy';
export { StrategyFactory } from './StrategyFactory';
export { StrategyManager, type StrategyManagerConfig, type StrategyInstance, type StrategyReloadEvent, type StrategyErrorEvent } from './StrategyManager';
export { StrategyValidator, validateStrategy, type ValidationResult, type ValidationReport, type ValidationCriteria } from './validator';

// Strategy implementations
export { ArbitrageStrategy } from './ArbitrageStrategy';
export { MeanReversionStrategy } from './MeanReversionStrategy';
export { MarketMakingStrategy } from './MarketMakingStrategy';
export { RandomStrategy } from './RandomStrategy';

// Auto-register all strategies
import { StrategyFactory } from './StrategyFactory';
import { ArbitrageStrategy } from './ArbitrageStrategy';
import { MeanReversionStrategy } from './MeanReversionStrategy';
import { MarketMakingStrategy } from './MarketMakingStrategy';
import { RandomStrategy } from './RandomStrategy';

/**
 * Register all built-in strategies with the factory
 * Call this once at application startup
 */
export function registerStrategies(): void {
  // Arbitrage Strategy - MOST IMPORTANT for Polymarket
  StrategyFactory.register({
    type: 'arbitrage',
    factory: () => new ArbitrageStrategy(),
    description: 'Intra-market arbitrage: exploit YES + NO != $1.00',
    defaultConfig: {
      strategyId: '',
      type: 'arbitrage',
      enabled: true,
      params: {
        minProfitBps: 50, // 0.5% minimum profit
        feeRate: 0.02, // 2% fee
        maxOrderSize: 100,
        minLiquidity: 50,
        priceUpdateWindow: 5000,
      },
    },
  });

  // Mean Reversion Strategy - Better than trend-following for prediction markets
  StrategyFactory.register({
    type: 'mean-reversion',
    factory: () => new MeanReversionStrategy(),
    description: 'Fade overreactions and bet on price normalization',
    defaultConfig: {
      strategyId: '',
      type: 'mean-reversion',
      enabled: true,
      params: {
        lookbackPeriod: 20,
        minSpread: 0.01,
        maxPositionSize: 50,
        entryThreshold: 2.0,
        exitThreshold: 0.5,
        cooldownPeriod: 60000,
      },
    },
  });

  // Market Making Strategy
  StrategyFactory.register({
    type: 'market-making',
    factory: () => new MarketMakingStrategy(),
    description: 'Provide liquidity and capture spreads',
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

  // Random Strategy - FOR TESTING ONLY
  StrategyFactory.register({
    type: 'random',
    factory: () => new RandomStrategy(),
    description: 'Random trading for testing framework only',
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
}
