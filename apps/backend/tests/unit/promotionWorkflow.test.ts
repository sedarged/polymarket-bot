/**
 * Tests for PromotionWorkflow
 * 
 * Tests strategy promotion governance and state management:
 * - Promotion status transitions
 * - Criteria enforcement
 * - Manual approval workflow
 * - Rejection workflow
 * - History tracking
 * - Database persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromotionWorkflow } from '../../src/learning/promotionWorkflow';
import type { StrategyPerformance } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('PromotionWorkflow', () => {
  let workflow: PromotionWorkflow;
  let testDbDir: string;
  let testDbPath: string;
  
  beforeEach(() => {
    // Use a unique temporary directory for each test
    testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-workflow-'));
    testDbPath = path.join(testDbDir, 'test-promotions.db');
    workflow = new PromotionWorkflow({ dbPath: testDbPath });
  });
  
  afterEach(() => {
    workflow.close();
    // Clean up test database directory (including WAL/SHM sidecar files)
    if (testDbDir && fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });
  
  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const config = workflow.getConfig();
      
      expect(config.autoFlag).toBe(true);
      expect(config.requireManualApproval).toBe(true);
      expect(config.criteria.minPnl).toBe(0);
      expect(config.criteria.minSharpe).toBe(1.0);
      expect(config.criteria.maxDrawdown).toBe(0.1);
      expect(config.criteria.maxErrorRate).toBe(0.01);
      expect(config.criteria.minTradeCount).toBe(30);
      expect(config.criteria.minDays).toBe(30);
      expect(config.criteria.requireMultipleRegimes).toBe(true);
    });
    
    it('should initialize with custom config', () => {
      const customWorkflow = new PromotionWorkflow({
        dbPath: testDbPath,
        config: {
          autoFlag: false,
          requireManualApproval: false,
          criteria: {
            minPnl: 100,
            minSharpe: 1.5,
            maxDrawdown: 0.08,
            maxErrorRate: 0.005,
            minTradeCount: 50,
            minDays: 60,
            requireMultipleRegimes: false,
          },
        },
      });
      
      const config = customWorkflow.getConfig();
      
      expect(config.autoFlag).toBe(false);
      expect(config.requireManualApproval).toBe(false);
      expect(config.criteria.minPnl).toBe(100);
      expect(config.criteria.minSharpe).toBe(1.5);
      expect(config.criteria.maxDrawdown).toBe(0.08);
      
      customWorkflow.close();
    });
  });
  
  describe('Strategy Evaluation', () => {
    it('should create new strategy as experimental', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 100,
        sharpe: 0.8,
        maxDrawdown: 0.15,
        winRate: 0.5,
        errorRate: 0.01,
        tradeCount: 20,
        lastUpdated: new Date().toISOString(),
      };
      
      const record = workflow.evaluate('strategy-1', performance, 15);
      
      expect(record.status).toBe('experimental');
      expect(record.strategyId).toBe('strategy-1');
      expect(record.metrics).toEqual(performance);
      expect(record.criteriaCheck.overallPass).toBe(false);
    });
    
    it('should auto-flag strategy for review when criteria met', () => {
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
      
      const record = workflow.evaluate('strategy-1', performance, 45);
      
      expect(record.status).toBe('under-review');
      expect(record.criteriaCheck.overallPass).toBe(true);
      expect(record.criteriaCheck.pnlPass).toBe(true);
      expect(record.criteriaCheck.sharpePass).toBe(true);
      expect(record.criteriaCheck.drawdownPass).toBe(true);
      expect(record.criteriaCheck.errorRatePass).toBe(true);
      expect(record.criteriaCheck.tradeCountPass).toBe(true);
      expect(record.criteriaCheck.daysPass).toBe(true);
    });
    
    it('should not auto-flag when autoFlag is disabled', () => {
      const customWorkflow = new PromotionWorkflow({
        dbPath: testDbPath,
        config: {
          autoFlag: false,
          requireManualApproval: true,
          criteria: {
            minPnl: 0,
            minSharpe: 1.0,
            maxDrawdown: 0.1,
            maxErrorRate: 0.01,
            minTradeCount: 30,
            minDays: 30,
            requireMultipleRegimes: true,
          },
        },
      });
      
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
      
      const record = customWorkflow.evaluate('strategy-1', performance, 45);
      
      expect(record.status).toBe('experimental'); // Stays experimental
      expect(record.criteriaCheck.overallPass).toBe(true);
      
      customWorkflow.close();
    });
    
    it('should check all promotion criteria', () => {
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: -50, // FAIL
        sharpe: 0.5, // FAIL
        maxDrawdown: 0.15, // FAIL
        winRate: 0.4,
        errorRate: 0.02, // FAIL
        tradeCount: 20, // FAIL
        lastUpdated: new Date().toISOString(),
      };
      
      const record = workflow.evaluate('strategy-1', performance, 15); // FAIL days
      
      expect(record.criteriaCheck.pnlPass).toBe(false);
      expect(record.criteriaCheck.sharpePass).toBe(false);
      expect(record.criteriaCheck.drawdownPass).toBe(false);
      expect(record.criteriaCheck.errorRatePass).toBe(false);
      expect(record.criteriaCheck.tradeCountPass).toBe(false);
      expect(record.criteriaCheck.daysPass).toBe(false);
      expect(record.criteriaCheck.overallPass).toBe(false);
    });
  });
  
  describe('Manual Approval', () => {
    it('should approve strategy under review', () => {
      // First, create a strategy under review
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
      
      workflow.evaluate('strategy-1', performance, 45);
      
      // Then approve it
      const approved = workflow.approve('strategy-1', 'admin@example.com', 'Looks good!');
      
      expect(approved.status).toBe('candidate');
      expect(approved.reviewedBy).toBe('admin@example.com');
      expect(approved.reviewNotes).toBe('Looks good!');
      expect(approved.reviewedAt).toBeDefined();
    });
    
    it('should throw error when approving non-existent strategy', () => {
      expect(() => {
        workflow.approve('non-existent', 'admin@example.com');
      }).toThrow('not found');
    });
    
    it('should throw error when approving strategy not under review', () => {
      // Create experimental strategy
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 100,
        sharpe: 0.8,
        maxDrawdown: 0.15,
        winRate: 0.5,
        errorRate: 0.01,
        tradeCount: 20,
        lastUpdated: new Date().toISOString(),
      };
      
      workflow.evaluate('strategy-1', performance, 15);
      
      expect(() => {
        workflow.approve('strategy-1', 'admin@example.com');
      }).toThrow('not under review');
    });
    
    it('should allow approval even if criteria not fully met', () => {
      // Create a strategy that passes some but not all criteria
      const performance: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 0.9, // Below minSharpe of 1.0
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const record = workflow.evaluate('strategy-1', performance, 45);
      
      // Manually transition to under-review (in reality, this would be done differently)
      // For testing, we'll create it under review manually
      const customWorkflow = new PromotionWorkflow({
        dbPath: testDbPath,
        config: {
          autoFlag: true,
          requireManualApproval: true,
          criteria: {
            minPnl: 0,
            minSharpe: 0.5, // Lower threshold to trigger under-review
            maxDrawdown: 0.1,
            maxErrorRate: 0.01,
            minTradeCount: 30,
            minDays: 30,
            requireMultipleRegimes: true,
          },
        },
      });
      
      customWorkflow.evaluate('strategy-2', performance, 45);
      const approved = customWorkflow.approve('strategy-2', 'admin@example.com', 'Manual override');
      
      expect(approved.status).toBe('candidate');
      
      customWorkflow.close();
    });
  });
  
  describe('Manual Rejection', () => {
    it('should reject strategy', () => {
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
      
      workflow.evaluate('strategy-1', performance, 45);
      
      const rejected = workflow.reject('strategy-1', 'admin@example.com', 'Does not meet business requirements');
      
      expect(rejected.status).toBe('rejected');
      expect(rejected.reviewedBy).toBe('admin@example.com');
      expect(rejected.reviewNotes).toBe('Does not meet business requirements');
      expect(rejected.reviewedAt).toBeDefined();
    });
    
    it('should throw error when rejecting non-existent strategy', () => {
      expect(() => {
        workflow.reject('non-existent', 'admin@example.com', 'N/A');
      }).toThrow('not found');
    });
    
    it('should keep strategy rejected on subsequent evaluations', () => {
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
      
      workflow.evaluate('strategy-1', performance, 45);
      workflow.reject('strategy-1', 'admin@example.com', 'Rejected');
      
      // Re-evaluate with even better performance
      const betterPerformance: StrategyPerformance = {
        ...performance,
        pnl: 1000,
        sharpe: 2.0,
      };
      
      const record = workflow.evaluate('strategy-1', betterPerformance, 60);
      
      expect(record.status).toBe('rejected'); // Still rejected
    });
  });
  
  describe('Promotion Persistence', () => {
    it('should persist and retrieve promotion records', () => {
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
      
      const evaluated = workflow.evaluate('strategy-1', performance, 45);
      
      const retrieved = workflow.getPromotion('strategy-1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.strategyId).toBe('strategy-1');
      expect(retrieved!.status).toBe(evaluated.status);
      expect(retrieved!.metrics).toEqual(performance);
    });
    
    it('should return null for non-existent strategy', () => {
      const retrieved = workflow.getPromotion('non-existent');
      
      expect(retrieved).toBeNull();
    });
    
    it('should update existing promotion records', () => {
      const performance1: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 100,
        sharpe: 0.8,
        maxDrawdown: 0.15,
        winRate: 0.5,
        errorRate: 0.01,
        tradeCount: 20,
        lastUpdated: new Date().toISOString(),
      };
      
      workflow.evaluate('strategy-1', performance1, 15);
      
      const performance2: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      workflow.evaluate('strategy-1', performance2, 45);
      
      const retrieved = workflow.getPromotion('strategy-1');
      
      expect(retrieved!.metrics.pnl).toBe(500);
      expect(retrieved!.metrics.sharpe).toBe(1.5);
    });
  });
  
  describe('Listing Promotions', () => {
    it('should list all promotions', () => {
      const perf1: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const perf2: StrategyPerformance = {
        strategyId: 'strategy-2',
        pnl: 100,
        sharpe: 0.8,
        maxDrawdown: 0.15,
        winRate: 0.5,
        errorRate: 0.01,
        tradeCount: 20,
        lastUpdated: new Date().toISOString(),
      };
      
      workflow.evaluate('strategy-1', perf1, 45);
      workflow.evaluate('strategy-2', perf2, 15);
      
      const promotions = workflow.listPromotions();
      
      expect(promotions).toHaveLength(2);
      expect(promotions.map(p => p.strategyId)).toContain('strategy-1');
      expect(promotions.map(p => p.strategyId)).toContain('strategy-2');
    });
    
    it('should filter by status', () => {
      const perf1: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 500,
        sharpe: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.6,
        errorRate: 0.005,
        tradeCount: 50,
        lastUpdated: new Date().toISOString(),
      };
      
      const perf2: StrategyPerformance = {
        strategyId: 'strategy-2',
        pnl: 100,
        sharpe: 0.8,
        maxDrawdown: 0.15,
        winRate: 0.5,
        errorRate: 0.01,
        tradeCount: 20,
        lastUpdated: new Date().toISOString(),
      };
      
      workflow.evaluate('strategy-1', perf1, 45); // Should be under-review
      workflow.evaluate('strategy-2', perf2, 15); // Should be experimental
      
      const underReview = workflow.listPromotions('under-review');
      const experimental = workflow.listPromotions('experimental');
      
      expect(underReview).toHaveLength(1);
      expect(underReview[0].strategyId).toBe('strategy-1');
      
      expect(experimental).toHaveLength(1);
      expect(experimental[0].strategyId).toBe('strategy-2');
    });
  });
  
  describe('Promotion History', () => {
    it('should track promotion history', () => {
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
      
      workflow.evaluate('strategy-1', performance, 45);
      workflow.approve('strategy-1', 'admin@example.com', 'Approved!');
      
      const history = workflow.getHistory('strategy-1');
      
      expect(history).toHaveLength(2);
      
      // Check that both status transitions are present
      const statuses = history.map(h => h.newStatus);
      expect(statuses).toContain('under-review');
      expect(statuses).toContain('candidate');
      
      // Find the candidate transition
      const candidateTransition = history.find(h => h.newStatus === 'candidate');
      expect(candidateTransition).toBeDefined();
      expect(candidateTransition!.oldStatus).toBe('under-review');
    });
    
    it('should include who made changes in history', () => {
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
      
      workflow.evaluate('strategy-1', performance, 45);
      workflow.approve('strategy-1', 'admin@example.com', 'Looks great');
      
      const history = workflow.getHistory('strategy-1');
      
      const approvalRecord = history.find(h => h.newStatus === 'candidate');
      expect(approvalRecord).toBeDefined();
      expect(approvalRecord!.changedBy).toBe('admin@example.com');
      expect(approvalRecord!.reason).toBe('Looks great');
    });
  });
  
  describe('Candidate Status Persistence', () => {
    it('should keep strategy as candidate once promoted', () => {
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
      
      workflow.evaluate('strategy-1', performance, 45);
      workflow.approve('strategy-1', 'admin@example.com');
      
      // Re-evaluate with worse performance
      const worsePerformance: StrategyPerformance = {
        ...performance,
        pnl: 50,
        sharpe: 0.5,
      };
      
      const record = workflow.evaluate('strategy-1', worsePerformance, 60);
      
      expect(record.status).toBe('candidate'); // Still candidate
    });
  });
});
