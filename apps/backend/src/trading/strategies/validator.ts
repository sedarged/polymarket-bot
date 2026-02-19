/**
 * Strategy Validation Framework
 * 
 * Provides automated validation of trading strategies before deployment.
 * Validates configuration, parameters, behavior, and interface compliance.
 * 
 * Addresses GAP-045: No automated strategy validation before deployment.
 */

import { logger } from '../../utils/logger';
import type {
  IStrategy,
  MarketContext,
  TradingDecision,
} from './types';

/**
 * Validation result for a single check
 */
export interface ValidationResult {
  /** Check name */
  check: string;
  /** Whether check passed */
  passed: boolean;
  /** Error message if failed */
  message?: string;
  /** Severity: error (fails validation) or warning (passes with notice) */
  severity: 'error' | 'warning';
}

/**
 * Overall validation report
 */
export interface ValidationReport {
  /** Strategy being validated */
  strategyId: string;
  /** Strategy type */
  strategyType: string;
  /** Overall validation status */
  valid: boolean;
  /** Individual check results */
  results: ValidationResult[];
  /** Timestamp of validation */
  timestamp: string;
  /** Total errors */
  errorCount: number;
  /** Total warnings */
  warningCount: number;
}

/**
 * Validation criteria configuration
 */
export interface ValidationCriteria {
  /** Required config parameters */
  requiredParams?: string[];
  /** Allowed parameter bounds */
  paramBounds?: Record<string, { min?: number; max?: number }>;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Maximum decision time (ms) */
  maxDecisionTime?: number;
  /** Enable behavioral validation */
  validateBehavior?: boolean;
}

/**
 * Strategy Validator
 * 
 * Validates trading strategies before deployment to ensure:
 * - Configuration is valid and complete
 * - Parameters are within acceptable bounds
 * - Strategy implements required interface correctly
 * - Strategy behavior is reasonable and safe
 */
export class StrategyValidator {
  private criteria: ValidationCriteria;

  constructor(criteria: ValidationCriteria = {}) {
    this.criteria = {
      minConfidence: 0,
      maxDecisionTime: 5000, // 5 seconds
      validateBehavior: true,
      ...criteria,
    };
  }

  /**
   * Validate a strategy comprehensively
   * 
   * @param strategy - Strategy instance to validate
   * @returns Validation report
   */
  async validate(strategy: IStrategy): Promise<ValidationReport> {
    const results: ValidationResult[] = [];

    logger.info('Starting strategy validation', {
      strategyId: strategy.id,
      strategyType: strategy.name,
    });

    // 1. Validate configuration
    results.push(...this.validateConfig(strategy));

    // 2. Validate interface compliance
    results.push(...this.validateInterface(strategy));

    // 3. Validate parameter bounds
    results.push(...this.validateParameters(strategy));

    // 4. Validate behavior (if enabled)
    if (this.criteria.validateBehavior) {
      const behaviorResults = await this.validateBehavior(strategy);
      results.push(...behaviorResults);
    }

    // Calculate summary
    const errorCount = results.filter(
      r => !r.passed && r.severity === 'error'
    ).length;
    const warningCount = results.filter(
      r => !r.passed && r.severity === 'warning'
    ).length;

    const report: ValidationReport = {
      strategyId: strategy.id,
      strategyType: strategy.name,
      valid: errorCount === 0,
      results,
      timestamp: new Date().toISOString(),
      errorCount,
      warningCount,
    };

    logger.info('Strategy validation complete', {
      strategyId: strategy.id,
      valid: report.valid,
      errors: errorCount,
      warnings: warningCount,
    });

    return report;
  }

  /**
   * Validate strategy configuration
   */
  private validateConfig(strategy: IStrategy): ValidationResult[] {
    const results: ValidationResult[] = [];
    const config = strategy.getConfig();

    // Check required fields
    if (!config.strategyId) {
      results.push({
        check: 'config.strategyId',
        passed: false,
        severity: 'error',
        message: 'Strategy ID is required',
      });
    }

    if (!config.type) {
      results.push({
        check: 'config.type',
        passed: false,
        severity: 'error',
        message: 'Strategy type is required',
      });
    }

    if (typeof config.enabled !== 'boolean') {
      results.push({
        check: 'config.enabled',
        passed: false,
        severity: 'error',
        message: 'Strategy enabled flag must be boolean',
      });
    }

    if (!config.params || typeof config.params !== 'object') {
      results.push({
        check: 'config.params',
        passed: false,
        severity: 'error',
        message: 'Strategy params must be an object',
      });
    }

    // Check required params if specified in criteria
    if (this.criteria.requiredParams && config.params) {
      for (const param of this.criteria.requiredParams) {
        if (!(param in config.params)) {
          results.push({
            check: `config.params.${param}`,
            passed: false,
            severity: 'error',
            message: `Required parameter missing: ${param}`,
          });
        }
      }
    }

    // If all checks passed, add success result
    if (results.length === 0) {
      results.push({
        check: 'config',
        passed: true,
        severity: 'error',
        message: 'Configuration is valid',
      });
    }

    return results;
  }

  /**
   * Validate strategy interface compliance
   */
  private validateInterface(strategy: IStrategy): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Check required properties
    const requiredProps: Array<keyof IStrategy> = [
      'id',
      'name',
      'version',
      'description',
    ];

    for (const prop of requiredProps) {
      if (!strategy[prop]) {
        results.push({
          check: `interface.${prop}`,
          passed: false,
          severity: 'error',
          message: `Required property missing: ${prop}`,
        });
      }
    }

    // Check required methods
    if (typeof strategy.initialize !== 'function') {
      results.push({
        check: 'interface.initialize',
        passed: false,
        severity: 'error',
        message: 'Strategy must implement initialize() method',
      });
    }

    if (typeof strategy.evaluate !== 'function') {
      results.push({
        check: 'interface.evaluate',
        passed: false,
        severity: 'error',
        message: 'Strategy must implement evaluate() method',
      });
    }

    if (typeof strategy.getConfig !== 'function') {
      results.push({
        check: 'interface.getConfig',
        passed: false,
        severity: 'error',
        message: 'Strategy must implement getConfig() method',
      });
    }

    // If all checks passed
    if (results.length === 0) {
      results.push({
        check: 'interface',
        passed: true,
        severity: 'error',
        message: 'Interface compliance verified',
      });
    }

    return results;
  }

  /**
   * Validate strategy parameters against bounds
   */
  private validateParameters(strategy: IStrategy): ValidationResult[] {
    const results: ValidationResult[] = [];
    const config = strategy.getConfig();

    if (!this.criteria.paramBounds || !config.params) {
      results.push({
        check: 'parameters',
        passed: true,
        severity: 'error',
        message: 'No parameter bounds to validate',
      });
      return results;
    }

    // Check each bounded parameter
    for (const [param, bounds] of Object.entries(this.criteria.paramBounds)) {
      const value = config.params[param];

      if (value === undefined) {
        continue; // Parameter not present, skip
      }

      if (typeof value !== 'number') {
        results.push({
          check: `parameters.${param}`,
          passed: false,
          severity: 'warning',
          message: `Parameter ${param} is not a number: ${typeof value}`,
        });
        continue;
      }

      // Check min bound
      if (bounds.min !== undefined && value < bounds.min) {
        results.push({
          check: `parameters.${param}.min`,
          passed: false,
          severity: 'error',
          message: `Parameter ${param}=${value} is below minimum ${bounds.min}`,
        });
      }

      // Check max bound
      if (bounds.max !== undefined && value > bounds.max) {
        results.push({
          check: `parameters.${param}.max`,
          passed: false,
          severity: 'error',
          message: `Parameter ${param}=${value} exceeds maximum ${bounds.max}`,
        });
      }
    }

    // If no bound violations
    if (results.length === 0) {
      results.push({
        check: 'parameters',
        passed: true,
        severity: 'error',
        message: 'All parameters within bounds',
      });
    }

    return results;
  }

  /**
   * Validate strategy behavior with test scenarios
   */
  private async validateBehavior(
    strategy: IStrategy
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Create test market context
    const testContext: MarketContext = {
      marketId: 'test-market',
      tokenId: 'test-token',
      bestBid: 0.5,
      bestAsk: 0.52,
      mid: 0.51,
      spread: 0.02,
      liquidity: {
        bidSize: 100,
        askSize: 100,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      // Test 1: Decision timing
      const startTime = Date.now();
      const decision = await strategy.evaluate(testContext);
      const elapsedTime = Date.now() - startTime;

      if (elapsedTime > (this.criteria.maxDecisionTime || 5000)) {
        results.push({
          check: 'behavior.timing',
          passed: false,
          severity: 'warning',
          message: `Decision took ${elapsedTime}ms, exceeds ${this.criteria.maxDecisionTime}ms limit`,
        });
      } else {
        results.push({
          check: 'behavior.timing',
          passed: true,
          severity: 'warning',
          message: `Decision completed in ${elapsedTime}ms`,
        });
      }

      // Test 2: Decision structure validation
      if (!this.isValidDecision(decision)) {
        results.push({
          check: 'behavior.decision',
          passed: false,
          severity: 'error',
          message: 'Strategy returned invalid decision structure',
        });
      } else {
        results.push({
          check: 'behavior.decision',
          passed: true,
          severity: 'error',
          message: 'Decision structure is valid',
        });
      }

      // Test 3: Confidence bounds
      if (
        decision.confidence < (this.criteria.minConfidence || 0) ||
        decision.confidence > 1
      ) {
        results.push({
          check: 'behavior.confidence',
          passed: false,
          severity: 'error',
          message: `Confidence ${decision.confidence} outside valid range [${this.criteria.minConfidence}, 1]`,
        });
      } else {
        results.push({
          check: 'behavior.confidence',
          passed: true,
          severity: 'error',
          message: 'Confidence is within valid range',
        });
      }

      // Test 4: Price bounds (if placing orders)
      if (
        (decision.action === 'buy' || decision.action === 'sell') &&
        decision.price !== undefined
      ) {
        if (decision.price < 0 || decision.price > 1) {
          results.push({
            check: 'behavior.price',
            passed: false,
            severity: 'error',
            message: `Price ${decision.price} outside valid range [0, 1]`,
          });
        } else {
          results.push({
            check: 'behavior.price',
            passed: true,
            severity: 'error',
            message: 'Price is within valid range',
          });
        }
      }

      // Test 5: Size validation
      if (
        (decision.action === 'buy' || decision.action === 'sell') &&
        decision.size !== undefined
      ) {
        if (decision.size <= 0) {
          results.push({
            check: 'behavior.size',
            passed: false,
            severity: 'error',
            message: `Size ${decision.size} must be positive`,
          });
        } else {
          results.push({
            check: 'behavior.size',
            passed: true,
            severity: 'error',
            message: 'Size is valid',
          });
        }
      }

      // Test 6: Rationale present
      if (!decision.rationale || typeof decision.rationale !== 'string' || decision.rationale.trim() === '') {
        results.push({
          check: 'behavior.rationale',
          passed: false,
          severity: 'warning',
          message: 'Decision lacks rationale',
        });
      } else {
        results.push({
          check: 'behavior.rationale',
          passed: true,
          severity: 'warning',
          message: 'Rationale provided',
        });
      }
    } catch (error) {
      results.push({
        check: 'behavior.execution',
        passed: false,
        severity: 'error',
        message: `Strategy threw error during evaluation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }

    return results;
  }

  /**
   * Validate decision structure
   */
  private isValidDecision(decision: TradingDecision): boolean {
    if (!decision || typeof decision !== 'object') {
      return false;
    }

    // Check required fields
    if (!['buy', 'sell', 'hold', 'cancel'].includes(decision.action)) {
      return false;
    }

    if (typeof decision.confidence !== 'number') {
      return false;
    }

    if (typeof decision.rationale !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * Format validation report for human consumption
   */
  static formatReport(report: ValidationReport): string {
    const lines: string[] = [];

    lines.push(`\n${'='.repeat(60)}`);
    lines.push(`Strategy Validation Report`);
    lines.push(`${'='.repeat(60)}`);
    lines.push(`Strategy ID: ${report.strategyId}`);
    lines.push(`Strategy Type: ${report.strategyType}`);
    lines.push(`Status: ${report.valid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push(`Timestamp: ${report.timestamp}`);
    lines.push(`Errors: ${report.errorCount}`);
    lines.push(`Warnings: ${report.warningCount}`);
    lines.push(`${'='.repeat(60)}`);

    // Group results by status
    const errors = report.results.filter(
      r => !r.passed && r.severity === 'error'
    );
    const warnings = report.results.filter(
      r => !r.passed && r.severity === 'warning'
    );
    const passed = report.results.filter(r => r.passed);

    if (errors.length > 0) {
      lines.push(`\n❌ ERRORS (${errors.length}):`);
      for (const result of errors) {
        lines.push(`  • [${result.check}] ${result.message}`);
      }
    }

    if (warnings.length > 0) {
      lines.push(`\n⚠️  WARNINGS (${warnings.length}):`);
      for (const result of warnings) {
        lines.push(`  • [${result.check}] ${result.message}`);
      }
    }

    if (passed.length > 0) {
      lines.push(`\n✅ PASSED (${passed.length}):`);
      for (const result of passed) {
        lines.push(`  • [${result.check}] ${result.message}`);
      }
    }

    lines.push(`\n${'='.repeat(60)}\n`);

    return lines.join('\n');
  }
}

/**
 * Quick validation helper
 * 
 * @param strategy - Strategy to validate
 * @param criteria - Optional validation criteria
 * @returns true if valid, false otherwise
 */
export async function validateStrategy(
  strategy: IStrategy,
  criteria?: ValidationCriteria
): Promise<boolean> {
  const validator = new StrategyValidator(criteria);
  const report = await validator.validate(strategy);

  // Log formatted report
  const formattedReport = StrategyValidator.formatReport(report);
  if (report.valid) {
    logger.info('Strategy validation passed', { report: formattedReport });
  } else {
    logger.error('Strategy validation failed', { report: formattedReport });
  }

  return report.valid;
}
