/**
 * Unit tests for ConfigManager (GAP-003)
 * 
 * Tests CRUD operations, validation, and error handling for configuration management.
 * File watching and hot-reload are tested in integration tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../src/config/configManager';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(process.cwd(), '.test-config');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Get fresh instance for each test
    configManager = ConfigManager.getInstance();
  });

  afterEach(async () => {
    // Clean up
    await configManager.destroy();

    // Remove test directory
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testDir, file));
      }
      fs.rmdirSync(testDir);
    }

    // Clean up environment variables
    delete process.env.MARKETS_CONFIG_PATH;
    delete process.env.STRATEGY_CONFIG_PATH;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigManager.getInstance();
      const instance2 = ConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('gammaApiUrl');
      expect(config).toHaveProperty('clobApiUrl');
      expect(config).toHaveProperty('liveTrading');
    });

    it('should return a copy of configuration', () => {
      const config1 = configManager.getConfig();
      const config2 = configManager.getConfig();
      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same content
    });
  });

  describe('getConfigFile', () => {
    it('should return null if config file is not set', async () => {
      const result = await configManager.getConfigFile('markets');
      expect(result).toBeNull();
    });

    it('should return config file if it exists', async () => {
      // Create a test markets config
      const marketsPath = path.join(testDir, 'markets.json');
      const marketsData = [
        { tokenId: 'test-token-1', maxPositionSize: 100, spread: 0.01 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(marketsData, null, 2));
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      // Reload config to pick up the new file
      await configManager.reloadConfig();

      const result = await configManager.getConfigFile('markets');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('markets');
      expect(result?.path).toBe(marketsPath);
      expect(result?.content).toEqual(marketsData);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid markets configuration', () => {
      const validMarkets = [
        { tokenId: 'token-1', maxPositionSize: 100, spread: 0.01 },
        { tokenId: 'token-2', maxPositionSize: 200 },
      ];
      const result = configManager.validateConfig('markets', validMarkets);
      expect(result.success).toBe(true);
    });

    it('should reject invalid markets configuration - empty token ID', () => {
      const invalidMarkets = [
        { tokenId: '', maxPositionSize: 100 },
      ];
      const result = configManager.validateConfig('markets', invalidMarkets);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should reject invalid markets configuration - negative position size', () => {
      const invalidMarkets = [
        { tokenId: 'token-1', maxPositionSize: -100 },
      ];
      const result = configManager.validateConfig('markets', invalidMarkets);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject invalid markets configuration - spread > 1', () => {
      const invalidMarkets = [
        { tokenId: 'token-1', spread: 1.5 },
      ];
      const result = configManager.validateConfig('markets', invalidMarkets);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should validate valid strategy configuration', () => {
      const validStrategy = {
        spread: 0.02,
        maxPositionSize: 500,
        inventorySkew: true,
      };
      const result = configManager.validateConfig('strategy', validStrategy);
      expect(result.success).toBe(true);
    });

    it('should reject invalid strategy configuration - spread > 1', () => {
      const invalidStrategy = {
        spread: 1.5,
      };
      const result = configManager.validateConfig('strategy', invalidStrategy);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject invalid strategy configuration - negative position size', () => {
      const invalidStrategy = {
        maxPositionSize: -100,
      };
      const result = configManager.validateConfig('strategy', invalidStrategy);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('updateConfigFile', () => {
    it('should update markets configuration file', async () => {
      const marketsPath = path.join(testDir, 'markets.json');
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      const marketsData = [
        { tokenId: 'token-1', maxPositionSize: 100, spread: 0.01 },
      ];

      const result = await configManager.updateConfigFile('markets', marketsData);
      expect(result.success).toBe(true);

      // Verify file was created
      expect(fs.existsSync(marketsPath)).toBe(true);

      // Verify content
      const fileContent = JSON.parse(fs.readFileSync(marketsPath, 'utf-8'));
      expect(fileContent).toEqual(marketsData);
    });

    it('should update strategy configuration file', async () => {
      const strategyPath = path.join(testDir, 'strategy.json');
      process.env.STRATEGY_CONFIG_PATH = strategyPath;

      const strategyData = {
        spread: 0.02,
        maxPositionSize: 500,
        inventorySkew: true,
      };

      const result = await configManager.updateConfigFile('strategy', strategyData);
      expect(result.success).toBe(true);

      // Verify file was created
      expect(fs.existsSync(strategyPath)).toBe(true);

      // Verify content
      const fileContent = JSON.parse(fs.readFileSync(strategyPath, 'utf-8'));
      expect(fileContent).toEqual(strategyData);
    });

    it('should reject invalid configuration', async () => {
      const marketsPath = path.join(testDir, 'markets.json');
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      const invalidMarkets = [
        { tokenId: '', maxPositionSize: 100 }, // Empty token ID
      ];

      const result = await configManager.updateConfigFile('markets', invalidMarkets);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);

      // Verify file was NOT created
      expect(fs.existsSync(marketsPath)).toBe(false);
    });

    it('should return error if config path is not set', async () => {
      delete process.env.MARKETS_CONFIG_PATH;

      const marketsData = [
        { tokenId: 'token-1', maxPositionSize: 100 },
      ];

      const result = await configManager.updateConfigFile('markets', marketsData);
      expect(result.success).toBe(false);
      expect(result.message).toContain('MARKETS_CONFIG_PATH');
    });

    it('should create directory if it does not exist', async () => {
      const nestedPath = path.join(testDir, 'nested', 'dir', 'markets.json');
      process.env.MARKETS_CONFIG_PATH = nestedPath;

      const marketsData = [
        { tokenId: 'token-1', maxPositionSize: 100 },
      ];

      const result = await configManager.updateConfigFile('markets', marketsData);
      expect(result.success).toBe(true);
      expect(fs.existsSync(nestedPath)).toBe(true);

      // Clean up nested directory
      fs.unlinkSync(nestedPath);
      fs.rmdirSync(path.join(testDir, 'nested', 'dir'));
      fs.rmdirSync(path.join(testDir, 'nested'));
    });
  });

  describe('deleteConfigFile', () => {
    it('should delete existing config file', async () => {
      const marketsPath = path.join(testDir, 'markets.json');
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      // Create file first
      const marketsData = [
        { tokenId: 'token-1', maxPositionSize: 100 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(marketsData, null, 2));

      // Delete it
      const result = await configManager.deleteConfigFile('markets');
      expect(result.success).toBe(true);
      expect(fs.existsSync(marketsPath)).toBe(false);
    });

    it('should return error if file does not exist', async () => {
      const marketsPath = path.join(testDir, 'markets.json');
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      const result = await configManager.deleteConfigFile('markets');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return error if config path is not set', async () => {
      delete process.env.MARKETS_CONFIG_PATH;

      const result = await configManager.deleteConfigFile('markets');
      expect(result.success).toBe(false);
      expect(result.message).toContain('MARKETS_CONFIG_PATH');
    });
  });

  describe('reloadConfig', () => {
    it('should reload configuration successfully', async () => {
      await expect(configManager.reloadConfig()).resolves.not.toThrow();
    });

    it('should emit configReloading and configChanged events', async () => {
      const reloadingListener = vi.fn();
      const changedListener = vi.fn();

      configManager.on('configReloading', reloadingListener);
      configManager.on('configChanged', changedListener);

      await configManager.reloadConfig();

      expect(reloadingListener).toHaveBeenCalledTimes(1);
      expect(changedListener).toHaveBeenCalledTimes(1);

      configManager.off('configReloading', reloadingListener);
      configManager.off('configChanged', changedListener);
    });

    it('should update config with new values from file', async () => {
      const marketsPath = path.join(testDir, 'markets.json');
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      // Create markets file
      const marketsData = [
        { tokenId: 'new-token', maxPositionSize: 200 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(marketsData, null, 2));

      // Reload config
      await configManager.reloadConfig();

      // Check that config was updated
      const config = configManager.getConfig();
      expect(config.markets).toBeDefined();
      expect(config.markets?.length).toBe(1);
      expect(config.markets?.[0].tokenId).toBe('new-token');
    });
  });

  describe('File Watching', () => {
    it('should not be watching initially', () => {
      expect(configManager.isWatchingActive()).toBe(false);
    });

    it('should start watching', async () => {
      await configManager.startWatching();
      expect(configManager.isWatchingActive()).toBe(true);
      await configManager.stopWatching();
    });

    it('should stop watching', async () => {
      await configManager.startWatching();
      await configManager.stopWatching();
      expect(configManager.isWatchingActive()).toBe(false);
    });

    it('should not start watching if already watching', async () => {
      await configManager.startWatching();
      // Should not throw or cause issues
      await configManager.startWatching();
      expect(configManager.isWatchingActive()).toBe(true);
      await configManager.stopWatching();
    });

    it('should emit watchingStarted event', async () => {
      const listener = vi.fn();
      configManager.on('watchingStarted', listener);

      await configManager.startWatching();
      expect(listener).toHaveBeenCalledTimes(1);

      configManager.off('watchingStarted', listener);
      await configManager.stopWatching();
    });

    it('should emit watchingStopped event', async () => {
      const listener = vi.fn();
      configManager.on('watchingStopped', listener);

      await configManager.startWatching();
      await configManager.stopWatching();
      expect(listener).toHaveBeenCalledTimes(1);

      configManager.off('watchingStopped', listener);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in config file gracefully', async () => {
      const marketsPath = path.join(testDir, 'markets.json');
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      // Write invalid JSON
      fs.writeFileSync(marketsPath, 'invalid json {{{');

      // Should not throw, but log error
      await expect(configManager.reloadConfig()).resolves.not.toThrow();
    });

    it('should emit configError event on reload failure', async () => {
      const errorListener = vi.fn();
      configManager.on('configError', errorListener);

      // Force an error by setting invalid env var
      const originalEnv = process.env.RETRY_ATTEMPTS;
      process.env.RETRY_ATTEMPTS = 'invalid-number';

      await expect(configManager.reloadConfig()).rejects.toThrow();
      expect(errorListener).toHaveBeenCalledTimes(1);

      // Restore
      if (originalEnv !== undefined) {
        process.env.RETRY_ATTEMPTS = originalEnv;
      } else {
        delete process.env.RETRY_ATTEMPTS;
      }

      configManager.off('configError', errorListener);
    });
  });

  describe('Atomic File Operations', () => {
    it('should use atomic write (temp file + rename)', async () => {
      const marketsPath = path.join(testDir, 'markets.json');
      process.env.MARKETS_CONFIG_PATH = marketsPath;

      const marketsData = [
        { tokenId: 'token-1', maxPositionSize: 100 },
      ];

      await configManager.updateConfigFile('markets', marketsData);

      // Verify temp file was cleaned up
      const tempPath = `${marketsPath}.tmp`;
      expect(fs.existsSync(tempPath)).toBe(false);

      // Verify final file exists
      expect(fs.existsSync(marketsPath)).toBe(true);
    });
  });
});
