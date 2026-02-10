/**
 * Learning System Tests - Backtest Engine
 * 
 * Tests for historical replay and metrics computation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BacktestEngine } from '../../src/learning/backtestEngine';
import { EventStore } from '../../src/learning/eventStore';
import type { MarketEvent } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('BacktestEngine', () => {
  let engine: BacktestEngine;
  let eventStore: EventStore;
  const testBacktestDbPath = path.join(process.cwd(), 'data', 'test-backtests.db');
  const testEventsDbPath = path.join(process.cwd(), 'data', 'test-backtest-events.db');

  const deleteTestDbFiles = (dbPath: string) => {
    const dbFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const filePath of dbFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  };

  beforeEach(() => {
    // Clean up any existing test databases (main files + WAL/SHM sidecars)
    deleteTestDbFiles(testBacktestDbPath);
    deleteTestDbFiles(testEventsDbPath);
    
    eventStore = new EventStore({ path: testEventsDbPath });
    engine = new BacktestEngine({ path: testBacktestDbPath, eventStore });

    // Seed with test market events
    seedTestEvents(eventStore);
  });

  afterEach(() => {
    engine.close();
    eventStore.close();
    
    // Clean up test databases (main files + WAL/SHM sidecars)
    deleteTestDbFiles(testBacktestDbPath);
    deleteTestDbFiles(testEventsDbPath);
  });

  describe('initialization', () => {
    it('should initialize with correct schema', () => {
      expect(engine).toBeDefined();
      const stats = engine.getStats();
      expect(stats.totalBacktests).toBe(0);
    });
  });

  describe('runBacktest', () => {
    it('should execute a backtest and return ID', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      expect(backtestId).toBeDefined();
      expect(typeof backtestId).toBe('string');

      const stats = engine.getStats();
      expect(stats.completedBacktests).toBe(1);
    });

    it('should compute metrics correctly', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.metrics).toBeDefined();
      expect(result?.metrics.pnl).toBeDefined();
      expect(result?.metrics.sharpe).toBeDefined();
      expect(result?.metrics.maxDrawdown).toBeDefined();
      expect(result?.metrics.winRate).toBeDefined();
      expect(result?.metrics.totalTrades).toBeDefined();
      expect(result?.metrics.avgTradeSize).toBeDefined();
    });

    it('should replay events chronologically', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      
      // Trades should be in chronological order
      if (result && result.trades.length > 1) {
        for (let i = 1; i < result.trades.length; i++) {
          expect(result.trades[i].timestamp >= result.trades[i - 1].timestamp).toBe(true);
        }
      }
    });

    it('should handle multiple markets', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1', 'market-2'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
    });

    it('should filter by time range', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:30:00.000Z',
        endDate: '2026-02-06T11:30:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      
      // All trades should be within the time range
      if (result) {
        for (const trade of result.trades) {
          expect(trade.timestamp >= '2026-02-06T10:30:00.000Z').toBe(true);
          expect(trade.timestamp <= '2026-02-06T11:30:00.000Z').toBe(true);
        }
      }
    });
  });

  describe('getBacktest', () => {
    it('should retrieve backtest result by ID', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.backtestId).toBe(backtestId);
      expect(result?.strategyId).toBe('strategy-1');
    });

    it('should return null for non-existent backtest', () => {
      const result = engine.getBacktest('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('listBacktests', () => {
    it('should list backtests for a strategy', async () => {
      await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-07T10:00:00.000Z',
        endDate: '2026-02-07T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const backtests = engine.listBacktests('strategy-1');
      expect(backtests).toHaveLength(2);
      expect(backtests.every((b) => b.status === 'completed')).toBe(true);
    });

    it('should order by created date descending', async () => {
      const id1 = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const id2 = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-07T10:00:00.000Z',
        endDate: '2026-02-07T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const backtests = engine.listBacktests('strategy-1');
      expect(backtests[0].backtestId).toBe(id2); // Most recent first
      expect(backtests[1].backtestId).toBe(id1);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive stats', async () => {
      await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const stats = engine.getStats();
      expect(stats.totalBacktests).toBe(1);
      expect(stats.completedBacktests).toBe(1);
      expect(stats.failedBacktests).toBe(0);
      expect(stats.runningBacktests).toBe(0);
    });
  });

  describe('metrics computation', () => {
    it('should calculate win rate correctly', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.metrics.winRate).toBeGreaterThanOrEqual(0);
      expect(result?.metrics.winRate).toBeLessThanOrEqual(1);
    });

    it('should calculate max drawdown correctly', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'strategy-1',
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result?.metrics.maxDrawdown).toBeLessThanOrEqual(1);
    });
  });
});

/**
 * Seed event store with test market events
 */
function seedTestEvents(eventStore: EventStore): void {
  const baseEvent: MarketEvent = {
    marketStatus: 'open',
    bestBid: 0.48,
    bestAsk: 0.52,
    mid: 0.50,
    spread: 0.04,
    liquidity: 1000,
    tickSize: 0.01,
  };

  // Create events at 15-minute intervals for 2 hours
  for (let i = 0; i < 8; i++) {
    const timestamp = new Date(2026, 1, 6, 10, i * 15).toISOString();
    
    // Vary prices slightly
    const variation = (Math.random() - 0.5) * 0.1;
    const event: MarketEvent = {
      ...baseEvent,
      bestBid: baseEvent.bestBid + variation,
      bestAsk: baseEvent.bestAsk + variation,
      mid: baseEvent.mid + variation,
    };

    eventStore.writeEvent('MarketEvent', 'market-1', 'websocket', event, timestamp);
  }

  // Add events for market-2
  for (let i = 0; i < 8; i++) {
    const timestamp = new Date(2026, 1, 6, 10, i * 15).toISOString();
    eventStore.writeEvent('MarketEvent', 'market-2', 'websocket', baseEvent, timestamp);
  }
}
