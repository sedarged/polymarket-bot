/**
 * Backtesting Engine Implementation
 * 
 * Provides historical replay and evaluation of trading strategies using event store data.
 * Supports configurable time ranges, metrics computation, and reproducible backtests.
 * 
 * Features:
 * - Historical event replay
 * - Configurable start/end dates
 * - Strategy simulation with paper trading
 * - Metrics computation (PnL, Sharpe, drawdown, win rate)
 * - Reproducible results with seeded randomness
 * - Backtest persistence for comparison
 * 
 * Design follows REPORTS/LEARNING_SYSTEM.md specification.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { EventStore } from './eventStore';
import type {
  BacktestConfig,
  BacktestResult,
  BacktestRow,
  EventEnvelope,
  MarketEvent,
} from './types';

/**
 * Simple seeded random number generator for reproducible backtests
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

export interface BacktestEngineConfig {
  path?: string;
  readonly?: boolean;
  eventStore: EventStore;
}

export interface BacktestMetrics {
  pnl: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  avgTradeSize: number;
}

export class BacktestEngine {
  private db: Database.Database;
  private eventStore: EventStore;

  constructor(config: BacktestEngineConfig) {
    const dbPath = config.path || path.join(process.cwd(), 'data', 'backtests.db');
    
    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created backtest directory', { dir });
    }
    
    this.db = new Database(dbPath, { readonly: config.readonly ?? false });
    this.eventStore = config.eventStore;
    logger.info('Backtest engine initialized', { path: dbPath });

    if (!config.readonly) {
      this.initializeSchema();
    }
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // Create backtests table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS backtests (
        backtest_id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        config TEXT NOT NULL,
        result TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        error TEXT
      )
    `);

    // Indexes for efficient queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_backtests_strategy 
      ON backtests(strategy_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_backtests_status 
      ON backtests(status)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_backtests_created 
      ON backtests(created_at)
    `);

    logger.info('Backtest engine schema initialized');
  }

  /**
   * Run a backtest with the given configuration
   * Returns backtest ID for tracking
   */
  async runBacktest(config: Omit<BacktestConfig, 'backtestId'>): Promise<string> {
    const backtestId = uuidv4();
    const fullConfig: BacktestConfig = {
      ...config,
      backtestId,
    };

    // Store backtest record
    const now = new Date().toISOString();
    const insertStmt = this.db.prepare(`
      INSERT INTO backtests (
        backtest_id, strategy_id, config, status, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      backtestId,
      config.strategyId,
      JSON.stringify(fullConfig),
      'running',
      now
    );

    logger.info('Backtest started', {
      backtestId,
      strategyId: config.strategyId,
      startDate: config.startDate,
      endDate: config.endDate,
    });

    try {
      // Execute backtest
      const result = await this.executeBacktest(fullConfig);

      // Update with results
      const updateStmt = this.db.prepare(`
        UPDATE backtests 
        SET result = ?, status = ?, completed_at = ? 
        WHERE backtest_id = ?
      `);

      updateStmt.run(
        JSON.stringify(result),
        'completed',
        new Date().toISOString(),
        backtestId
      );

      logger.info('Backtest completed', {
        backtestId,
        pnl: result.metrics.pnl,
        sharpe: result.metrics.sharpe,
        totalTrades: result.metrics.totalTrades,
      });

      return backtestId;
    } catch (error) {
      // Update with error
      const errorStmt = this.db.prepare(`
        UPDATE backtests 
        SET status = ?, completed_at = ?, error = ? 
        WHERE backtest_id = ?
      `);

      const errorMessage = error instanceof Error ? error.message : String(error);
      errorStmt.run('failed', new Date().toISOString(), errorMessage, backtestId);

      logger.error('Backtest failed', {
        backtestId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Execute the backtest simulation
   */
  private async executeBacktest(config: BacktestConfig): Promise<BacktestResult> {
    // Fetch historical events for the time range and markets
    const events: EventEnvelope<MarketEvent>[] = [];
    
    for (const marketId of config.markets) {
      const marketEvents = this.eventStore.queryEvents({
        startDate: config.startDate,
        endDate: config.endDate,
        marketId,
        eventType: 'MarketEvent',
      }) as EventEnvelope<MarketEvent>[];

      events.push(...marketEvents);
    }

    // Sort events by timestamp for chronological replay
    events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    logger.info('Replaying events', {
      backtestId: config.backtestId,
      eventCount: events.length,
    });

    // Initialize seeded random if seed provided
    const random = config.seed !== undefined ? new SeededRandom(config.seed) : null;
    const getRandomValue = () => (random ? random.next() : Math.random());

    // Simulate trading with proper position tracking
    const trades: BacktestResult['trades'] = [];
    let balance = config.initialBalance;
    let positionSize = 0; // >0 long, <0 short
    let positionAvgPrice = 0; // average entry price of open position
    let realizedPnl = 0; // cumulative realized PnL (net of fees)
    let peakBalance = balance;
    let maxDrawdown = 0;
    const pnlHistory: number[] = [];

    // Placeholder: In real implementation, strategy would generate signals
    // For now, simple random trading to demonstrate metrics calculation
    for (const event of events) {
      const marketEvent = event.payload;
      const markPrice = marketEvent.mid;

      // Example trade logic (replace with actual strategy)
      // This is a placeholder for demonstration
      if (getRandomValue() < 0.01) {
        // 1% chance to trade per event
        const side: 'buy' | 'sell' = getRandomValue() < 0.5 ? 'buy' : 'sell';
        const size = 10;

        // Apply slippage to get execution price
        const execPrice =
          side === 'buy'
            ? markPrice * (1 + config.slippage)
            : markPrice * (1 - config.slippage);

        // Trade notional value
        const notional = execPrice * size;
        const fee = notional * config.feeRate;

        // Calculate realized PnL from this trade
        let tradeRealizedPnl = 0;
        let sizeToFill = size;

        if (side === 'buy') {
          // Closing or reducing a short position
          if (positionSize < 0) {
            const closingSize = Math.min(sizeToFill, -positionSize);
            tradeRealizedPnl += (positionAvgPrice - execPrice) * closingSize;
            positionSize += closingSize; // positionSize is negative
            sizeToFill -= closingSize;

            // If position fully closed, reset avg price
            if (positionSize === 0) {
              positionAvgPrice = 0;
            }
          }

          // Opening or increasing a long position
          if (sizeToFill > 0) {
            const newPositionSize = positionSize + sizeToFill;
            positionAvgPrice =
              positionSize === 0
                ? execPrice
                : (positionAvgPrice * positionSize + execPrice * sizeToFill) /
                  newPositionSize;
            positionSize = newPositionSize;
          }
        } else {
          // side === 'sell'
          // Closing or reducing a long position
          if (positionSize > 0) {
            const closingSize = Math.min(sizeToFill, positionSize);
            tradeRealizedPnl += (execPrice - positionAvgPrice) * closingSize;
            positionSize -= closingSize;
            sizeToFill -= closingSize;

            // If position fully closed, reset avg price
            if (positionSize === 0) {
              positionAvgPrice = 0;
            }
          }

          // Opening or increasing a short position
          if (sizeToFill > 0) {
            const newPositionSize = positionSize - sizeToFill;
            positionAvgPrice =
              positionSize === 0
                ? execPrice
                : (positionAvgPrice * Math.abs(positionSize) +
                    execPrice * sizeToFill) /
                  Math.abs(newPositionSize);
            positionSize = newPositionSize;
          }
        }

        // Apply fee to realized PnL
        tradeRealizedPnl -= fee;
        realizedPnl += tradeRealizedPnl;

        // Update balance
        balance = config.initialBalance + realizedPnl;

        // Calculate unrealized PnL from remaining open position
        const unrealizedPnl =
          positionSize !== 0 ? positionSize * (markPrice - positionAvgPrice) : 0;
        const totalPnl = realizedPnl + unrealizedPnl;

        trades.push({
          timestamp: event.occurredAt,
          marketId: event.marketId,
          side,
          price: execPrice,
          size,
          pnl: tradeRealizedPnl,
        });

        pnlHistory.push(totalPnl);

        // Track drawdown based on total equity (balance + unrealized)
        const equity = balance + unrealizedPnl;
        if (equity > peakBalance) {
          peakBalance = equity;
        } else {
          const drawdown = (peakBalance - equity) / peakBalance;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }
      }
    }

    // Compute metrics
    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const winRate = trades.length > 0 ? winningTrades / trades.length : 0;
    const avgTradeSize =
      trades.length > 0
        ? trades.reduce((sum, t) => sum + t.size, 0) / trades.length
        : 0;

    // Sharpe ratio calculation (simplified)
    const sharpe = this.calculateSharpeRatio(pnlHistory);

    const result: BacktestResult = {
      backtestId: config.backtestId,
      strategyId: config.strategyId,
      config,
      metrics: {
        pnl: realizedPnl,
        sharpe,
        maxDrawdown,
        winRate,
        totalTrades: trades.length,
        avgTradeSize,
      },
      trades,
      completedAt: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Calculate Sharpe ratio from PnL history
   */
  private calculateSharpeRatio(pnlHistory: number[]): number {
    if (pnlHistory.length < 2) {
      return 0;
    }

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < pnlHistory.length; i++) {
      returns.push(pnlHistory[i] - pnlHistory[i - 1]);
    }

    // Mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Standard deviation of returns
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Sharpe ratio (assuming risk-free rate = 0)
    return stdDev > 0 ? meanReturn / stdDev : 0;
  }

  /**
   * Get backtest result by ID
   */
  getBacktest(backtestId: string): BacktestResult | null {
    const stmt = this.db.prepare(`
      SELECT * FROM backtests WHERE backtest_id = ?
    `);

    const row = stmt.get(backtestId) as BacktestRow | undefined;

    if (!row || !row.result) {
      return null;
    }

    return JSON.parse(row.result) as BacktestResult;
  }

  /**
   * List backtests for a strategy
   */
  listBacktests(strategyId: string): Array<{
    backtestId: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT backtest_id, status, created_at, completed_at 
      FROM backtests 
      WHERE strategy_id = ? 
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(strategyId) as Array<{
      backtest_id: string;
      status: string;
      created_at: string;
      completed_at: string | null;
    }>;

    return rows.map((row) => ({
      backtestId: row.backtest_id,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }

  /**
   * Get engine stats
   */
  getStats(): {
    totalBacktests: number;
    completedBacktests: number;
    failedBacktests: number;
    runningBacktests: number;
  } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM backtests');
    const totalRow = totalStmt.get() as { count: number };

    const completedStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM backtests WHERE status = 'completed'"
    );
    const completedRow = completedStmt.get() as { count: number };

    const failedStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM backtests WHERE status = 'failed'"
    );
    const failedRow = failedStmt.get() as { count: number };

    const runningStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM backtests WHERE status = 'running'"
    );
    const runningRow = runningStmt.get() as { count: number };

    return {
      totalBacktests: totalRow.count,
      completedBacktests: completedRow.count,
      failedBacktests: failedRow.count,
      runningBacktests: runningRow.count,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Backtest engine closed');
  }
}
