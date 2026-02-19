#!/usr/bin/env tsx
/**
 * Strategy Hot-Reload Example
 * 
 * Demonstrates how to use the StrategyManager for hot-reloading strategies.
 * 
 * Usage:
 *   npm run example:hotreload
 * 
 * This example:
 * 1. Loads multiple strategies
 * 2. Enables file watching
 * 3. Listens for hot-reload events
 * 4. Demonstrates manual reload
 */

import { StrategyManager } from '../src/trading/strategies/StrategyManager';
import { registerStrategies } from '../src/trading/strategies';
import type { StrategyConfig } from '../src/trading/strategies/types';
import { logger } from '../src/utils/logger';

async function main() {
  // Register all built-in strategies
  registerStrategies();

  // Create strategy manager with hot-reload enabled
  const manager = new StrategyManager({
    watchEnabled: true,
    autoReload: true,
    debounceDelayMs: 500,
  });

  // Listen for hot-reload events
  manager.on('strategyLoaded', (event) => {
    console.log('✅ Strategy loaded:', event);
  });

  manager.on('strategyReloaded', (event) => {
    console.log('🔄 Strategy reloaded:', event);
  });

  manager.on('strategyUnloaded', (event) => {
    console.log('❌ Strategy unloaded:', event);
  });

  manager.on('strategyError', (event) => {
    console.error('⚠️  Strategy error:', event);
  });

  manager.on('fileChanged', (event) => {
    console.log('📝 File changed:', event.filename);
  });

  manager.on('reloadRecommended', (event) => {
    console.log('💡 Reload recommended:', event);
  });

  // Example strategy configurations
  const configs: StrategyConfig[] = [
    {
      strategyId: 'arbitrage-1',
      type: 'arbitrage',
      enabled: true,
      params: {
        minProfitBps: 50,
        feeRate: 0.02,
        maxOrderSize: 100,
      },
    },
    {
      strategyId: 'mean-reversion-1',
      type: 'mean-reversion',
      enabled: true,
      params: {
        lookbackPeriod: 20,
        entryThreshold: 2.0,
        exitThreshold: 0.5,
      },
    },
    {
      strategyId: 'market-making-1',
      type: 'market-making',
      enabled: true,
      params: {
        spreadBps: 100,
        orderSize: 10,
      },
    },
  ];

  console.log('Loading strategies...');
  const strategies = await manager.loadStrategies(configs);
  console.log(`Loaded ${strategies.size} strategies`);

  // List all loaded strategies
  console.log('\n📊 Loaded Strategies:');
  for (const [id, strategy] of strategies) {
    console.log(`  - ${id}: ${strategy.name} v${strategy.version}`);
  }

  console.log('\n👀 File watching active. Monitoring for changes...');
  console.log('   Edit strategy files in apps/backend/src/trading/strategies/');
  console.log('   Changes will be detected and reload will be recommended.');

  console.log('\n💡 Commands:');
  console.log('   Press "r" to manually reload a strategy');
  console.log('   Press "l" to list strategies');
  console.log('   Press "s" to show strategy details');
  console.log('   Press "q" to quit\n');

  // Simple interactive CLI
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (key: string) => {
    if (key === '\u0003' || key === 'q') {
      // Ctrl+C or 'q'
      console.log('\nShutting down...');
      await manager.cleanup();
      process.exit(0);
    } else if (key === 'r') {
      // Reload
      console.log('\nReloading arbitrage-1...');
      try {
        await manager.reloadStrategy('arbitrage-1');
        console.log('✅ Reload successful');
      } catch (error) {
        console.error('❌ Reload failed:', error);
      }
    } else if (key === 'l') {
      // List
      console.log('\n📊 Current Strategies:');
      const instances = manager.getAllStrategyInstances();
      for (const [id, instance] of instances) {
        console.log(`  - ${id}: ${instance.strategy.name} (reloaded ${instance.reloadCount} times)`);
      }
    } else if (key === 's') {
      // Show details
      console.log('\n📋 Strategy Details:');
      const instances = manager.getAllStrategyInstances();
      for (const [id, instance] of instances) {
        console.log(`\n  ${id}:`);
        console.log(`    Type: ${instance.config.type}`);
        console.log(`    Name: ${instance.strategy.name}`);
        console.log(`    Version: ${instance.strategy.version}`);
        console.log(`    Enabled: ${instance.config.enabled}`);
        console.log(`    Loaded: ${instance.loadedAt.toISOString()}`);
        console.log(`    Reload Count: ${instance.reloadCount}`);
        
        const metrics = instance.strategy.getMetrics?.();
        if (metrics) {
          console.log(`    Metrics:`, metrics);
        }
      }
    }
  });

  // Handle stdin errors
  process.stdin.on('error', (error) => {
    console.error('stdin error:', error);
    manager.cleanup().finally(() => process.exit(1));
  });

  // Keep process alive
  console.log('Running... (Press "q" to quit)');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
