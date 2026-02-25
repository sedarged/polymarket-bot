/**
 * Metrics Gating - Performance threshold enforcement
 * 
 * Validates strategy performance against configurable thresholds before promotion.
 * Ensures strategies meet minimum quality standards before advancement.
 * 
 * Paper trading only - gates promotion from experimental to candidate status.
 * Design follows REPORTS/LEARNING_SYSTEM.md specification (Section 7).
 */

import { logger } from '../utils/logger';
import type {
  StrategyPerformance,
  MetricsThresholds,
  GatingResult,
} from './types';

export interface MetricsGatingConfig {
  thresholds?: Partial<MetricsThresholds>;
}

const DEFAULT_THRESHOLDS: MetricsThresholds = {
  minSharpe: 1.0, // Minimum Sharpe ratio
  maxDrawdown: 0.1, // Maximum 10% drawdown
  minSampleSize: 30, // Minimum 30 trades
  minDays: 30, // Minimum 30 days of data
  maxErrorRate: 0.01, // Maximum 1% error rate
};

export class MetricsGating {
  private thresholds: MetricsThresholds;
  
  constructor(config: MetricsGatingConfig = {}) {
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...config.thresholds,
    };

    // Validate thresholds
    MetricsGating.validateThresholds(this.thresholds);
    
    logger.info('MetricsGating initialized', { thresholds: this.thresholds });
  }

  /**
   * Validate threshold values are in acceptable ranges
   */
  private static validateThresholds(t: MetricsThresholds): void {
    if (!Number.isFinite(t.minSharpe)) {
      throw new Error(`MetricsGating: minSharpe must be a finite number, got ${t.minSharpe}`);
    }
    if (!Number.isFinite(t.maxDrawdown) || t.maxDrawdown < 0 || t.maxDrawdown > 1) {
      throw new Error(`MetricsGating: maxDrawdown must be between 0 and 1, got ${t.maxDrawdown}`);
    }
    if (!Number.isInteger(t.minSampleSize) || t.minSampleSize < 0) {
      throw new Error(`MetricsGating: minSampleSize must be a non-negative integer, got ${t.minSampleSize}`);
    }
    if (!Number.isInteger(t.minDays) || t.minDays < 0) {
      throw new Error(`MetricsGating: minDays must be a non-negative integer, got ${t.minDays}`);
    }
    if (!Number.isFinite(t.maxErrorRate) || t.maxErrorRate < 0 || t.maxErrorRate > 1) {
      throw new Error(`MetricsGating: maxErrorRate must be between 0 and 1, got ${t.maxErrorRate}`);
    }
  }
  
  /**
   * Check if strategy performance meets all gating thresholds
   */
  check(performance: StrategyPerformance, daysSinceStart: number): GatingResult {
    const checks = {
      sharpe: this.checkSharpe(performance.sharpe),
      drawdown: this.checkDrawdown(performance.maxDrawdown),
      sampleSize: this.checkSampleSize(performance.tradeCount),
      days: this.checkDays(daysSinceStart),
      errorRate: this.checkErrorRate(performance.errorRate),
    };
    
    const passed = Object.values(checks).every(check => check.passed);
    const failedChecks = Object.entries(checks)
      .filter(([_, check]) => !check.passed)
      .map(([name, _]) => name);
    
    const result: GatingResult = {
      passed,
      checks,
      failedChecks,
      message: passed
        ? 'All metrics gates passed'
        : `Failed checks: ${failedChecks.join(', ')}`,
    };
    
    logger.info('Metrics gating check completed', {
      strategyId: performance.strategyId,
      passed,
      failedChecks,
    });
    
    return result;
  }
  
  /**
   * Check Sharpe ratio threshold
   */
  private checkSharpe(sharpe: number): { passed: boolean; value: number; threshold: number } {
    return {
      passed: sharpe >= this.thresholds.minSharpe,
      value: sharpe,
      threshold: this.thresholds.minSharpe,
    };
  }
  
  /**
   * Check maximum drawdown threshold
   */
  private checkDrawdown(drawdown: number): { passed: boolean; value: number; threshold: number } {
    return {
      passed: drawdown <= this.thresholds.maxDrawdown,
      value: drawdown,
      threshold: this.thresholds.maxDrawdown,
    };
  }
  
  /**
   * Check minimum sample size (trade count)
   */
  private checkSampleSize(tradeCount: number): { passed: boolean; value: number; threshold: number } {
    return {
      passed: tradeCount >= this.thresholds.minSampleSize,
      value: tradeCount,
      threshold: this.thresholds.minSampleSize,
    };
  }
  
  /**
   * Check minimum days of data
   */
  private checkDays(daysSinceStart: number): { passed: boolean; value: number; threshold: number } {
    return {
      passed: daysSinceStart >= this.thresholds.minDays,
      value: daysSinceStart,
      threshold: this.thresholds.minDays,
    };
  }
  
  /**
   * Check maximum error rate
   */
  private checkErrorRate(errorRate: number): { passed: boolean; value: number; threshold: number } {
    return {
      passed: errorRate <= this.thresholds.maxErrorRate,
      value: errorRate,
      threshold: this.thresholds.maxErrorRate,
    };
  }
  
  /**
   * Get current thresholds
   */
  getThresholds(): MetricsThresholds {
    return { ...this.thresholds };
  }
  
  /**
   * Update thresholds (useful for runtime configuration)
   */
  updateThresholds(newThresholds: Partial<MetricsThresholds>): void {
    const merged = {
      ...this.thresholds,
      ...newThresholds,
    };
    MetricsGating.validateThresholds(merged);
    this.thresholds = merged;
    
    logger.info('Metrics gating thresholds updated', { thresholds: this.thresholds });
  }
}
