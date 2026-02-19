/**
 * Tests for Strategy Validator
 * 
 * Tests the strategy validation framework including:
 * - Configuration validation
 * - Interface compliance checks
 * - Parameter boundary validation
 * - Behavioral validation
 * - Integration with StrategyFactory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyValidator, type ValidationCriteria } from '../../src/trading/strategies/validator';
import { RandomStrategy } from '../../src/trading/strategies/RandomStrategy';
import { ArbitrageStrategy } from '../../src/trading/strategies/ArbitrageStrategy';
import { StrategyFactory } from '../../src/trading/strategies/StrategyFactory';
import type { StrategyConfig, IStrategy, TradingDecision, MarketContext, Position } from '../../src/trading/strategies/types';
import { BaseStrategy } from '../../src/trading/strategies/BaseStrategy';

describe('StrategyValidator', () => {
  let validator: StrategyValidator;

  beforeEach(() => {
    validator = new StrategyValidator();
  });

  describe('Configuration Validation', () => {
    it('should pass validation for valid configuration', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);

      expect(report.valid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it('should detect missing strategyId', async () => {
      // BaseStrategy validates config during initialize and throws
      // The validator runs AFTER initialization, so we test with
      // a strategy that has already been initialized with empty ID
      class EmptyIdStrategy extends BaseStrategy {
        constructor() {
          super('empty-id-strategy', 'EmptyId', '1.0.0', 'Test strategy with empty ID');
        }

        protected validateConfig(config: StrategyConfig): void {
          // Override to skip the validation that throws
          // This allows us to test the validator's check
        }

        protected async onInitialize(): Promise<void> {
          // No-op
        }

        protected async onEvaluate(): Promise<TradingDecision> {
          return {
            action: 'hold',
            confidence: 0.5,
            rationale: 'Hold',
          };
        }
      }

      const strategy = new EmptyIdStrategy();
      await strategy.initialize({
        strategyId: '', // Invalid: empty
        type: 'test',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);

      expect(report.valid).toBe(false);
      expect(report.results.some(r => r.check === 'config.strategyId' && !r.passed)).toBe(true);
    });

    it('should validate required parameters', async () => {
      const criteria: ValidationCriteria = {
        requiredParams: ['minProfitBps', 'maxOrderSize'],
      };
      const validatorWithCriteria = new StrategyValidator(criteria);

      const strategy = new ArbitrageStrategy();
      await strategy.initialize({
        strategyId: 'arb-1',
        type: 'arbitrage',
        enabled: true,
        params: {
          minProfitBps: 50,
          // maxOrderSize is missing
        },
      });

      const report = await validatorWithCriteria.validate(strategy);

      expect(report.valid).toBe(false);
      expect(report.results.some(r => r.check.includes('maxOrderSize') && !r.passed)).toBe(true);
    });
  });

  describe('Interface Compliance Validation', () => {
    it('should verify all required properties exist', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);

      const interfaceResults = report.results.filter(r => r.check.startsWith('interface'));
      const allPassed = interfaceResults.every(r => r.passed);

      expect(allPassed).toBe(true);
    });

    it('should verify required methods exist', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      // Check methods exist
      expect(typeof strategy.initialize).toBe('function');
      expect(typeof strategy.evaluate).toBe('function');
      expect(typeof strategy.getConfig).toBe('function');

      const report = await validator.validate(strategy);
      expect(report.valid).toBe(true);
    });
  });

  describe('Parameter Boundary Validation', () => {
    it('should enforce minimum bounds', async () => {
      const criteria: ValidationCriteria = {
        paramBounds: {
          minProfitBps: { min: 10, max: 1000 },
        },
      };
      const validatorWithBounds = new StrategyValidator(criteria);

      const strategy = new ArbitrageStrategy();
      await strategy.initialize({
        strategyId: 'arb-1',
        type: 'arbitrage',
        enabled: true,
        params: {
          minProfitBps: 5, // Below minimum of 10
        },
      });

      const report = await validatorWithBounds.validate(strategy);

      expect(report.valid).toBe(false);
      expect(report.results.some(r => r.check.includes('minProfitBps.min') && !r.passed)).toBe(true);
    });

    it('should enforce maximum bounds', async () => {
      const criteria: ValidationCriteria = {
        paramBounds: {
          maxOrderSize: { min: 1, max: 1000 },
        },
      };
      const validatorWithBounds = new StrategyValidator(criteria);

      const strategy = new ArbitrageStrategy();
      await strategy.initialize({
        strategyId: 'arb-1',
        type: 'arbitrage',
        enabled: true,
        params: {
          maxOrderSize: 2000, // Above maximum of 1000
        },
      });

      const report = await validatorWithBounds.validate(strategy);

      expect(report.valid).toBe(false);
      expect(report.results.some(r => r.check.includes('maxOrderSize.max') && !r.passed)).toBe(true);
    });

    it('should pass when parameters are within bounds', async () => {
      const criteria: ValidationCriteria = {
        paramBounds: {
          minProfitBps: { min: 10, max: 1000 },
          maxOrderSize: { min: 1, max: 1000 },
        },
      };
      const validatorWithBounds = new StrategyValidator(criteria);

      const strategy = new ArbitrageStrategy();
      await strategy.initialize({
        strategyId: 'arb-1',
        type: 'arbitrage',
        enabled: true,
        params: {
          minProfitBps: 50,
          maxOrderSize: 100,
        },
      });

      const report = await validatorWithBounds.validate(strategy);

      expect(report.valid).toBe(true);
    });
  });

  describe('Behavioral Validation', () => {
    it('should validate decision timing', async () => {
      const criteria: ValidationCriteria = {
        maxDecisionTime: 100, // Very strict timing
        validateBehavior: true,
      };
      const validatorWithTiming = new StrategyValidator(criteria);

      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const report = await validatorWithTiming.validate(strategy);

      // Should have a timing check
      const timingResult = report.results.find(r => r.check === 'behavior.timing');
      expect(timingResult).toBeDefined();
    });

    it('should validate decision structure', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);

      // Should validate decision structure
      const decisionResult = report.results.find(r => r.check === 'behavior.decision');
      expect(decisionResult).toBeDefined();
      expect(decisionResult?.passed).toBe(true);
    });

    it('should validate confidence bounds', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);

      // Should validate confidence is in [0, 1]
      const confidenceResult = report.results.find(r => r.check === 'behavior.confidence');
      expect(confidenceResult).toBeDefined();
      expect(confidenceResult?.passed).toBe(true);
    });

    it('should validate price bounds for buy/sell actions', async () => {
      // Create a strategy that returns buy/sell decisions
      class TestStrategy extends BaseStrategy {
        constructor() {
          super('test-strategy', 'Test', '1.0.0', 'Test strategy');
        }

        protected async onInitialize(): Promise<void> {
          // No-op
        }

        protected async onEvaluate(): Promise<TradingDecision> {
          return {
            action: 'buy',
            price: 0.5,
            size: 10,
            side: 'BUY',
            confidence: 0.8,
            rationale: 'Test decision',
          };
        }
      }

      const strategy = new TestStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'test',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);

      // Should validate price is in [0, 1]
      const priceResult = report.results.find(r => r.check === 'behavior.price');
      expect(priceResult).toBeDefined();
      expect(priceResult?.passed).toBe(true);
    });

    it('should fail validation for invalid prices', async () => {
      // Create a strategy that bypasses BaseStrategy validation
      // to test the validator's price checking
      class BadPriceStrategy extends BaseStrategy {
        constructor() {
          super('bad-price-strategy', 'BadPrice', '1.0.0', 'Bad price strategy');
        }

        protected validateDecision(): void {
          // Override to skip the built-in validation
          // This allows us to test the validator's behavior check
        }

        protected async onInitialize(): Promise<void> {
          // No-op
        }

        protected async onEvaluate(): Promise<TradingDecision> {
          return {
            action: 'buy',
            price: 1.5, // Invalid: > 1
            size: 10,
            side: 'BUY',
            confidence: 0.8,
            rationale: 'Test decision',
          };
        }
      }

      const strategy = new BadPriceStrategy();
      await strategy.initialize({
        strategyId: 'bad-1',
        type: 'bad',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);

      expect(report.valid).toBe(false);
      const priceResult = report.results.find(r => r.check === 'behavior.price');
      expect(priceResult?.passed).toBe(false);
    });

    it('should skip behavioral validation when disabled', async () => {
      const criteria: ValidationCriteria = {
        validateBehavior: false,
      };
      const validatorNoBehavior = new StrategyValidator(criteria);

      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const report = await validatorNoBehavior.validate(strategy);

      // Should not have any behavior checks
      const behaviorResults = report.results.filter(r => r.check.startsWith('behavior'));
      expect(behaviorResults.length).toBe(0);
    });
  });

  describe('Integration with StrategyFactory', () => {
    beforeEach(() => {
      StrategyFactory.clear();
      StrategyFactory.setValidationEnabled(true);
    });

    it('should validate strategy during factory creation', async () => {
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
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      };

      // Should succeed with valid config
      const strategy = await StrategyFactory.create(config);
      expect(strategy).toBeDefined();
    });

    it('should fail factory creation for invalid strategy', async () => {
      // Create a bad strategy that fails validation
      class BadStrategy extends BaseStrategy {
        constructor() {
          super('', '', '', ''); // Invalid: empty required fields
        }

        protected async onInitialize(): Promise<void> {
          // No-op
        }

        protected async onEvaluate(): Promise<TradingDecision> {
          return {
            action: 'hold',
            confidence: 0,
            rationale: 'Hold',
          };
        }
      }

      StrategyFactory.register({
        type: 'bad',
        factory: () => new BadStrategy(),
        description: 'Bad strategy',
        defaultConfig: {
          strategyId: '',
          type: 'bad',
          enabled: true,
          params: {},
        },
      });

      const config: StrategyConfig = {
        strategyId: 'bad-1',
        type: 'bad',
        enabled: true,
        params: {},
      };

      // Should fail validation
      await expect(StrategyFactory.create(config)).rejects.toThrow('validation failed');
    });

    it('should allow skipping validation when requested', async () => {
      // Create a bad strategy
      class BadStrategy extends BaseStrategy {
        constructor() {
          super('', '', '', ''); // Invalid
        }

        protected async onInitialize(): Promise<void> {
          // No-op
        }

        protected async onEvaluate(): Promise<TradingDecision> {
          return {
            action: 'hold',
            confidence: 0,
            rationale: 'Hold',
          };
        }
      }

      StrategyFactory.register({
        type: 'bad',
        factory: () => new BadStrategy(),
        description: 'Bad strategy',
        defaultConfig: {
          strategyId: '',
          type: 'bad',
          enabled: true,
          params: {},
        },
      });

      const config: StrategyConfig = {
        strategyId: 'bad-1',
        type: 'bad',
        enabled: true,
        params: {},
      };

      // Should succeed when skipping validation
      const strategy = await StrategyFactory.create(config, true);
      expect(strategy).toBeDefined();
    });

    it('should respect global validation settings', async () => {
      StrategyFactory.setValidationEnabled(false);

      // Create a bad strategy
      class BadStrategy extends BaseStrategy {
        constructor() {
          super('', '', '', ''); // Invalid
        }

        protected async onInitialize(): Promise<void> {
          // No-op
        }

        protected async onEvaluate(): Promise<TradingDecision> {
          return {
            action: 'hold',
            confidence: 0,
            rationale: 'Hold',
          };
        }
      }

      StrategyFactory.register({
        type: 'bad',
        factory: () => new BadStrategy(),
        description: 'Bad strategy',
        defaultConfig: {
          strategyId: '',
          type: 'bad',
          enabled: true,
          params: {},
        },
      });

      const config: StrategyConfig = {
        strategyId: 'bad-1',
        type: 'bad',
        enabled: true,
        params: {},
      };

      // Should succeed when validation is disabled
      const strategy = await StrategyFactory.create(config);
      expect(strategy).toBeDefined();
    });

    it('should apply custom validation criteria', async () => {
      StrategyFactory.setValidationCriteria({
        requiredParams: ['minProfitBps'],
        paramBounds: {
          minProfitBps: { min: 100, max: 500 },
        },
      });

      StrategyFactory.register({
        type: 'arbitrage',
        factory: () => new ArbitrageStrategy(),
        description: 'Arbitrage strategy',
        defaultConfig: {
          strategyId: '',
          type: 'arbitrage',
          enabled: true,
          params: {},
        },
      });

      const config: StrategyConfig = {
        strategyId: 'arb-1',
        type: 'arbitrage',
        enabled: true,
        params: {
          minProfitBps: 50, // Below minimum of 100
        },
      };

      // Should fail due to param bounds
      await expect(StrategyFactory.create(config)).rejects.toThrow('validation failed');
    });
  });

  describe('Report Formatting', () => {
    it('should format validation report', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'test-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);
      const formatted = StrategyValidator.formatReport(report);

      expect(formatted).toContain('Strategy Validation Report');
      // Report uses strategy.id not config.strategyId
      expect(formatted).toContain('Strategy ID: random-strategy');
      expect(formatted).toContain(report.valid ? '✅ VALID' : '❌ INVALID');
    });

    it('should show errors in formatted report', async () => {
      // Create a strategy with empty ID that bypasses init validation
      class EmptyIdStrategy extends BaseStrategy {
        constructor() {
          super('empty-id-strategy', 'EmptyId', '1.0.0', 'Test strategy');
        }

        protected validateConfig(): void {
          // Override to skip validation during init
        }

        protected async onInitialize(): Promise<void> {
          // No-op
        }

        protected async onEvaluate(): Promise<TradingDecision> {
          return {
            action: 'hold',
            confidence: 0.5,
            rationale: 'Hold',
          };
        }
      }

      const strategy = new EmptyIdStrategy();
      await strategy.initialize({
        strategyId: '', // Invalid
        type: 'test',
        enabled: true,
        params: {},
      });

      const report = await validator.validate(strategy);
      const formatted = StrategyValidator.formatReport(report);

      expect(formatted).toContain('❌ ERRORS');
      expect(formatted).toContain('Strategy ID is required');
    });
  });
});
