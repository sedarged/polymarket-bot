#!/usr/bin/env tsx
/**
 * Strategy Validation Example
 * 
 * Demonstrates how to use the strategy validation framework
 * to validate trading strategies before deployment.
 * 
 * Usage:
 *   tsx examples/validate-strategy-example.ts
 */

import { registerStrategies, StrategyFactory, StrategyValidator } from '../src/trading/strategies';
import type { StrategyConfig, ValidationCriteria } from '../src/trading/strategies/types';

async function main() {
  console.log('='.repeat(60));
  console.log('Strategy Validation Framework Example');
  console.log('='.repeat(60));
  console.log();

  // Register all built-in strategies
  registerStrategies();

  // Example 1: Basic validation with default criteria
  console.log('Example 1: Basic Validation');
  console.log('-'.repeat(60));
  
  const basicConfig: StrategyConfig = {
    strategyId: 'test-random-1',
    type: 'random',
    enabled: true,
    params: {
      buyProbability: 0.3,
      sellProbability: 0.3,
      maxSize: 10,
    },
  };

  try {
    const basicStrategy = await StrategyFactory.create(basicConfig);
    console.log(`✅ Strategy "${basicStrategy.name}" created and validated successfully`);
  } catch (error) {
    console.error(`❌ Strategy creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log();

  // Example 2: Validation with custom criteria
  console.log('Example 2: Custom Validation Criteria');
  console.log('-'.repeat(60));

  // Set custom criteria that will fail
  const strictCriteria: ValidationCriteria = {
    requiredParams: ['minProfitBps', 'maxOrderSize'],
    paramBounds: {
      minProfitBps: { min: 100, max: 500 },
    },
  };

  StrategyFactory.setValidationCriteria(strictCriteria);

  const arbitrageConfig: StrategyConfig = {
    strategyId: 'test-arb-1',
    type: 'arbitrage',
    enabled: true,
    params: {
      minProfitBps: 50, // Will fail: below minimum of 100
      maxOrderSize: 100,
    },
  };

  try {
    await StrategyFactory.create(arbitrageConfig);
  } catch (error) {
    console.log(`Expected failure: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log();

  // Example 3: Detailed validation report
  console.log('Example 3: Detailed Validation Report');
  console.log('-'.repeat(60));

  // Create a strategy without factory validation
  StrategyFactory.setValidationEnabled(false);
  const reportStrategy = await StrategyFactory.create({
    strategyId: 'report-test',
    type: 'arbitrage',
    enabled: true,
    params: {
      minProfitBps: 50,
      maxOrderSize: 100,
    },
  });

  // Manually validate with custom validator
  const validator = new StrategyValidator({
    paramBounds: {
      minProfitBps: { min: 100, max: 500 },
      maxOrderSize: { min: 1, max: 1000 },
    },
    maxDecisionTime: 1000,
    validateBehavior: true,
  });

  const report = await validator.validate(reportStrategy);
  console.log(StrategyValidator.formatReport(report));

  // Example 4: Validation summary
  console.log('Example 4: Production Validation Workflow');
  console.log('-'.repeat(60));

  // Reset to default validation
  StrategyFactory.setValidationEnabled(true);
  StrategyFactory.setValidationCriteria({
    paramBounds: {
      minProfitBps: { min: 10, max: 1000 },
      maxOrderSize: { min: 1, max: 10000 },
    },
  });

  const productionConfig: StrategyConfig = {
    strategyId: 'production-arb',
    type: 'arbitrage',
    enabled: true,
    params: {
      minProfitBps: 50,
      maxOrderSize: 100,
      feeRate: 0.02,
    },
  };

  try {
    const productionStrategy = await StrategyFactory.create(productionConfig);
    console.log(`✅ Production strategy validated and ready for deployment`);
    console.log(`   ID: ${productionStrategy.id}`);
    console.log(`   Name: ${productionStrategy.name}`);
    console.log(`   Version: ${productionStrategy.version}`);
    console.log(`   Description: ${productionStrategy.description}`);
  } catch (error) {
    console.error(`❌ Production validation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error('   DO NOT deploy this strategy to production!');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Validation complete. See logs above for details.');
  console.log('='.repeat(60));
}

main().catch(console.error);
