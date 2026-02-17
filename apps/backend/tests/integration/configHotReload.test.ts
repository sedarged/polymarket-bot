/**
 * Integration tests for Configuration Hot-Reload (GAP-003)
 * 
 * Tests runtime configuration reload without bot restart:
 * - File watching and automatic reload
 * - Configuration change detection
 * - Event emission on changes
 * - Debouncing of rapid changes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../src/config/configManager';

// Helper to wait for a specified time
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Configuration Hot-Reload Integration', () => {
  let configManager: ConfigManager;
  let testDir: string;
  let marketsPath: string;
  let strategyPath: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(process.cwd(), '.test-hotreload');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    marketsPath = path.join(testDir, 'markets.json');
    strategyPath = path.join(testDir, 'strategy.json');

    // Set environment variables
    process.env.MARKETS_CONFIG_PATH = marketsPath;
    process.env.STRATEGY_CONFIG_PATH = strategyPath;

    // Create initial config files
    const initialMarkets = [
      { tokenId: 'initial-token', maxPositionSize: 100 },
    ];
    const initialStrategy = {
      spread: 0.01,
      maxPositionSize: 500,
    };

    fs.writeFileSync(marketsPath, JSON.stringify(initialMarkets, null, 2));
    fs.writeFileSync(strategyPath, JSON.stringify(initialStrategy, null, 2));

    // Get fresh instance
    configManager = ConfigManager.getInstance();
  });

  afterEach(async () => {
    // Stop watching and clean up
    await configManager.destroy();

    // Remove test files
    if (fs.existsSync(marketsPath)) {
      fs.unlinkSync(marketsPath);
    }
    if (fs.existsSync(strategyPath)) {
      fs.unlinkSync(strategyPath);
    }

    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }

    // Clean up environment
    delete process.env.MARKETS_CONFIG_PATH;
    delete process.env.STRATEGY_CONFIG_PATH;
  });

  describe('File Change Detection', () => {
    it('should detect changes to markets config file', async () => {
      const changedListener = vi.fn();
      configManager.on('configChanged', changedListener);

      // Load initial config
      await configManager.reloadConfig();

      // Start watching
      await configManager.startWatching();

      // Wait for watcher to be ready
      await wait(100);

      // Modify the markets file
      const updatedMarkets = [
        { tokenId: 'updated-token', maxPositionSize: 200 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(updatedMarkets, null, 2));

      // Wait for file change event and debounce (500ms + extra buffer)
      await wait(800);

      // Verify event was emitted
      expect(changedListener).toHaveBeenCalled();

      // Verify config was updated
      const config = configManager.getConfig();
      expect(config.markets).toBeDefined();
      expect(config.markets?.[0].tokenId).toBe('updated-token');
      expect(config.markets?.[0].maxPositionSize).toBe(200);

      configManager.off('configChanged', changedListener);
      await configManager.stopWatching();
    });

    it('should detect changes to strategy config file', async () => {
      const changedListener = vi.fn();
      configManager.on('configChanged', changedListener);

      // Load initial config
      await configManager.reloadConfig();

      // Start watching
      await configManager.startWatching();
      await wait(100);

      // Modify the strategy file
      const updatedStrategy = {
        spread: 0.05,
        maxPositionSize: 1000,
        inventorySkew: true,
      };
      fs.writeFileSync(strategyPath, JSON.stringify(updatedStrategy, null, 2));

      // Wait for file change event and debounce
      await wait(800);

      // Verify event was emitted
      expect(changedListener).toHaveBeenCalled();

      // Verify config was updated
      const config = configManager.getConfig();
      expect(config.strategy).toBeDefined();
      expect(config.strategy?.spread).toBe(0.05);
      expect(config.strategy?.maxPositionSize).toBe(1000);
      expect(config.strategy?.inventorySkew).toBe(true);

      configManager.off('configChanged', changedListener);
      await configManager.stopWatching();
    });

    it('should emit fileChanged event with file details', async () => {
      const fileChangedListener = vi.fn();
      configManager.on('fileChanged', fileChangedListener);

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);

      // Modify the markets file
      const updatedMarkets = [
        { tokenId: 'test-token', maxPositionSize: 300 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(updatedMarkets, null, 2));

      // Wait for change detection
      await wait(800);

      // Verify fileChanged event was emitted with correct data
      expect(fileChangedListener).toHaveBeenCalled();
      const eventData = fileChangedListener.mock.calls[0][0];
      expect(eventData).toHaveProperty('path');
      expect(eventData).toHaveProperty('type');
      expect(eventData.type).toBe('markets');

      configManager.off('fileChanged', fileChangedListener);
      await configManager.stopWatching();
    });
  });

  describe('Debouncing', () => {
    it('should debounce rapid file changes', async () => {
      const changedListener = vi.fn();
      configManager.on('configChanged', changedListener);

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);

      // Clear any initial reload events
      changedListener.mockClear();

      // Make multiple rapid changes
      for (let i = 0; i < 5; i++) {
        const markets = [
          { tokenId: `token-${i}`, maxPositionSize: 100 + i },
        ];
        fs.writeFileSync(marketsPath, JSON.stringify(markets, null, 2));
        await wait(50); // Small delay between writes (less than debounce delay)
      }

      // Wait for debounce period to pass (debounce delay + buffer)
      await wait(ConfigManager.DEBOUNCE_DELAY_MS + 300);

      // Should only reload once or twice due to debouncing, definitely not 5 times
      // (File watchers may trigger slightly differently on different systems)
      expect(changedListener.mock.calls.length).toBeLessThan(5);
      expect(changedListener.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Verify final config has the last value
      const config = configManager.getConfig();
      expect(config.markets?.[0].tokenId).toBe('token-4');

      configManager.off('configChanged', changedListener);
      await configManager.stopWatching();
    });
  });

  describe('Multiple File Watching', () => {
    it('should watch both markets and strategy files simultaneously', async () => {
      const fileChangedListener = vi.fn();
      configManager.on('fileChanged', fileChangedListener);

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);

      // Change markets file
      const updatedMarkets = [
        { tokenId: 'markets-updated', maxPositionSize: 200 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(updatedMarkets, null, 2));
      await wait(800);

      // Change strategy file
      const updatedStrategy = {
        spread: 0.03,
        inventorySkew: false,
      };
      fs.writeFileSync(strategyPath, JSON.stringify(updatedStrategy, null, 2));
      await wait(800);

      // Both files should have triggered events
      expect(fileChangedListener).toHaveBeenCalledTimes(2);

      // Verify both configs were updated
      const config = configManager.getConfig();
      expect(config.markets?.[0].tokenId).toBe('markets-updated');
      expect(config.strategy?.spread).toBe(0.03);

      configManager.off('fileChanged', fileChangedListener);
      await configManager.stopWatching();
    });
  });

  describe('Error Recovery', () => {
    it('should handle invalid JSON in changed file gracefully', async () => {
      const changedListener = vi.fn();
      configManager.on('configChanged', changedListener);

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);

      // Write invalid JSON
      fs.writeFileSync(marketsPath, 'invalid json {{{');
      await wait(800);

      // Should still trigger config reload (with fallback to empty markets)
      expect(changedListener).toHaveBeenCalled();

      // Config should still be accessible (falls back to no markets)
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      // Markets should be undefined or empty due to invalid JSON
      expect(config.markets).toBeUndefined();

      configManager.off('configChanged', changedListener);
      await configManager.stopWatching();
    });

    it('should recover from error when valid config is restored', async () => {
      const changedListener = vi.fn();
      configManager.on('configChanged', changedListener);

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);

      // Write invalid JSON
      fs.writeFileSync(marketsPath, 'invalid json');
      await wait(800);
      // Should have triggered a reload (with fallback)
      expect(changedListener).toHaveBeenCalled();

      // Reset the listener count
      changedListener.mockClear();

      // Write valid JSON
      const validMarkets = [
        { tokenId: 'recovered-token', maxPositionSize: 100 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(validMarkets, null, 2));
      await wait(800);

      // Should successfully reload with valid config
      expect(changedListener).toHaveBeenCalled();
      const config = configManager.getConfig();
      expect(config.markets?.[0].tokenId).toBe('recovered-token');

      configManager.off('configChanged', changedListener);
      await configManager.stopWatching();
    });
  });

  describe('Watch Lifecycle', () => {
    it('should not reload config when watching is stopped', async () => {
      const changedListener = vi.fn();
      configManager.on('configChanged', changedListener);

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);

      // Clear any initial reload events
      changedListener.mockClear();

      // Stop watching - wait a bit longer for watchers to fully close
      await configManager.stopWatching();
      await wait(200);

      // Change file
      const updatedMarkets = [
        { tokenId: 'should-not-reload', maxPositionSize: 999 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(updatedMarkets, null, 2));
      await wait(800);

      // Should not have triggered reload after watching stopped
      expect(changedListener).not.toHaveBeenCalled();

      configManager.off('configChanged', changedListener);
    });

    it('should allow restarting watching after stop', async () => {
      const changedListener = vi.fn();
      configManager.on('configChanged', changedListener);

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);
      await configManager.stopWatching();

      // Restart watching
      await configManager.startWatching();
      await wait(100);

      // Change file
      const updatedMarkets = [
        { tokenId: 'restarted-token', maxPositionSize: 150 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(updatedMarkets, null, 2));
      await wait(800);

      // Should have triggered reload after restart
      expect(changedListener).toHaveBeenCalled();

      configManager.off('configChanged', changedListener);
      await configManager.stopWatching();
    });
  });

  describe('Event Order', () => {
    it('should emit configReloading before configChanged', async () => {
      const events: string[] = [];
      
      configManager.on('configReloading', () => {
        events.push('reloading');
      });
      configManager.on('configChanged', () => {
        events.push('changed');
      });

      await configManager.reloadConfig();
      await configManager.startWatching();
      await wait(100);

      // Change file
      const updatedMarkets = [
        { tokenId: 'event-order-test', maxPositionSize: 100 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(updatedMarkets, null, 2));
      await wait(800);

      // Verify event order
      expect(events.length).toBeGreaterThanOrEqual(2);
      const reloadingIndex = events.indexOf('reloading');
      const changedIndex = events.indexOf('changed');
      expect(reloadingIndex).toBeGreaterThanOrEqual(0);
      expect(changedIndex).toBeGreaterThan(reloadingIndex);

      await configManager.stopWatching();
    });
  });

  describe('Token ID Updates', () => {
    it('should update tokenIds array when markets config changes', async () => {
      await configManager.reloadConfig();
      const initialConfig = configManager.getConfig();
      expect(initialConfig.tokenIds).toContain('initial-token');

      await configManager.startWatching();
      await wait(100);

      // Change markets file with new tokens
      const updatedMarkets = [
        { tokenId: 'new-token-1', maxPositionSize: 100 },
        { tokenId: 'new-token-2', maxPositionSize: 200 },
      ];
      fs.writeFileSync(marketsPath, JSON.stringify(updatedMarkets, null, 2));
      await wait(800);

      // Verify tokenIds were updated
      const updatedConfig = configManager.getConfig();
      expect(updatedConfig.tokenIds).toHaveLength(2);
      expect(updatedConfig.tokenIds).toContain('new-token-1');
      expect(updatedConfig.tokenIds).toContain('new-token-2');
      expect(updatedConfig.tokenIds).not.toContain('initial-token');

      await configManager.stopWatching();
    });
  });
});
