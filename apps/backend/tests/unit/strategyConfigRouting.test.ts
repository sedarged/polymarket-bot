/**
 * Unit tests for Strategy Config Routing (GAP-002)
 * 
 * Tests per-strategy configuration loading, validation, and routing.
 * Verifies that each strategy can be independently configured via external files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../src/config/configManager';
import type { PerStrategyConfig } from '../../src/config';

describe('Strategy Config Routing (GAP-002)', () => {
  let configManager: ConfigManager;
  let testDir: string;
  let strategyPath: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(process.cwd(), '.test-strategy-routing');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    strategyPath = path.join(testDir, 'strategies.json');
  });

  afterEach(async () => {
    // Clean up
    if (configManager) {
      await configManager.destroy();
    }

    // Remove test files
    if (fs.existsSync(strategyPath)) {
      fs.unlinkSync(strategyPath);
    }

    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }

    // Clean up environment
    delete process.env.STRATEGY_CONFIG_PATH;
  });

  describe('Per-Strategy Config Loading', () => {
    it('should load array of strategy configs', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'arbitrage-main',
          type: 'arbitrage',
          enabled: true,
          params: {
            minProfitBps: 50,
            feeRate: 0.02,
            maxOrderSize: 100,
          },
        },
        {
          strategyId: 'mean-reversion-aggressive',
          type: 'mean-reversion',
          enabled: true,
          params: {
            lookbackPeriod: 15,
            entryThreshold: 2.5,
            maxPositionSize: 75,
          },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      const config = configManager.getConfig();
      expect(config.strategy).toBeDefined();
      expect(Array.isArray(config.strategy)).toBe(true);
      expect(config.strategy).toHaveLength(2);
    });

    it('should load single global config (backward compatibility)', async () => {
      const globalConfig = {
        spread: 0.02,
        maxPositionSize: 100,
        inventorySkew: true,
      };

      fs.writeFileSync(strategyPath, JSON.stringify(globalConfig, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      const config = configManager.getConfig();
      expect(config.strategy).toBeDefined();
      expect(Array.isArray(config.strategy)).toBe(false);
      expect(config.strategy).toHaveProperty('spread', 0.02);
    });
  });

  describe('Strategy Config Routing', () => {
    beforeEach(async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
        {
          strategyId: 'strategy-2',
          type: 'mean-reversion',
          enabled: false,
          params: { lookbackPeriod: 20 },
        },
        {
          strategyId: 'strategy-3',
          type: 'market-making',
          enabled: true,
          params: { spreadBps: 100 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();
    });

    it('should route config to correct strategy by ID', () => {
      const config1 = configManager.getStrategyConfig('strategy-1');
      expect(config1).not.toBeNull();
      expect(config1?.strategyId).toBe('strategy-1');
      expect(config1?.type).toBe('arbitrage');
      expect(config1?.params).toHaveProperty('minProfitBps', 50);

      const config2 = configManager.getStrategyConfig('strategy-2');
      expect(config2).not.toBeNull();
      expect(config2?.strategyId).toBe('strategy-2');
      expect(config2?.enabled).toBe(false);
    });

    it('should return null for non-existent strategy ID', () => {
      const config = configManager.getStrategyConfig('non-existent');
      expect(config).toBeNull();
    });

    it('should return all strategy configs', () => {
      const configs = configManager.getAllStrategyConfigs();
      expect(configs).toHaveLength(3);
      expect(configs[0].strategyId).toBe('strategy-1');
      expect(configs[1].strategyId).toBe('strategy-2');
      expect(configs[2].strategyId).toBe('strategy-3');
    });

    it('should filter enabled strategies', () => {
      const allConfigs = configManager.getAllStrategyConfigs();
      const enabledConfigs = allConfigs.filter(c => c.enabled);
      expect(enabledConfigs).toHaveLength(2);
      expect(enabledConfigs.every(c => c.enabled)).toBe(true);
    });
  });

  describe('Config Validation', () => {
    it('should validate strategy config with all required fields', async () => {
      const validStrategies: PerStrategyConfig[] = [
        {
          strategyId: 'valid-strategy',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(validStrategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      const config = configManager.getStrategyConfig('valid-strategy');
      expect(config).not.toBeNull();
      expect(config?.strategyId).toBe('valid-strategy');
    });

    it('should handle missing optional params', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'minimal-strategy',
          type: 'random',
          enabled: true,
          params: {}, // Empty params
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      const config = configManager.getStrategyConfig('minimal-strategy');
      expect(config).not.toBeNull();
      expect(config?.params).toEqual({});
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strategy array', async () => {
      const emptyStrategies: PerStrategyConfig[] = [];

      fs.writeFileSync(strategyPath, JSON.stringify(emptyStrategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      const configs = configManager.getAllStrategyConfigs();
      expect(configs).toHaveLength(0);
    });

    it('should handle malformed JSON gracefully', async () => {
      fs.writeFileSync(strategyPath, '{ invalid json }');
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      const config = configManager.getConfig();
      // Should fall back to undefined strategy config
      expect(config.strategy).toBeUndefined();
    });

    it('should return null for global config when routing by ID', async () => {
      const globalConfig = { spread: 0.02, maxPositionSize: 100 };

      fs.writeFileSync(strategyPath, JSON.stringify(globalConfig, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      // Global config doesn't support routing by ID
      const config = configManager.getStrategyConfig('any-id');
      expect(config).toBeNull();

      const allConfigs = configManager.getAllStrategyConfigs();
      expect(allConfigs).toHaveLength(0);
    });

    it('should handle duplicate strategy IDs', async () => {
      const strategies: PerStrategyConfig[] = [
        {
          strategyId: 'duplicate',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
        {
          strategyId: 'duplicate',
          type: 'mean-reversion',
          enabled: true,
          params: { lookbackPeriod: 20 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(strategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      // Should return the first matching strategy
      const config = configManager.getStrategyConfig('duplicate');
      expect(config).not.toBeNull();
      expect(config?.type).toBe('arbitrage'); // First one wins
    });
  });

  describe('Config Modification', () => {
    it('should support modifying strategy config at runtime', async () => {
      const initialStrategies: PerStrategyConfig[] = [
        {
          strategyId: 'modifiable',
          type: 'arbitrage',
          enabled: true,
          params: { minProfitBps: 50 },
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(initialStrategies, null, 2));
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      configManager = ConfigManager.getInstance();
      await configManager.reloadConfig();

      // Modify the config
      const modifiedStrategies: PerStrategyConfig[] = [
        {
          strategyId: 'modifiable',
          type: 'arbitrage',
          enabled: false, // Changed
          params: { minProfitBps: 100 }, // Changed
        },
      ];

      fs.writeFileSync(strategyPath, JSON.stringify(modifiedStrategies, null, 2));
      await configManager.reloadConfig();

      const config = configManager.getStrategyConfig('modifiable');
      expect(config).not.toBeNull();
      expect(config?.enabled).toBe(false);
      expect(config?.params).toHaveProperty('minProfitBps', 100);
    });
  });
});
