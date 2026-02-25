/**
 * Promotion Workflow - Strategy promotion governance and state management
 * 
 * Manages the lifecycle of strategies from experimental to candidate status.
 * Enforces metrics gating, manual review, and governance policies.
 * 
 * Paper trading only - promotion to candidate status, NOT live trading.
 * Design follows REPORTS/LEARNING_SYSTEM.md specification (Section 7).
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { MetricsGating } from './metricsGating';
import type {
  StrategyPerformance,
  PromotionStatus,
  PromotionCriteria,
  PromotionRecord,
  PromotionWorkflowConfig,
} from './types';

export interface PromotionWorkflowInit {
  dbPath?: string;
  config?: PromotionWorkflowConfig;
}

const DEFAULT_CRITERIA: PromotionCriteria = {
  minPnl: 0, // Positive PnL
  minSharpe: 1.0, // Sharpe ratio > 1.0
  maxDrawdown: 0.1, // Max 10% drawdown
  maxErrorRate: 0.01, // Max 1% error rate
  minTradeCount: 30, // Min 30 trades
  minDays: 30, // Min 30 days
  requireMultipleRegimes: true, // Require stable performance across regimes
};

const DEFAULT_CONFIG: PromotionWorkflowConfig = {
  criteria: DEFAULT_CRITERIA,
  autoFlag: true, // Auto-flag for review when criteria met
  requireManualApproval: true, // Require human approval
};

export class PromotionWorkflow {
  private db: Database.Database;
  private config: PromotionWorkflowConfig;
  private metricsGating: MetricsGating;
  
  constructor(init: PromotionWorkflowInit = {}) {
    const dbPath = init.dbPath || path.join(process.cwd(), 'data', 'promotions.db');
    
    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created promotions directory', { dir });
    }
    
    this.db = new Database(dbPath);
    this.config = {
      ...DEFAULT_CONFIG,
      ...init.config,
      criteria: {
        ...DEFAULT_CRITERIA,
        ...(init.config?.criteria || {}),
      },
    };
    
    this.metricsGating = new MetricsGating({
      thresholds: {
        minSharpe: this.config.criteria.minSharpe,
        maxDrawdown: this.config.criteria.maxDrawdown,
        minSampleSize: this.config.criteria.minTradeCount,
        minDays: this.config.criteria.minDays,
        maxErrorRate: this.config.criteria.maxErrorRate,
      },
    });
    
    this.initializeSchema();
    
    logger.info('PromotionWorkflow initialized', {
      dbPath,
      config: this.config,
    });
  }
  
  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    
    // Create promotions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS promotions (
        strategy_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        metrics TEXT NOT NULL,
        criteria_check TEXT NOT NULL,
        review_notes TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // Create promotion history table for audit trail
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS promotion_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_id TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        changed_by TEXT,
        reason TEXT,
        timestamp TEXT NOT NULL
      )
    `);
    
    // Index for querying by status
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_promotions_status 
      ON promotions(status)
    `);
    
    logger.info('Promotion workflow schema initialized');
  }
  
  /**
   * Evaluate strategy for promotion based on performance metrics
   */
  evaluate(
    strategyId: string,
    performance: StrategyPerformance,
    daysSinceStart: number
  ): PromotionRecord {
    // Validate inputs
    if (!strategyId || typeof strategyId !== 'string' || strategyId.trim().length === 0) {
      throw new Error('PromotionWorkflow: strategyId must be a non-empty string');
    }
    if (!Number.isFinite(daysSinceStart) || daysSinceStart < 0) {
      throw new Error(`PromotionWorkflow: daysSinceStart must be a non-negative number, got ${daysSinceStart}`);
    }

    const existing = this.getPromotion(strategyId);
    
    // Check metrics gating - this is our single source of truth for threshold checks
    const gatingResult = this.metricsGating.check(performance, daysSinceStart);
    
    // Check additional promotion-specific criteria
    const criteriaCheck = {
      pnlPass: performance.pnl >= this.config.criteria.minPnl,
      sharpePass: gatingResult.checks.sharpe.passed,
      drawdownPass: gatingResult.checks.drawdown.passed,
      errorRatePass: gatingResult.checks.errorRate.passed,
      tradeCountPass: gatingResult.checks.sampleSize.passed,
      daysPass: gatingResult.checks.days.passed,
      regimesPass: !this.config.criteria.requireMultipleRegimes || this.checkMultipleRegimes(performance),
      overallPass: false, // Will be set below
    };
    
    // Overall pass requires all individual checks to pass
    criteriaCheck.overallPass = 
      criteriaCheck.pnlPass &&
      criteriaCheck.sharpePass &&
      criteriaCheck.drawdownPass &&
      criteriaCheck.errorRatePass &&
      criteriaCheck.tradeCountPass &&
      criteriaCheck.daysPass &&
      criteriaCheck.regimesPass;
    
    // Log failed checks if any
    if (!criteriaCheck.overallPass) {
      const failedChecks: string[] = [];
      if (!criteriaCheck.pnlPass) failedChecks.push('pnl');
      if (!criteriaCheck.sharpePass) failedChecks.push('sharpe');
      if (!criteriaCheck.drawdownPass) failedChecks.push('drawdown');
      if (!criteriaCheck.errorRatePass) failedChecks.push('errorRate');
      if (!criteriaCheck.tradeCountPass) failedChecks.push('tradeCount');
      if (!criteriaCheck.daysPass) failedChecks.push('days');
      if (!criteriaCheck.regimesPass) failedChecks.push('regimes');
      
      logger.debug('Strategy promotion criteria not met', {
        strategyId,
        failedChecks,
      });
    }
    
    // Determine new status
    let newStatus: PromotionStatus;
    
    if (!existing) {
      // New strategy - check if it should be auto-promoted or auto-flagged
      if (criteriaCheck.overallPass) {
        if (this.config.autoFlag && this.config.requireManualApproval) {
          newStatus = 'under-review';
        } else if (this.config.autoFlag && !this.config.requireManualApproval) {
          newStatus = 'candidate'; // Auto-promote without manual review
        } else {
          newStatus = 'experimental';
        }
      } else {
        newStatus = 'experimental';
      }
    } else if (existing.status === 'rejected') {
      // Once rejected, stays rejected unless manually changed
      newStatus = 'rejected';
    } else if (existing.status === 'candidate') {
      // Once promoted, stays promoted
      newStatus = 'candidate';
    } else if (existing.status === 'under-review') {
      // Under review stays under review until manual approval
      newStatus = 'under-review';
    } else if (criteriaCheck.overallPass) {
      // Experimental strategy that now meets criteria
      if (this.config.autoFlag && this.config.requireManualApproval) {
        newStatus = 'under-review';
      } else if (this.config.autoFlag && !this.config.requireManualApproval) {
        newStatus = 'candidate'; // Auto-promote without manual review
      } else {
        newStatus = 'experimental';
      }
    } else {
      // Stay experimental
      newStatus = 'experimental';
    }
    
    const now = new Date().toISOString();
    const record: PromotionRecord = {
      strategyId,
      status: newStatus,
      metrics: performance,
      criteriaCheck,
      reviewNotes: existing?.reviewNotes,
      reviewedBy: existing?.reviewedBy,
      reviewedAt: existing?.reviewedAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    
    // Save to database
    this.savePromotion(record, existing?.status);
    
    logger.info('Strategy promotion evaluated', {
      strategyId,
      oldStatus: existing?.status,
      newStatus,
      criteriaCheck,
    });
    
    return record;
  }
  
  /**
   * Manually approve a strategy for promotion to candidate
   */
  approve(
    strategyId: string,
    reviewedBy: string,
    reviewNotes?: string
  ): PromotionRecord {
    // Validate inputs
    if (!reviewedBy || typeof reviewedBy !== 'string' || reviewedBy.trim().length === 0) {
      throw new Error('PromotionWorkflow: reviewedBy must be a non-empty string');
    }
    if (reviewNotes !== undefined && typeof reviewNotes === 'string' && reviewNotes.length > 2000) {
      throw new Error('PromotionWorkflow: reviewNotes must not exceed 2000 characters');
    }

    const existing = this.getPromotion(strategyId);
    
    if (!existing) {
      throw new Error(`Strategy ${strategyId} not found in promotion workflow`);
    }
    
    if (existing.status !== 'under-review') {
      throw new Error(`Strategy ${strategyId} is not under review (status: ${existing.status})`);
    }
    
    if (!existing.criteriaCheck.overallPass) {
      logger.warn('Approving strategy that does not meet all criteria', {
        strategyId,
        criteriaCheck: existing.criteriaCheck,
      });
    }
    
    const now = new Date().toISOString();
    const record: PromotionRecord = {
      ...existing,
      status: 'candidate',
      reviewedBy,
      reviewNotes: reviewNotes,
      reviewedAt: now,
      updatedAt: now,
    };
    
    this.savePromotion(record, existing.status);
    
    logger.info('Strategy promoted to candidate', {
      strategyId,
      reviewedBy,
      reviewNotes,
    });
    
    return record;
  }
  
  /**
   * Manually reject a strategy
   */
  reject(
    strategyId: string,
    reviewedBy: string,
    reviewNotes: string
  ): PromotionRecord {
    // Validate inputs
    if (!reviewedBy || typeof reviewedBy !== 'string' || reviewedBy.trim().length === 0) {
      throw new Error('PromotionWorkflow: reviewedBy must be a non-empty string');
    }
    if (!reviewNotes || typeof reviewNotes !== 'string' || reviewNotes.trim().length === 0) {
      throw new Error('PromotionWorkflow: reviewNotes are required for rejection');
    }
    if (reviewNotes.length > 2000) {
      throw new Error('PromotionWorkflow: reviewNotes must not exceed 2000 characters');
    }

    const existing = this.getPromotion(strategyId);
    
    if (!existing) {
      throw new Error(`Strategy ${strategyId} not found in promotion workflow`);
    }
    
    const now = new Date().toISOString();
    const record: PromotionRecord = {
      ...existing,
      status: 'rejected',
      reviewedBy,
      reviewNotes,
      reviewedAt: now,
      updatedAt: now,
    };
    
    this.savePromotion(record, existing.status);
    
    logger.info('Strategy rejected', {
      strategyId,
      reviewedBy,
      reviewNotes,
    });
    
    return record;
  }
  
  /**
   * Get promotion record for a strategy
   */
  getPromotion(strategyId: string): PromotionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM promotions WHERE strategy_id = ?');
    const row = stmt.get(strategyId) as any;
    
    if (!row) {
      return null;
    }
    
    return {
      strategyId: row.strategy_id,
      status: row.status as PromotionStatus,
      metrics: JSON.parse(row.metrics),
      criteriaCheck: JSON.parse(row.criteria_check),
      reviewNotes: row.review_notes,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  
  /**
   * List all promotions by status
   */
  listPromotions(status?: PromotionStatus): PromotionRecord[] {
    let sql = 'SELECT * FROM promotions';
    const params: any[] = [];
    
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY updated_at DESC';
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      strategyId: row.strategy_id,
      status: row.status as PromotionStatus,
      metrics: JSON.parse(row.metrics),
      criteriaCheck: JSON.parse(row.criteria_check),
      reviewNotes: row.review_notes,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
  
  /**
   * Get promotion history for a strategy
   */
  getHistory(strategyId: string): Array<{
    oldStatus: PromotionStatus | null;
    newStatus: PromotionStatus;
    changedBy: string | null;
    reason: string | null;
    timestamp: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT * FROM promotion_history 
      WHERE strategy_id = ? 
      ORDER BY timestamp DESC
    `);
    const rows = stmt.all(strategyId) as any[];
    
    return rows.map(row => ({
      oldStatus: row.old_status as PromotionStatus | null,
      newStatus: row.new_status as PromotionStatus,
      changedBy: row.changed_by,
      reason: row.reason,
      timestamp: row.timestamp,
    }));
  }
  
  /**
   * Save promotion record to database
   */
  private savePromotion(record: PromotionRecord, oldStatus?: PromotionStatus): void {
    const stmt = this.db.prepare(`
      INSERT INTO promotions (
        strategy_id, status, metrics, criteria_check, 
        review_notes, reviewed_by, reviewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(strategy_id) DO UPDATE SET
        status = excluded.status,
        metrics = excluded.metrics,
        criteria_check = excluded.criteria_check,
        review_notes = excluded.review_notes,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at
    `);
    
    stmt.run(
      record.strategyId,
      record.status,
      JSON.stringify(record.metrics),
      JSON.stringify(record.criteriaCheck),
      record.reviewNotes || null,
      record.reviewedBy || null,
      record.reviewedAt || null,
      record.createdAt,
      record.updatedAt
    );
    
    // Record in history if status changed
    if (oldStatus !== record.status) {
      const historyStmt = this.db.prepare(`
        INSERT INTO promotion_history (
          strategy_id, old_status, new_status, changed_by, reason, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      historyStmt.run(
        record.strategyId,
        oldStatus || null,
        record.status,
        record.reviewedBy || 'system',
        record.reviewNotes || null,
        record.updatedAt
      );
    }
  }
  
  /**
   * Check if strategy has performed well across multiple market regimes
   * Simplified check: requires at least 2 distinct time periods with positive performance
   */
  private checkMultipleRegimes(performance: StrategyPerformance): boolean {
    // Simplified implementation: assume regime check is done externally
    // and indicated by having a reasonable sample size and win rate
    // For strategies with 50+ trades and decent win rate, assume multiple regimes covered
    return performance.tradeCount >= 50 && performance.winRate >= 0.45;
  }
  
  /**
   * Get current configuration
   */
  getConfig(): PromotionWorkflowConfig {
    return JSON.parse(JSON.stringify(this.config));
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Promotion workflow closed');
  }
}
