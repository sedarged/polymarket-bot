/**
 * Strategy Manager Integration Tests
 * 
 * Tests for end-to-end hot-reload scenarios:
 * - File watching with real file changes
 * - Strategy reload with multiple strategies
 * - Integration with ConfigManager
 * - Real-world scenario: edit strategy file and reload
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StrategyManager } from '../../src/trading/strategies/StrategyManager';
import { StrategyFactory } from '../../src/trading/strategies/StrategyFactory';
import { RandomStrategy } from '../../src/trading/strategies/RandomStrategy';
import type { StrategyConfig } from '../../src/trading/strategies/types';

// Helper to wait for file watcher to process changes
const waitForFileEvent = (ms: number = 600) => new Promise(resolve => setTimeout(resolve, ms));

describe('StrategyManager Integration', () => {
  let manager: StrategyManager;
  let testDir: string;

  beforeEach(() => {
    // Create test directory for file watching
    testDir = path.join(process.cwd(), 'tmp', 'integration-test-strategies', Date.now().toString());
    fs.mkdirSync(testDir, { recursive: true });

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
    
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    
    StrategyFactory.clear();
  });

  describe('File Watching Integration', () => {
    it('should detect file changes and emit event', async () => {
      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: testDir,
        autoReload: false, // Manual control for testing
        debounceDelayMs: 200,
      });

      // Load a strategy first
      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: { buyProbability: 0.3 },
      };
      await manager.loadStrategy(config);

      // Start watching
      await manager.startWatching();
      expect(manager.isWatchingActive()).toBe(true);

      // Setup event listener
      const fileChanges: string[] = [];
      manager.on('fileChanged', (event: { filename: string }) => {
        fileChanges.push(event.filename);
      });

      // Create a test strategy file
      const testFile = path.join(testDir, 'TestStrategy.ts');
      fs.writeFileSync(testFile, '// Initial content');

      // Wait for initial file creation to settle
      await waitForFileEvent();

      // Modify the file
      fs.writeFileSync(testFile, '// Modified content');

      // Wait for file watcher to detect change
      await waitForFileEvent();

      // Should have detected the change
      expect(fileChanges.length).toBeGreaterThan(0);
      expect(fileChanges.some(f => f.includes('TestStrategy.ts'))).toBe(true);
    });

    it('should ignore non-TypeScript files', async () => {
      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: testDir,
        autoReload: false,
        debounceDelayMs: 200,
      });

      await manager.startWatching();

      const fileChanges: string[] = [];
      manager.on('fileChanged', (event: { filename: string }) => {
        fileChanges.push(event.filename);
      });

      // Create non-TS files
      fs.writeFileSync(path.join(testDir, 'readme.md'), 'test');
      fs.writeFileSync(path.join(testDir, 'config.json'), '{}');

      await waitForFileEvent();

      // Should not have detected these files
      expect(fileChanges.length).toBe(0);
    });

    it('should ignore test files', async () => {
      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: testDir,
        autoReload: false,
        debounceDelayMs: 200,
      });

      await manager.startWatching();

      const fileChanges: string[] = [];
      manager.on('fileChanged', (event: { filename: string }) => {
        fileChanges.push(event.filename);
      });

      // Create test file
      fs.writeFileSync(path.join(testDir, 'MyStrategy.test.ts'), 'test content');

      await waitForFileEvent();

      // Should not have detected test file
      expect(fileChanges.length).toBe(0);
    });
  });

  describe('Multi-Strategy Management', () => {
    it('should manage multiple strategies independently', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const configs: StrategyConfig[] = [
        {
          strategyId: 'strategy-1',
          type: 'random',
          enabled: true,
          params: { buyProbability: 0.3 },
        },
        {
          strategyId: 'strategy-2',
          type: 'random',
          enabled: true,
          params: { buyProbability: 0.5 },
        },
        {
          strategyId: 'strategy-3',
          type: 'random',
          enabled: true,
          params: { buyProbability: 0.4 },
        },
      ];

      await manager.loadStrategies(configs);

      // All strategies should be loaded
      const allStrategies = manager.getAllStrategies();
      expect(allStrategies.size).toBe(3);

      // Reload one strategy
      await manager.reloadStrategy('strategy-2');

      // Other strategies should be unaffected
      const instance1 = manager.getStrategyInstance('strategy-1');
      const instance2 = manager.getStrategyInstance('strategy-2');
      const instance3 = manager.getStrategyInstance('strategy-3');

      expect(instance1?.reloadCount).toBe(0);
      expect(instance2?.reloadCount).toBe(1);
      expect(instance3?.reloadCount).toBe(0);
    });

    it('should unload strategy without affecting others', async () => {
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

      // Unload one
      await manager.unloadStrategy('strategy-1');

      // Strategy 1 should be gone, strategy 2 should remain
      expect(manager.getStrategy('strategy-1')).toBeUndefined();
      expect(manager.getStrategy('strategy-2')).toBeDefined();
    });
  });

  describe('Reload with State Tracking', () => {
    it('should track reload count across multiple reloads', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: { buyProbability: 0.3 },
      };

      await manager.loadStrategy(config);

      // Reload multiple times
      await manager.reloadStrategy('test-strategy');
      await manager.reloadStrategy('test-strategy');
      await manager.reloadStrategy('test-strategy');

      const instance = manager.getStrategyInstance('test-strategy');
      expect(instance?.reloadCount).toBe(3);
    });

    it('should maintain history of previous instance (not full chain)', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: { buyProbability: 0.3 },
      };

      await manager.loadStrategy(config);

      // First reload
      await manager.reloadStrategy('test-strategy', {
        ...config,
        params: { buyProbability: 0.4 },
      });

      // Second reload
      await manager.reloadStrategy('test-strategy', {
        ...config,
        params: { buyProbability: 0.5 },
      });

      const current = manager.getStrategyInstance('test-strategy');
      expect(current?.config.params.buyProbability).toBe(0.5);
      expect(current?.previousInstance).toBeDefined();
      expect(current?.previousInstance?.config.params.buyProbability).toBe(0.4);
      
      // Chain is intentionally broken to prevent memory leak
      // Only immediate previous instance is kept
      expect(current?.previousInstance?.previousInstance).toBeUndefined();
    });
  });

  describe('Event Emissions', () => {
    it('should emit all lifecycle events', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const events: { type: string; data: unknown }[] = [];

      manager.on('strategyLoaded', (data) => events.push({ type: 'loaded', data }));
      manager.on('strategyReloaded', (data) => events.push({ type: 'reloaded', data }));
      manager.on('strategyUnloaded', (data) => events.push({ type: 'unloaded', data }));
      manager.on('strategyError', (data) => events.push({ type: 'error', data }));

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: {},
      };

      // Load
      await manager.loadStrategy(config);
      expect(events.filter(e => e.type === 'loaded').length).toBe(1);

      // Reload
      await manager.reloadStrategy('test-strategy');
      expect(events.filter(e => e.type === 'reloaded').length).toBe(1);

      // Unload
      await manager.unloadStrategy('test-strategy');
      expect(events.filter(e => e.type === 'unloaded').length).toBe(1);

      // Error (try to reload non-existent)
      try {
        await manager.reloadStrategy('nonexistent');
      } catch {
        // Expected to throw
      }
      // No error event for "not found" - it throws directly
    });
  });

  describe('Error Recovery', () => {
    it('should continue working after failed reload', async () => {
      manager = new StrategyManager({ watchEnabled: false });

      const config: StrategyConfig = {
        strategyId: 'test-strategy',
        type: 'random',
        enabled: true,
        params: { buyProbability: 0.3 },
      };

      await manager.loadStrategy(config);

      // Try to reload with bad config
      const badConfig: StrategyConfig = {
        ...config,
        type: 'nonexistent',
      };

      await expect(
        manager.reloadStrategy('test-strategy', badConfig)
      ).rejects.toThrow();

      // Manager should still work
      const strategy = manager.getStrategy('test-strategy');
      expect(strategy).toBeDefined();

      // Should be able to reload with good config
      const goodConfig: StrategyConfig = {
        ...config,
        params: { buyProbability: 0.5 },
      };

      await expect(
        manager.reloadStrategy('test-strategy', goodConfig)
      ).resolves.not.toThrow();

      const instance = manager.getStrategyInstance('test-strategy');
      expect(instance?.config.params.buyProbability).toBe(0.5);
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should cleanup all resources properly', async () => {
      manager = new StrategyManager({
        watchEnabled: true,
        watchDirectory: testDir,
      });

      // Load strategies
      const configs: StrategyConfig[] = [
        { strategyId: 'strategy-1', type: 'random', enabled: true, params: {} },
        { strategyId: 'strategy-2', type: 'random', enabled: true, params: {} },
      ];

      await manager.loadStrategies(configs);
      await manager.startWatching();

      expect(manager.isWatchingActive()).toBe(true);
      expect(manager.getAllStrategies().size).toBe(2);

      // Cleanup
      await manager.cleanup();

      // Everything should be cleaned up
      expect(manager.isWatchingActive()).toBe(false);
      expect(manager.getAllStrategies().size).toBe(0);
    });
  });
});
