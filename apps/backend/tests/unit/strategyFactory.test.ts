/**
 * Tests for Strategy Factory
 * 
 * Tests the strategy factory pattern including:
 * - Strategy registration
 * - Strategy instantiation
 * - Configuration merging
 * - Error handling
 * - Bulk creation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StrategyFactory } from '../../src/trading/strategies/StrategyFactory';
import { RandomStrategy } from '../../src/trading/strategies/RandomStrategy';
import { TrendFollowingStrategy } from '../../src/trading/strategies/TrendFollowingStrategy';
import { MarketMakingStrategy } from '../../src/trading/strategies/MarketMakingStrategy';
import type { StrategyConfig } from '../../src/trading/strategies/types';

describe('StrategyFactory', () => {
  // Clear factory before each test
  beforeEach(() => {
    StrategyFactory.clear();
  });

  afterEach(() => {
    StrategyFactory.clear();
  });

  describe('Registration', () => {
    it('should register a strategy type', () => {
      StrategyFactory.register({
        type: 'test-strategy',
        factory: () => new RandomStrategy(),
        description: 'Test strategy',
        defaultConfig: {
          strategyId: '',
          type: 'test-strategy',
          enabled: true,
          params: {},
        },
      });

      expect(StrategyFactory.isRegistered('test-strategy')).toBe(true);
      expect(StrategyFactory.getRegisteredTypes()).toContain('test-strategy');
    });

    it('should unregister a strategy type', () => {
      StrategyFactory.register({
        type: 'test-strategy',
        factory: () => new RandomStrategy(),
        description: 'Test strategy',
        defaultConfig: {
          strategyId: '',
          type: 'test-strategy',
          enabled: true,
          params: {},
        },
      });

      const unregistered = StrategyFactory.unregister('test-strategy');
      
      expect(unregistered).toBe(true);
      expect(StrategyFactory.isRegistered('test-strategy')).toBe(false);
    });

    it('should return false when unregistering non-existent type', () => {
      const unregistered = StrategyFactory.unregister('non-existent');
      expect(unregistered).toBe(false);
    });

    it('should list all registered strategies', () => {
      StrategyFactory.register({
        type: 'strategy-1',
        factory: () => new RandomStrategy(),
        description: 'Strategy 1',
        defaultConfig: {
          strategyId: '',
          type: 'strategy-1',
          enabled: true,
          params: {},
        },
      });

      StrategyFactory.register({
        type: 'strategy-2',
        factory: () => new TrendFollowingStrategy(),
        description: 'Strategy 2',
        defaultConfig: {
          strategyId: '',
          type: 'strategy-2',
          enabled: true,
          params: {},
        },
      });

      const strategies = StrategyFactory.listStrategies();
      
      expect(strategies).toHaveLength(2);
      expect(strategies.map(s => s.type)).toContain('strategy-1');
      expect(strategies.map(s => s.type)).toContain('strategy-2');
    });
  });

  describe('Strategy Creation', () => {
    beforeEach(() => {
      // Register test strategies
      StrategyFactory.register({
        type: 'random',
        factory: () => new RandomStrategy(),
        description: 'Random strategy',
        defaultConfig: {
          strategyId: '',
          type: 'random',
          enabled: true,
          params: {
            buyProbability: 0.3,
            sellProbability: 0.3,
          },
        },
      });
    });

    it('should create a strategy from config', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {
          maxSize: 20,
        },
      };

      const strategy = await StrategyFactory.create(config);

      expect(strategy).toBeDefined();
      expect(strategy.id).toBe('random-strategy');
      expect(strategy.name).toBe('Random');
      
      const strategyConfig = strategy.getConfig();
      expect(strategyConfig.strategyId).toBe('test-1');
    });

    it('should merge config with defaults', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {
          maxSize: 20, // Custom param
        },
      };

      const strategy = await StrategyFactory.create(config);
      const strategyConfig = strategy.getConfig();

      // Should have default params
      expect(strategyConfig.params.buyProbability).toBe(0.3);
      expect(strategyConfig.params.sellProbability).toBe(0.3);
      // And custom param
      expect(strategyConfig.params.maxSize).toBe(20);
    });

    it('should throw error for unknown strategy type', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-1',
        type: 'non-existent',
        enabled: true,
        params: {},
      };

      await expect(StrategyFactory.create(config)).rejects.toThrow('Unknown strategy type');
    });

    it('should throw error for missing type', async () => {
      const config = {
        strategyId: 'test-1',
        enabled: true,
        params: {},
      } as StrategyConfig;

      await expect(StrategyFactory.create(config)).rejects.toThrow('Strategy type is required');
    });

    it('should initialize strategy with config', async () => {
      const config: StrategyConfig = {
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {
          buyProbability: 0.5,
        },
      };

      const strategy = await StrategyFactory.create(config);
      
      // Strategy should be initialized
      const strategyConfig = strategy.getConfig();
      expect(strategyConfig.params.buyProbability).toBe(0.5);
    });
  });

  describe('Bulk Creation', () => {
    beforeEach(() => {
      // Register multiple strategy types
      StrategyFactory.register({
        type: 'random',
        factory: () => new RandomStrategy(),
        description: 'Random strategy',
        defaultConfig: {
          strategyId: '',
          type: 'random',
          enabled: true,
          params: {},
        },
      });

      StrategyFactory.register({
        type: 'trend-following',
        factory: () => new TrendFollowingStrategy(),
        description: 'Trend following',
        defaultConfig: {
          strategyId: '',
          type: 'trend-following',
          enabled: true,
          params: {},
        },
      });
    });

    it('should create multiple strategies', async () => {
      const configs: StrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'random',
          enabled: true,
          params: {},
        },
        {
          strategyId: 'strategy-2',
          type: 'trend-following',
          enabled: true,
          params: {},
        },
      ];

      const strategies = await StrategyFactory.createAll(configs);

      expect(strategies).toHaveLength(2);
      expect(strategies[0].id).toBe('random-strategy');
      expect(strategies[1].id).toBe('trend-following-strategy');
    });

    it('should handle partial failures gracefully', async () => {
      const configs: StrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'random',
          enabled: true,
          params: {},
        },
        {
          strategyId: 'strategy-2',
          type: 'non-existent', // This will fail
          enabled: true,
          params: {},
        },
        {
          strategyId: 'strategy-3',
          type: 'trend-following',
          enabled: true,
          params: {},
        },
      ];

      const strategies = await StrategyFactory.createAll(configs);

      // Should create 2 out of 3 strategies
      expect(strategies).toHaveLength(2);
      expect(strategies[0].id).toBe('random-strategy');
      expect(strategies[1].id).toBe('trend-following-strategy');
    });

    it('should return empty array for empty config', async () => {
      const strategies = await StrategyFactory.createAll([]);
      expect(strategies).toHaveLength(0);
    });
  });

  describe('Integration with Strategy Types', () => {
    it('should create RandomStrategy', async () => {
      StrategyFactory.register({
        type: 'random',
        factory: () => new RandomStrategy(),
        description: 'Random strategy',
        defaultConfig: {
          strategyId: '',
          type: 'random',
          enabled: true,
          params: {},
        },
      });

      const config: StrategyConfig = {
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: {
          buyProbability: 0.4,
          maxSize: 15,
        },
      };

      const strategy = await StrategyFactory.create(config);

      expect(strategy).toBeInstanceOf(RandomStrategy);
      expect(strategy.name).toBe('Random');
    });

    it('should create TrendFollowingStrategy', async () => {
      StrategyFactory.register({
        type: 'trend-following',
        factory: () => new TrendFollowingStrategy(),
        description: 'Trend following',
        defaultConfig: {
          strategyId: '',
          type: 'trend-following',
          enabled: true,
          params: {},
        },
      });

      const config: StrategyConfig = {
        strategyId: 'trend-1',
        type: 'trend-following',
        enabled: true,
        params: {
          lookbackPeriod: 15,
        },
      };

      const strategy = await StrategyFactory.create(config);

      expect(strategy).toBeInstanceOf(TrendFollowingStrategy);
      expect(strategy.name).toBe('TrendFollowing');
    });

    it('should create MarketMakingStrategy', async () => {
      StrategyFactory.register({
        type: 'market-making',
        factory: () => new MarketMakingStrategy(),
        description: 'Market making',
        defaultConfig: {
          strategyId: '',
          type: 'market-making',
          enabled: true,
          params: {},
        },
      });

      const config: StrategyConfig = {
        strategyId: 'mm-1',
        type: 'market-making',
        enabled: true,
        params: {
          spreadBps: 200,
        },
      };

      const strategy = await StrategyFactory.create(config);

      expect(strategy).toBeInstanceOf(MarketMakingStrategy);
      expect(strategy.name).toBe('MarketMaking');
    });
  });
});
