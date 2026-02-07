/**
 * Tests for MetricsGating
 * 
 * Tests performance threshold enforcement for strategy promotion:
 * - Sharpe ratio validation
 * - Maximum drawdown validation
 * - Minimum sample size validation
 * - Minimum days validation
 * - Error rate validation
 * - Threshold configuration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsGating } from '../src/learning/metricsGating';
import type { StrategyPerformance } from '../src/learning/types';

describe('MetricsGating', () => {
  describe('Default Thresholds', () => {
    let gating: MetricsGating;
    
    beforeEach(() => {
      gating = new MetricsGating();
    });
    
    it('should initialize with default thresholds', () => {
      const thresholds = gating.getThresholds();
      
      expect(thresholds.minSharpe).toBe(1.0);
      expect(thresholds.maxDrawdown).toBe(0.1);
      expect(thresholds.minSampleSize).toBe(30);
      expect(thresholds.minDays).toBe(30);
      expect(thresholds.maxErrorRate).toBe(0.01);
    });
    
    it('should pass strategy meeting all thresholds', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.passed).toBe(true);
      expect(result.failedChecks).toHaveLength(0);
      expect(result.checks.sharpe.passed).toBe(true);
      expect(result.checks.drawdown.passed).toBe(true);
      expect(result.checks.sampleSize.passed).toBe(true);
      expect(result.checks.days.passed).toBe(true);
      expect(result.checks.errorRate.passed).toBe(true);
    });
    
    it('should fail strategy with low Sharpe ratio', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 100,
        sharpe: 0.8, // Below threshold of 1.0
        maxDrawdown: 0.05,
        winRate: 0.55,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('sharpe');
      expect(result.checks.sharpe.passed).toBe(false);
      expect(result.checks.sharpe.value).toBe(0.8);
      expect(result.checks.sharpe.threshold).toBe(1.0);
    });
    
    it('should fail strategy with high drawdown', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.15, // Above threshold of 0.1
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('drawdown');
      expect(result.checks.drawdown.passed).toBe(false);
      expect(result.checks.drawdown.value).toBe(0.15);
      expect(result.checks.drawdown.threshold).toBe(0.1);
    });
    
    it('should fail strategy with insufficient trades', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 20, // Below threshold of 30
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('sampleSize');
      expect(result.checks.sampleSize.passed).toBe(false);
      expect(result.checks.sampleSize.value).toBe(20);
      expect(result.checks.sampleSize.threshold).toBe(30);
    });
    
    it('should fail strategy with insufficient days', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 20); // Below threshold of 30 days
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('days');
      expect(result.checks.days.passed).toBe(false);
      expect(result.checks.days.value).toBe(20);
      expect(result.checks.days.threshold).toBe(30);
    });
    
    it('should fail strategy with high error rate', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.02, // Above threshold of 0.01
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('errorRate');
      expect(result.checks.errorRate.passed).toBe(false);
      expect(result.checks.errorRate.value).toBe(0.02);
      expect(result.checks.errorRate.threshold).toBe(0.01);
    });
    
    it('should fail strategy with multiple threshold violations', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 100,
        sharpe: 0.5, // FAIL: Below 1.0
        maxDrawdown: 0.2, // FAIL: Above 0.1
        winRate: 0.4,
        errorRate: 0.005,
        tradeCount: 15, // FAIL: Below 30
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 10); // FAIL: Below 30 days
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toHaveLength(4);
      expect(result.failedChecks).toContain('sharpe');
      expect(result.failedChecks).toContain('drawdown');
      expect(result.failedChecks).toContain('sampleSize');
      expect(result.failedChecks).toContain('days');
    });
  });
  
  describe('Custom Thresholds', () => {
    it('should accept custom thresholds', () => {
      const gating = new MetricsGating({
        thresholds: {
          minSharpe: 1.5,
          maxDrawdown: 0.05,
          minSampleSize: 50,
          minDays: 60,
          maxErrorRate: 0.005,
        },
      });
      
      const thresholds = gating.getThresholds();
      
      expect(thresholds.minSharpe).toBe(1.5);
      expect(thresholds.maxDrawdown).toBe(0.05);
      expect(thresholds.minSampleSize).toBe(50);
      expect(thresholds.minDays).toBe(60);
      expect(thresholds.maxErrorRate).toBe(0.005);
    });
    
    it('should use custom thresholds in checks', () => {
      const gating = new MetricsGating({
        thresholds: {
          minSharpe: 2.0, // Very strict
        },
      });
      
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5, // Would pass default, fails custom
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.passed).toBe(false);
      expect(result.checks.sharpe.passed).toBe(false);
      expect(result.checks.sharpe.threshold).toBe(2.0);
    });
    
    it('should allow partial threshold override', () => {
      const gating = new MetricsGating({
        thresholds: {
          minSharpe: 0.8, // Lower than default
          // Other thresholds use defaults
        },
      });
      
      const thresholds = gating.getThresholds();
      
      expect(thresholds.minSharpe).toBe(0.8);
      expect(thresholds.maxDrawdown).toBe(0.1); // Default
      expect(thresholds.minSampleSize).toBe(30); // Default
    });
  });
  
  describe('Threshold Updates', () => {
    let gating: MetricsGating;
    
    beforeEach(() => {
      gating = new MetricsGating();
    });
    
    it('should update thresholds at runtime', () => {
      gating.updateThresholds({
        minSharpe: 1.2,
        maxDrawdown: 0.08,
      });
      
      const thresholds = gating.getThresholds();
      
      expect(thresholds.minSharpe).toBe(1.2);
      expect(thresholds.maxDrawdown).toBe(0.08);
      expect(thresholds.minSampleSize).toBe(30); // Unchanged
    });
    
    it('should use updated thresholds in subsequent checks', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.1, // Passes original minSharpe of 1.0, fails after minSharpe is raised to 1.5
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      // Check with original thresholds (should pass)
      let result = gating.check(performance, 45);
      expect(result.checks.sharpe.passed).toBe(true);
      
      // Update thresholds
      gating.updateThresholds({ minSharpe: 1.5 });
      
      // Check with updated thresholds (should fail)
      result = gating.check(performance, 45);
      expect(result.checks.sharpe.passed).toBe(false);
    });
  });
  
  describe('Edge Cases', () => {
    let gating: MetricsGating;
    
    beforeEach(() => {
      gating = new MetricsGating();
    });
    
    it('should handle exact threshold values (boundary conditions)', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.0, // Exactly at threshold
        maxDrawdown: 0.1, // Exactly at threshold
        winRate: 0.6,
        errorRate: 0.01, // Exactly at threshold
        tradeCount: 30, // Exactly at threshold
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 30); // Exactly at threshold
      
      // All checks should pass at exact threshold values
      expect(result.passed).toBe(true);
      expect(result.checks.sharpe.passed).toBe(true);
      expect(result.checks.drawdown.passed).toBe(true);
      expect(result.checks.sampleSize.passed).toBe(true);
      expect(result.checks.days.passed).toBe(true);
      expect(result.checks.errorRate.passed).toBe(true);
    });
    
    it('should handle zero values', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 0,
        sharpe: 0,
        maxDrawdown: 0,
        winRate: 0,
        errorRate: 0,
        tradeCount: 0,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 0);
      
      expect(result.passed).toBe(false);
      // Sharpe below threshold
      expect(result.checks.sharpe.passed).toBe(false);
      // Drawdown at 0 is good
      expect(result.checks.drawdown.passed).toBe(true);
      // Trade count below threshold
      expect(result.checks.sampleSize.passed).toBe(false);
      // Days below threshold
      expect(result.checks.days.passed).toBe(false);
      // Error rate at 0 is good
      expect(result.checks.errorRate.passed).toBe(true);
    });
    
    it('should handle negative Sharpe ratio', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: -100,
        sharpe: -0.5,
        maxDrawdown: 0.2,
        winRate: 0.4,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.passed).toBe(false);
      expect(result.checks.sharpe.passed).toBe(false);
      expect(result.checks.sharpe.value).toBe(-0.5);
    });
    
    it('should handle very large values', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 1000000,
        sharpe: 5.0,
        maxDrawdown: 0.01,
        winRate: 0.9,
        errorRate: 0.0001,
        tradeCount: 1000,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 365);
      
      expect(result.passed).toBe(true);
      expect(result.checks.sharpe.value).toBe(5.0);
      expect(result.checks.sampleSize.value).toBe(1000);
    });
  });
  
  describe('Result Messages', () => {
    let gating: MetricsGating;
    
    beforeEach(() => {
      gating = new MetricsGating();
    });
    
    it('should provide success message when all checks pass', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.message).toBe('All metrics gates passed');
    });
    
    it('should provide detailed failure message', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 100,
        sharpe: 0.5,
        maxDrawdown: 0.15,
        winRate: 0.4,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const result = gating.check(performance, 45);
      
      expect(result.message).toContain('Failed checks:');
      expect(result.message).toContain('sharpe');
      expect(result.message).toContain('drawdown');
    });
  });
});
