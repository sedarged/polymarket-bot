/**
 * End-to-End Integration Tests for Strategy Framework
 * 
 * Tests the complete strategy lifecycle:
 * - Registration of all strategies
 * - Loading configuration from file
 * - Instantiation and initialization
 * - Strategy evaluation
 * - Multiple strategy orchestration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { registerStrategies, StrategyFactory } from '../../src/trading/strategies';
import type { IStrategy, MarketContext, StrategyConfig } from '../../src/trading/strategies/types';

describe('Strategy Framework - End-to-End', () => {
  beforeAll(() => {
    // Register all built-in strategies
    registerStrategies();
  });

  afterAll(() => {
    StrategyFactory.clear();
  });

  describe('Strategy Registration', () => {
    it('should have all built-in strategies registered', () => {
      const types = StrategyFactory.getRegisteredTypes();
      
      expect(types).toContain('random');
      expect(types).toContain('arbitrage');
      expect(types).toContain('mean-reversion');
      expect(types).toContain('market-making');
      expect(types.length).toBeGreaterThanOrEqual(4);
    });

    it('should list strategy information', () => {
      const strategies = StrategyFactory.listStrategies();
      
      expect(strategies.length).toBeGreaterThanOrEqual(4);
      
      const randomStrategy = strategies.find(s => s.type === 'random');
      expect(randomStrategy).toBeDefined();
      expect(randomStrategy?.description).toContain('testing');
      expect(randomStrategy?.defaultConfig.params).toBeDefined();

      const arbitrageStrategy = strategies.find(s => s.type === 'arbitrage');
      expect(arbitrageStrategy).toBeDefined();
      expect(arbitrageStrategy?.description).toContain('arbitrage');
    });
  });

  describe('Strategy Instantiation from Config', () => {
    it('should create strategy from minimal config', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-random-1',
        type: 'random',
        enabled: true,
        params: {},
      };

      const strategy = await StrategyFactory.create(config);

      expect(strategy).toBeDefined();
      expect(strategy.id).toBe('random-strategy');
      expect(strategy.name).toBe('Random');
      expect(strategy.version).toBe('1.0.0');
    });

    it('should create strategy with custom parameters', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-arbitrage-1',
        type: 'arbitrage',
        enabled: true,
        params: {
          minProfitBps: 100,
          maxOrderSize: 50,
        },
      };

      const strategy = await StrategyFactory.create(config);

      expect(strategy).toBeDefined();
      expect(strategy.name).toBe('Arbitrage');
      
      const strategyConfig = strategy.getConfig();
      expect(strategyConfig.params.minProfitBps).toBe(100);
      expect(strategyConfig.params.maxOrderSize).toBe(50);
    });

    it('should create multiple strategies from config array', async () => {
      const configs: StrategyConfig[] = [
        {
          strategyId: 'random-1',
          type: 'random',
          enabled: true,
          params: { maxSize: 10 },
        },
        {
          strategyId: 'arbitrage-1',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 75 },
        },
        {
          strategyId: 'mm-1',
          type: 'market-making',
          enabled: true,
          params: { spreadBps: 150 },
        },
      ];

      const strategies = await StrategyFactory.createAll(configs);

      expect(strategies).toHaveLength(3);
      expect(strategies[0].name).toBe('Random');
      expect(strategies[1].name).toBe('Arbitrage');
      expect(strategies[2].name).toBe('MarketMaking');
    });
  });

  describe('Strategy Evaluation', () => {
    let strategy: IStrategy;
    const mockMarketContext: MarketContext = {
      marketId: 'test-market-1',
      tokenId: 'token-123',
      bestBid: 0.49,
      bestAsk: 0.51,
      mid: 0.50,
      spread: 0.02,
      liquidity: {
        bidSize: 100,
        askSize: 100,
      },
      timestamp: new Date().toISOString(),
    };

    it('should evaluate RandomStrategy', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-random',
        type: 'random',
        enabled: true,
        params: {
          buyProbability: 0.5,
          sellProbability: 0.5,
          maxSize: 10,
          seed: 12345, // Seeded for reproducibility
        },
      };

      strategy = await StrategyFactory.create(config);
      const decision = await strategy.evaluate(mockMarketContext);

      expect(decision).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(decision.action);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.rationale).toBeDefined();
    });

    it('should evaluate MeanReversionStrategy', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-mean-reversion',
        type: 'mean-reversion',
        enabled: true,
        params: {
          lookbackPeriod: 5,
          entryThreshold: 1.5,
        },
      };

      strategy = await StrategyFactory.create(config);
      
      // First evaluation - not enough history
      const decision1 = await strategy.evaluate(mockMarketContext);
      expect(decision1.action).toBe('hold');
      expect(decision1.rationale).toContain('Building price history');

      // Add more market updates to build history
      for (let i = 0; i < 5; i++) {
        await strategy.evaluate({
          ...mockMarketContext,
          mid: 0.50,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        });
      }

      // Should now have enough history
      const finalDecision = await strategy.evaluate({
        ...mockMarketContext,
        mid: 0.50,
        timestamp: new Date().toISOString(),
      });

      expect(finalDecision).toBeDefined();
      expect(finalDecision.action).toBeDefined();
    });

    it('should evaluate MarketMakingStrategy', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-mm',
        type: 'market-making',
        enabled: true,
        params: {
          spreadBps: 100,
          orderSize: 10,
        },
      };

      strategy = await StrategyFactory.create(config);
      const decision = await strategy.evaluate(mockMarketContext);

      expect(decision).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(decision.action);
      
      if (decision.action !== 'hold') {
        expect(decision.price).toBeGreaterThan(0);
        expect(decision.price).toBeLessThan(1);
        expect(decision.size).toBeGreaterThan(0);
        expect(decision.side).toBeDefined();
      }
    });
  });

  describe('Multi-Strategy Orchestration', () => {
    it('should manage multiple strategies simultaneously', async () => {
      const configs: StrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'random',
          enabled: true,
          params: { seed: 111 },
        },
        {
          strategyId: 'strategy-2',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 100 },
        },
        {
          strategyId: 'strategy-3',
          type: 'market-making',
          enabled: true,
          params: { spreadBps: 50 },
        },
      ];

      const strategies = await StrategyFactory.createAll(configs);
      expect(strategies).toHaveLength(3);

      const mockContext: MarketContext = {
        marketId: 'multi-test',
        tokenId: 'token-xyz',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.50,
        spread: 0.04,
        liquidity: { bidSize: 50, askSize: 50 },
        timestamp: new Date().toISOString(),
      };

      // Evaluate all strategies
      const decisions = await Promise.all(
        strategies.map(s => s.evaluate(mockContext))
      );

      expect(decisions).toHaveLength(3);
      decisions.forEach(decision => {
        expect(decision).toBeDefined();
        expect(decision.action).toBeDefined();
        expect(decision.confidence).toBeGreaterThanOrEqual(0);
        expect(decision.confidence).toBeLessThanOrEqual(1);
        expect(decision.rationale).toBeDefined();
      });
    });

    it('should track metrics for each strategy', async () => {
      const config: StrategyConfig = {
        strategyId: 'metrics-test',
        type: 'random',
        enabled: true,
        params: {
          buyProbability: 0.8, // High buy probability for testing
          sellProbability: 0.0, // No sell to stay within limit
          seed: 999,
        },
      };

      const strategy = await StrategyFactory.create(config);

      const mockContext: MarketContext = {
        marketId: 'metrics-market',
        tokenId: 'token-abc',
        bestBid: 0.49,
        bestAsk: 0.51,
        mid: 0.50,
        spread: 0.02,
        liquidity: { bidSize: 100, askSize: 100 },
        timestamp: new Date().toISOString(),
      };

      // Generate some trades
      for (let i = 0; i < 5; i++) {
        await strategy.evaluate(mockContext);
      }

      const metrics = strategy.getMetrics?.();
      
      if (metrics) {
        expect(metrics.trades).toBeGreaterThan(0);
        expect(typeof metrics.winRate).toBe('number');
        expect(typeof metrics.pnl).toBe('number');
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should reject invalid strategy type', async () => {
      const config: StrategyConfig = {
        strategyId: 'invalid-type',
        type: 'non-existent-strategy',
        enabled: true,
        params: {},
      };

      await expect(StrategyFactory.create(config)).rejects.toThrow('Unknown strategy type');
    });

    it('should reject invalid parameters', async () => {
      const config: StrategyConfig = {
        strategyId: 'invalid-params',
        type: 'random',
        enabled: true,
        params: {
          buyProbability: 1.5, // Invalid: > 1
        },
      };

      await expect(StrategyFactory.create(config)).rejects.toThrow();
    });

    it('should reject invalid arbitrage config', async () => {
      const config: StrategyConfig = {
        strategyId: 'invalid-arbitrage',
        type: 'arbitrage',
        enabled: true,
        params: {
          minProfitBps: -10, // Invalid: negative
        },
      };

      await expect(StrategyFactory.create(config)).rejects.toThrow();
    });

    it('should reject invalid mean-reversion config', async () => {
      const config: StrategyConfig = {
        strategyId: 'invalid-mean-reversion',
        type: 'mean-reversion',
        enabled: true,
        params: {
          lookbackPeriod: 2, // Invalid: too small
        },
      };

      await expect(StrategyFactory.create(config)).rejects.toThrow();
    });
  });

  describe('Strategy Lifecycle', () => {
    it('should handle strategy cleanup', async () => {
      const config: StrategyConfig = {
        strategyId: 'lifecycle-test',
        type: 'mean-reversion',
        enabled: true,
        params: {},
      };

      const strategy = await StrategyFactory.create(config);
      
      // Use the strategy
      const mockContext: MarketContext = {
        marketId: 'cleanup-test',
        tokenId: 'token-123',
        bestBid: 0.49,
        bestAsk: 0.51,
        mid: 0.50,
        spread: 0.02,
        liquidity: { bidSize: 100, askSize: 100 },
        timestamp: new Date().toISOString(),
      };

      await strategy.evaluate(mockContext);

      // Cleanup should not throw
      if (strategy.cleanup) {
        await expect(strategy.cleanup()).resolves.not.toThrow();
      }
    });
  });
});
