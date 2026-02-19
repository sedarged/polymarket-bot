/**
 * StrategyManager Tests
 * 
 * Tests for hot-reload functionality:
 * - Strategy loading and lifecycle
 * - Hot-reload with state preservation
 * - File watching and auto-reload
 * - Error handling and rollback
 * - Event emissions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StrategyManager } from '../../src/trading/strategies/StrategyManager';
import { StrategyFactory } from '../../src/trading/strategies/StrategyFactory';
import { RandomStrategy } from '../../src/trading/strategies/RandomStrategy';
import type { StrategyConfig } from '../../src/trading/strategies/types';

describe('StrategyManager', () => {
  let manager: StrategyManager;

  beforeEach(() => {
    // Register test strategy
    StrategyFactory.register({
      type: 'random',
      factory: () => new RandomStrategy(),
      description: 'Random test strategy',
      defaultConfig: {
        strategyId: '',
        type: 'random',
        enabled: true,
        params: {
          buyProbability: 0.3,
          sellProbability: 0.3,
          maxSize: 10,
        },
      },
    });
  });

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }
    StrategyFactory.clear();
  });

  describe('Strategy Loading', () => {
    it('should load a single strategy', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy-1',
        type: 'random',
        enabled: true,
        params: { buyProbability: 0.5 },
      };

      const strategy = await manager.loadStrategy(config);

      expect(strategy).toBeDefined();
      // Strategy ID comes from the class constructor, not config
      expect(strategy.id).toBe('random-strategy');
      expect(strategy.name).toBe('Random');
    });

    it('should load multiple strategies', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const configs: StrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'random',
          enabled: true,
          params: {},
        },
        {
          strategyId: 'strategy-2',
          type: 'random',
          enabled: true,
          params: {},
        },
      ];

      const strategies = await manager.loadStrategies(configs);

      expect(strategies.size).toBe(2);
      expect(strategies.has('strategy-1')).toBe(true);
      expect(strategies.has('strategy-2')).toBe(true);
    });

    it('should handle partial failures when loading strategies', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const configs: StrategyConfig[] = [
        {
          strategyId: 'valid-strategy',
          type: 'random',
          enabled: true,
          params: {},
        },
        {
          strategyId: 'invalid-strategy',
          type: 'nonexistent-type',
          enabled: true,
          params: {},
        },
      ];

      const strategies = await manager.loadStrategies(configs);

      // Should load the valid one, skip the invalid
      expect(strategies.size).toBe(1);
      expect(strategies.has('valid-strategy')).toBe(true);
    });

    it('should emit strategyLoaded event', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const loadedSpy = vi.fn();
      manager.on('strategyLoaded', loadedSpy);

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: {},
      };

      await manager.loadStrategy(config);

      expect(loadedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'test-strategy',
          version: expect.any(String),
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit strategyError event on load failure', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const errorSpy = vi.fn();
      manager.on('strategyError', errorSpy);

      const configs: StrategyConfig[] = [
        {
          strategyId: 'bad-strategy',
          type: 'nonexistent',
          enabled: true,
          params: {},
        },
      ];

      await manager.loadStrategies(configs);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'bad-strategy',
          error: expect.any(Error),
          context: 'load',
        })
      );
    });
  });

  describe('Strategy Retrieval', () => {
    beforeEach(async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: {},
      };

      await manager.loadStrategy(config);
    });

    it('should get a strategy by ID', () => {
      const strategy = manager.getStrategy('test-strategy');

      expect(strategy).toBeDefined();
      // Strategy ID comes from the class constructor, not config
      expect(strategy?.id).toBe('random-strategy');
    });

    it('should return undefined for non-existent strategy', () => {
      const strategy = manager.getStrategy('nonexistent');

      expect(strategy).toBeUndefined();
    });

    it('should get strategy instance with metadata', () => {
      const instance = manager.getStrategyInstance('test-strategy');

      expect(instance).toBeDefined();
      // Strategy ID comes from the class constructor, not config
      expect(instance?.strategy.id).toBe('random-strategy');
      expect(instance?.config).toBeDefined();
      expect(instance?.loadedAt).toBeInstanceOf(Date);
      expect(instance?.reloadCount).toBe(0);
    });

    it('should get all strategies', () => {
      const strategies = manager.getAllStrategies();

      expect(strategies.size).toBe(1);
      expect(strategies.has('test-strategy')).toBe(true);
    });

    it('should get all strategy instances', () => {
      const instances = manager.getAllStrategyInstances();

      expect(instances.size).toBe(1);
      expect(instances.get('test-strategy')).toBeDefined();
    });
  });

  describe('Strategy Reload', () => {
    beforeEach(async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: { buyProbability: 0.3 },
      };

      await manager.loadStrategy(config);
    });

    it('should reload a strategy with same config', async () => {
      const strategy = await manager.reloadStrategy('test-strategy');

      expect(strategy).toBeDefined();
      // Strategy ID comes from the class constructor, not config
      expect(strategy.id).toBe('random-strategy');

      const instance = manager.getStrategyInstance('test-strategy');
      expect(instance?.reloadCount).toBe(1);
    });

    it('should reload a strategy with new config', async () => {
      const newConfig: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: { buyProbability: 0.5, sellProbability: 0.2 },
      };

      const strategy = await manager.reloadStrategy('test-strategy', newConfig);

      expect(strategy).toBeDefined();

      const instance = manager.getStrategyInstance('test-strategy');
      expect(instance?.config.params.buyProbability).toBe(0.5);
      expect(instance?.config.params.sellProbability).toBe(0.2);
    });

    it('should preserve previous instance on reload', async () => {
      await manager.reloadStrategy('test-strategy');

      const instance = manager.getStrategyInstance('test-strategy');
      expect(instance?.previousInstance).toBeDefined();
      expect(instance?.previousInstance?.reloadCount).toBe(0);
    });

    it('should emit strategyReloaded event', async () => {
      const reloadedSpy = vi.fn();
      manager.on('strategyReloaded', reloadedSpy);

      await manager.reloadStrategy('test-strategy');

      expect(reloadedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'test-strategy',
          oldVersion: expect.any(String),
          newVersion: expect.any(String),
          reloadCount: 1,
          timestamp: expect.any(String),
        })
      );
    });

    it('should throw error when reloading non-existent strategy', async () => {
      await expect(
        manager.reloadStrategy('nonexistent')
      ).rejects.toThrow('Strategy nonexistent not found');
    });

    it('should rollback on reload failure', async () => {
      const badConfig: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'nonexistent-type',
        enabled: true,
        params: {},
      };

      await expect(
        manager.reloadStrategy('test-strategy', badConfig)
      ).rejects.toThrow();

      // Original strategy should still be active
      const strategy = manager.getStrategy('test-strategy');
      expect(strategy).toBeDefined();
      // Strategy ID comes from the class constructor, not config
      expect(strategy?.id).toBe('random-strategy');
    });

    it('should emit strategyError event on reload failure', async () => {
      const errorSpy = vi.fn();
      manager.on('strategyError', errorSpy);

      const badConfig: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'nonexistent',
        enabled: true,
        params: {},
      };

      await expect(
        manager.reloadStrategy('test-strategy', badConfig)
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'test-strategy',
          error: expect.any(Error),
          context: 'reload',
        })
      );
    });
  });

  describe('Strategy Unload', () => {
    beforeEach(async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: {},
      };

      await manager.loadStrategy(config);
    });

    it('should unload a strategy', async () => {
      await manager.unloadStrategy('test-strategy');

      const strategy = manager.getStrategy('test-strategy');
      expect(strategy).toBeUndefined();
    });

    it('should emit strategyUnloaded event', async () => {
      const unloadedSpy = vi.fn();
      manager.on('strategyUnloaded', unloadedSpy);

      await manager.unloadStrategy('test-strategy');

      expect(unloadedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'test-strategy',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle unloading non-existent strategy gracefully', async () => {
      await expect(
        manager.unloadStrategy('nonexistent')
      ).resolves.not.toThrow();
    });
  });

  describe('File Watching', () => {
    it('should start watching when enabled', async () => {
      const tmpDir = path.join(process.cwd(), 'tmp', 'test-strategies');
      fs.mkdirSync(tmpDir, { recursive: true });

      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: tmpDir,
        autoReload: false,
      });

      await manager.startWatching();

      expect(manager.isWatchingActive()).toBe(true);

      // Cleanup
      await manager.stopWatching();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should stop watching', async () => {
      const tmpDir = path.join(process.cwd(), 'tmp', 'test-strategies');
      fs.mkdirSync(tmpDir, { recursive: true });

      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: tmpDir,
      });

      await manager.startWatching();
      expect(manager.isWatchingActive()).toBe(true);

      await manager.stopWatching();
      expect(manager.isWatchingActive()).toBe(false);

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should emit watchingStarted event', async () => {
      const tmpDir = path.join(process.cwd(), 'tmp', 'test-strategies');
      fs.mkdirSync(tmpDir, { recursive: true });

      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: tmpDir,
      });

      const startedSpy = vi.fn();
      manager.on('watchingStarted', startedSpy);

      await manager.startWatching();

      expect(startedSpy).toHaveBeenCalled();

      // Cleanup
      await manager.stopWatching();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should emit watchingStopped event', async () => {
      const tmpDir = path.join(process.cwd(), 'tmp', 'test-strategies');
      fs.mkdirSync(tmpDir, { recursive: true });

      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: tmpDir,
      });

      await manager.startWatching();

      const stoppedSpy = vi.fn();
      manager.on('watchingStopped', stoppedSpy);

      await manager.stopWatching();

      expect(stoppedSpy).toHaveBeenCalled();

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should not start watching if already active', async () => {
      const tmpDir = path.join(process.cwd(), 'tmp', 'test-strategies');
      fs.mkdirSync(tmpDir, { recursive: true });

      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: tmpDir,
      });

      await manager.startWatching();

      const startedSpy = vi.fn();
      manager.on('watchingStarted', startedSpy);

      await manager.startWatching(); // Second call

      expect(startedSpy).not.toHaveBeenCalled();

      // Cleanup
      await manager.stopWatching();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should warn if watching not enabled', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      // Should not throw, just warn
      await expect(manager.startWatching()).resolves.not.toThrow();
      expect(manager.isWatchingActive()).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all strategies', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const configs: StrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'random',
          enabled: true,
          params: {},
        },
        {
          strategyId: 'strategy-2',
          type: 'random',
          enabled: true,
          params: {},
        },
      ];

      await manager.loadStrategies(configs);

      await manager.cleanup();

      const strategies = manager.getAllStrategies();
      expect(strategies.size).toBe(0);
    });

    it('should stop watching on cleanup', async () => {
      const tmpDir = path.join(process.cwd(), 'tmp', 'test-strategies');
      fs.mkdirSync(tmpDir, { recursive: true });

      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: tmpDir,
      });

      await manager.startWatching();
      expect(manager.isWatchingActive()).toBe(true);

      await manager.cleanup();
      expect(manager.isWatchingActive()).toBe(false);

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should call cleanup on all strategies', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: {},
      };

      await manager.loadStrategy(config);

      const strategy = manager.getStrategy('test-strategy');
      const cleanupSpy = vi.spyOn(strategy!, 'cleanup');

      await manager.cleanup();

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      manager = new StrategyManager();

      expect(manager.isWatchingActive()).toBe(false);
    });

    it('should use provided configuration', () => {
      manager = new StrategyManager({
        watchEnabled: true,
        debounceDelayMs: 1000,
        autoReload: false,
      });

      // Configuration is applied
      expect(manager).toBeDefined();
    });
  });
});
