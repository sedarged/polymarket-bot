/**
 * Integration tests for Per-Strategy Config Loading (GAP-002)
 * 
 * Tests the full integration between ConfigManager and StrategyManager:
 * - Loading strategies from STRATEGY_CONFIG_PATH
 * - Creating strategy instances with per-strategy configs
 * - Hot-reload of strategy configurations
 * - Multi-strategy orchestration with independent configs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../src/config/configManager';
import { StrategyManager } from '../../src/trading/strategies/StrategyManager';
import { registerStrategies } from '../../src/trading/strategies';
import type { PerStrategyConfig } from '../../src/config';

// Helper to wait for a specified time
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Per-Strategy Config Loading Integration (GAP-002)', () => {
  let configManager: ConfigManager;
  let strategyManager: StrategyManager;
  let testDir: string;
  let strategyPath: string;

  beforeEach(() => {
    // Register all strategies
    registerStrategies();

    // Create a temporary test directory
    testDir = path.join(process.cwd(), '.test-strategy-integration');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    strategyPath = path.join(testDir, 'strategies.json');
  });

  afterEach(async () => {
    // Clean up
    if (strategyManager) {
      await strategyManager.stopWatching();
    }
    if (configManager) {
      await configManager.destroy();
    }

    // Remove test files
    if (fs.existsSync(strategyPath)) {
      fs.unlinkSync(strategyPath);
    }

    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }

    // Clean up environment
    delete process.env.STRATEGY_CONFIG_PATH;
  });

  describe('Strategy Loading from Config', () => {
    it('should load multiple strategies from STRATEGY_CONFIG_PATH', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'arbitrage-test',
          type: 'arbitrage',
          enabled: true,
          params: {
            minProfitBps: 50,
            feeRate: 0.02,
            maxOrderSize: 100,
          },
        },
        {
          strategyId: 'mean-reversion-test',
          type: 'mean-reversion',
          enabled: true,
          params: {
            lookbackPeriod: 15,
            entryThreshold: 2.5,
          },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      expect(loadedStrategies.size).toBe(2);
      expect(loadedStrategies.has('arbitrage-test')).toBe(true);
      expect(loadedStrategies.has('mean-reversion-test')).toBe(true);

      const arbitrageStrategy = loadedStrategies.get('arbitrage-test');
      expect(arbitrageStrategy).toBeDefined();
      expect(arbitrageStrategy?.name).toBe('Arbitrage');
    });

    it('should only load enabled strategies', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'enabled-strategy',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
        {
          strategyId: 'disabled-strategy',
          type: 'mean-reversion',
          enabled: false,
          params: { lookbackPeriod: 20 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      expect(loadedStrategies.size).toBe(1);
      expect(loadedStrategies.has('enabled-strategy')).toBe(true);
      expect(loadedStrategies.has('disabled-strategy')).toBe(false);
    });

    it('should handle empty strategy config', async () => {
      const strategies: PerStrategyConfig[] = [];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      expect(loadedStrategies.size).toBe(0);
    });
  });

  describe('Strategy Instance Configuration', () => {
    it('should create strategies with correct params from config', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'custom-arbitrage',
          type: 'arbitrage',
          enabled: true,
          params: {
            minProfitBps: 75, // Custom value
            feeRate: 0.015,   // Custom value
            maxOrderSize: 200, // Custom value
          },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      const strategy = loadedStrategies.get('custom-arbitrage');
      expect(strategy).toBeDefined();

      const config = strategy?.getConfig();
      expect(config?.params).toHaveProperty('minProfitBps', 75);
      expect(config?.params).toHaveProperty('feeRate', 0.015);
      expect(config?.params).toHaveProperty('maxOrderSize', 200);
    });

    it('should use default params when not specified', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'default-params',
          type: 'random',
          enabled: true,
          params: {}, // Empty params - should use defaults
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      const strategy = loadedStrategies.get('default-params');
      expect(strategy).toBeDefined();

      const config = strategy?.getConfig();
      // Should have default params from factory registration
      expect(config?.params).toBeDefined();
    });
  });

  describe('Multi-Strategy Scenarios', () => {
    it('should load different strategy types concurrently', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'arbitrage-1',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
        {
          strategyId: 'mean-reversion-1',
          type: 'mean-reversion',
          enabled: true,
          params: { lookbackPeriod: 15 },
        },
        {
          strategyId: 'market-making-1',
          type: 'market-making',
          enabled: true,
          params: { spreadBps: 100 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      expect(loadedStrategies.size).toBe(3);
      
      const arbitrage = loadedStrategies.get('arbitrage-1');
      const meanReversion = loadedStrategies.get('mean-reversion-1');
      const marketMaking = loadedStrategies.get('market-making-1');

      expect(arbitrage?.name).toBe('Arbitrage');
      expect(meanReversion?.name).toBe('MeanReversion');
      expect(marketMaking?.name).toBe('MarketMaking');
    });

    it('should load multiple instances of same strategy type', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'arbitrage-aggressive',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 25 }, // Low threshold
        },
        {
          strategyId: 'arbitrage-conservative',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 100 }, // High threshold
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      expect(loadedStrategies.size).toBe(2);

      const aggressive = loadedStrategies.get('arbitrage-aggressive');
      const conservative = loadedStrategies.get('arbitrage-conservative');

      expect(aggressive?.getConfig().params).toHaveProperty('minProfitBps', 25);
      expect(conservative?.getConfig().params).toHaveProperty('minProfitBps', 100);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid strategy type gracefully', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'valid-strategy',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
        {
          strategyId: 'invalid-strategy',
          type: 'non-existent-type',
          enabled: true,
          params: {},
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      // Should load valid strategy and skip invalid one
      expect(loadedStrategies.size).toBe(1);
      expect(loadedStrategies.has('valid-strategy')).toBe(true);
      expect(loadedStrategies.has('invalid-strategy')).toBe(false);
    });

    it('should continue loading other strategies if one fails', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
        {
          strategyId: 'strategy-2',
          type: 'invalid-type',
          enabled: true,
          params: {},
        },
        {
          strategyId: 'strategy-3',
          type: 'mean-reversion',
          enabled: true,
          params: { lookbackPeriod: 20 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const loadedStrategies = await strategyManager.loadStrategiesFromConfig();

      // Should load 2 valid strategies
      expect(loadedStrategies.size).toBe(2);
      expect(loadedStrategies.has('strategy-1')).toBe(true);
      expect(loadedStrategies.has('strategy-3')).toBe(true);
    });
  });

  describe('Config Modification at Runtime', () => {
    it('should detect config changes and reload strategies', async () => {
      // Initial config
      const initialStrategies: PerStrategyConfig[] = [
        {
          strategyId: 'runtime-test',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(initialStrategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      strategyManager = new StrategyManager();
      const initialLoad = await strategyManager.loadStrategiesFromConfig();

      expect(initialLoad.size).toBe(1);
      const initialStrategy = initialLoad.get('runtime-test');
      expect(initialStrategy?.getConfig().params).toHaveProperty('minProfitBps', 50);

      // Modify config
      const modifiedStrategies: PerStrategyConfig[] = [
        {
          strategyId: 'runtime-test',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 100 }, // Changed value
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(modifiedStrategies, null, 2));
      await configManager.reloadConfig();

      // Reload strategy with new config
      const newConfig = configManager.getStrategyConfig('runtime-test');
      expect(newConfig).toBeDefined();
      expect(newConfig?.params).toHaveProperty('minProfitBps', 100);
    });
  });
});
