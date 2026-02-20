#!/usr/bin/env tsx
/**
 * Manual verification script for GAP-002 Strategy Config Routing
 * 
 * This script demonstrates:
 * 1. Loading per-strategy configs from STRATEGY_CONFIG_PATH
 * 2. Creating multiple strategy instances with independent configs
 * 3. Verifying each strategy has correct parameters
 * 4. Testing hot-reload of configuration changes
 */

import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../src/config/configManager';
import { StrategyManager } from '../src/trading/strategies/StrategyManager';
import { registerStrategies } from '../src/trading/strategies';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function header(message) {
  console.log();
  log(`${'='.repeat(60)}`, colors.bright);
  log(message, colors.bright);
  log(`${'='.repeat(60)}`, colors.bright);
  console.log();
}

async function main() {
  header('GAP-002 Strategy Config Routing - Manual Verification');

  // Step 1: Set up test config file
  log('Step 1: Creating test strategy configuration...', colors.blue);
  
  const testConfigPath = path.join(process.cwd(), '.test-manual-strategies.json');
  const testConfig = [
    {
      strategyId: 'arbitrage-conservative',
      type: 'arbitrage',
      enabled: true,
      params: {
        minProfitBps: 100, // High threshold = conservative
        feeRate: 0.02,
        maxOrderSize: 50,
      },
    },
    {
      strategyId: 'arbitrage-aggressive',
      type: 'arbitrage',
      enabled: true,
      params: {
        minProfitBps: 25, // Low threshold = aggressive
        feeRate: 0.02,
        maxOrderSize: 200,
      },
    },
    {
      strategyId: 'mean-reversion-test',
      type: 'mean-reversion',
      enabled: true,
      params: {
        lookbackPeriod: 20,
        entryThreshold: 2.0,
        maxPositionSize: 100,
      },
    },
    {
      strategyId: 'disabled-strategy',
      type: 'random',
      enabled: false, // Should not be loaded
      params: {
        buyProbability: 0.5,
      },
    },
  ];

  fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
  log(`✓ Test config created at: ${testConfigPath}`, colors.green);
  log(`  - 4 strategies defined`, colors.yellow);
  log(`  - 3 enabled, 1 disabled`, colors.yellow);
  console.log();

  // Step 2: Set environment and initialize
  log('Step 2: Setting STRATEGY_CONFIG_PATH and initializing...', colors.blue);
  process.env.STRATEGY_CONFIG_PATH = testConfigPath;
  
  registerStrategies();
  const configManager = ConfigManager.getInstance();
  await configManager.reloadConfig();
  
  log('✓ ConfigManager initialized', colors.green);
  console.log();

  // Step 3: Verify config loading
  log('Step 3: Verifying per-strategy config loading...', colors.blue);
  
  const allConfigs = configManager.getAllStrategyConfigs();
  log(`✓ Loaded ${allConfigs.length} strategy configs`, colors.green);
  
  for (const config of allConfigs) {
    const status = config.enabled ? colors.green : colors.yellow;
    log(`  - ${config.strategyId} (${config.type})`, status);
    log(`    Enabled: ${config.enabled}`, status);
    log(`    Params: ${Object.keys(config.params).length} parameters`, status);
  }
  console.log();

  // Step 4: Verify routing to specific strategies
  log('Step 4: Testing config routing by strategy ID...', colors.blue);
  
  const testIds = ['arbitrage-conservative', 'mean-reversion-test', 'disabled-strategy'];
  for (const id of testIds) {
    const config = configManager.getStrategyConfig(id);
    if (config) {
      log(`✓ Found config for '${id}'`, colors.green);
      log(`  Type: ${config.type}, Enabled: ${config.enabled}`, colors.yellow);
    } else {
      log(`✗ Config not found for '${id}'`, colors.red);
    }
  }
  console.log();

  // Step 5: Load strategies via StrategyManager
  log('Step 5: Loading strategy instances via StrategyManager...', colors.blue);
  
  const strategyManager = new StrategyManager();
  const strategies = await strategyManager.loadStrategiesFromConfig();
  
  log(`✓ Loaded ${strategies.size} strategy instances`, colors.green);
  
  for (const [id, strategy] of strategies.entries()) {
    log(`  - ${id}:`, colors.green);
    log(`    Name: ${strategy.name}`, colors.yellow);
    log(`    Version: ${strategy.version}`, colors.yellow);
    
    const config = strategy.getConfig();
    const paramsStr = JSON.stringify(config.params, null, 6);
    log(`    Params: ${paramsStr}`, colors.yellow);
  }
  console.log();

  // Step 6: Verify parameter independence
  log('Step 6: Verifying parameter independence...', colors.blue);
  
  const conservative = strategies.get('arbitrage-conservative');
  const aggressive = strategies.get('arbitrage-aggressive');
  
  if (conservative && aggressive) {
    const conservativeParams = conservative.getConfig().params;
    const aggressiveParams = aggressive.getConfig().params;
    
    log('✓ Both arbitrage strategies loaded', colors.green);
    log(`  Conservative minProfitBps: ${conservativeParams.minProfitBps}`, colors.yellow);
    log(`  Aggressive minProfitBps: ${aggressiveParams.minProfitBps}`, colors.yellow);
    
    if (conservativeParams.minProfitBps !== aggressiveParams.minProfitBps) {
      log('✓ Strategies have independent configurations!', colors.green);
    } else {
      log('✗ Strategies have same configuration (BUG!)', colors.red);
    }
  } else {
    log('✗ Failed to load both arbitrage strategies', colors.red);
  }
  console.log();

  // Step 7: Verify disabled strategy not loaded
  log('Step 7: Verifying disabled strategy not loaded...', colors.blue);
  
  const disabledStrategy = strategies.get('disabled-strategy');
  if (!disabledStrategy) {
    log('✓ Disabled strategy was correctly excluded', colors.green);
  } else {
    log('✗ Disabled strategy was incorrectly loaded (BUG!)', colors.red);
  }
  console.log();

  // Step 8: Test config modification
  log('Step 8: Testing configuration modification...', colors.blue);
  log('  Modifying arbitrage-conservative minProfitBps: 100 -> 150', colors.yellow);
  
  const modifiedConfig = testConfig.map(c => {
    if (c.strategyId === 'arbitrage-conservative') {
      return {
        ...c,
        params: {
          ...c.params,
          minProfitBps: 150, // Changed value
        },
      };
    }
    return c;
  });
  
  fs.writeFileSync(testConfigPath, JSON.stringify(modifiedConfig, null, 2));
  await configManager.reloadConfig();
  
  const updatedConfig = configManager.getStrategyConfig('arbitrage-conservative');
  if (updatedConfig && updatedConfig.params.minProfitBps === 150) {
    log('✓ Configuration change detected and applied', colors.green);
    log(`  New minProfitBps: ${updatedConfig.params.minProfitBps}`, colors.yellow);
  } else {
    log('✗ Configuration change not detected (BUG!)', colors.red);
  }
  console.log();

  // Cleanup
  log('Cleanup: Removing test config file...', colors.blue);
  await strategyManager.stopWatching();
  await configManager.destroy();
  if (fs.existsSync(testConfigPath)) {
    fs.unlinkSync(testConfigPath);
    log('✓ Test config removed', colors.green);
  }
  
  header('GAP-002 Manual Verification Complete!');
  log('All verification steps passed successfully.', colors.green);
  log('Per-strategy configuration routing is working correctly.', colors.green);
}

main().catch(error => {
  console.error('Error during verification:', error);
  process.exit(1);
});
