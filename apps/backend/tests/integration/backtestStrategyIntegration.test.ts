/**
 * Integration Tests for Backtest Engine + Strategy Framework
 * 
 * Tests the complete integration between BacktestEngine and all strategies:
 * - Random Strategy
 * - Arbitrage Strategy
 * - Mean Reversion Strategy
 * - Market Making Strategy
 * 
 * Verifies that strategies can be backtested with minimal/no code changes.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { BacktestEngine } from '../../src/learning/backtestEngine';
import { EventStore } from '../../src/learning/eventStore';
import { registerStrategies, StrategyFactory } from '../../src/trading/strategies';
import type { MarketEvent } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('Backtest Engine + Strategy Framework Integration', () => {
  let engine: BacktestEngine;
  let eventStore: EventStore;
  const testBacktestDbPath = path.join(process.cwd(), 'data', 'test-strategy-backtests.db');
  const testEventsDbPath = path.join(process.cwd(), 'data', 'test-strategy-backtest-events.db');

  const deleteTestDbFiles = (dbPath: string) => {
    const dbFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const filePath of dbFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  };

  beforeAll(() => {
    // Register all strategies
    registerStrategies();
  });

  beforeEach(() => {
    // Clean up any existing test databases
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
    
    // Clean up test databases
    deleteTestDbFiles(testBacktestDbPath);
    deleteTestDbFiles(testEventsDbPath);
    
    // Clear strategies
    StrategyFactory.clear();
    registerStrategies(); // Re-register for next test
  });

  describe('Random Strategy Integration', () => {
    it('should backtest RandomStrategy successfully', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'random',
        strategyConfig: {
          buyProbability: 0.3,
          sellProbability: 0.3,
          maxSize: 10,
          minSpread: 0.01,
          seed: 42, // For reproducibility
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
        seed: 42,
      });

      expect(backtestId).toBeDefined();
      
      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.strategyId).toBe('random');
      expect(result?.metrics).toBeDefined();
      expect(typeof result?.metrics.pnl).toBe('number');
      expect(typeof result?.metrics.sharpe).toBe('number');
      expect(typeof result?.metrics.totalTrades).toBe('number');
    });

    it('should produce reproducible results with same seed', async () => {
      const config = {
        strategyId: 'random',
        strategyConfig: {
          buyProbability: 0.4,
          sellProbability: 0.4,
          seed: 12345,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
        seed: 12345,
      };

      const backtestId1 = await engine.runBacktest(config);
      const result1 = engine.getBacktest(backtestId1);

      const backtestId2 = await engine.runBacktest(config);
      const result2 = engine.getBacktest(backtestId2);

      expect(result1?.metrics.totalTrades).toBe(result2?.metrics.totalTrades);
      expect(result1?.metrics.pnl).toBeCloseTo(result2?.metrics.pnl, 6);
    });
  });

  describe('Arbitrage Strategy Integration', () => {
    it('should backtest ArbitrageStrategy successfully', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'arbitrage',
        strategyConfig: {
          minProfitBps: 50,
          feeRate: 0.02,
          maxOrderSize: 100,
          minLiquidity: 50,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      expect(backtestId).toBeDefined();
      
      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.strategyId).toBe('arbitrage');
      expect(result?.metrics).toBeDefined();
    });

    it('should handle arbitrage parameters correctly', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'arbitrage',
        strategyConfig: {
          minProfitBps: 100, // More conservative
          maxOrderSize: 50,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.strategyId).toBe('arbitrage');
    });
  });

  describe('Mean Reversion Strategy Integration', () => {
    it('should backtest MeanReversionStrategy successfully', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'mean-reversion',
        strategyConfig: {
          lookbackPeriod: 10,
          minSpread: 0.01,
          maxPositionSize: 50,
          entryThreshold: 1.5,
          exitThreshold: 0.5,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      expect(backtestId).toBeDefined();
      
      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.strategyId).toBe('mean-reversion');
      expect(result?.metrics).toBeDefined();
    });
  });

  describe('Market Making Strategy Integration', () => {
    it('should backtest MarketMakingStrategy successfully', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'market-making',
        strategyConfig: {
          spreadBps: 100,
          orderSize: 10,
          maxInventory: 100,
          inventorySkew: true,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
      });

      expect(backtestId).toBeDefined();
      
      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      expect(result?.strategyId).toBe('market-making');
      expect(result?.metrics).toBeDefined();
    });
  });

  describe('Multiple Markets', () => {
    it('should backtest strategy across multiple markets', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'random',
        strategyConfig: {
          buyProbability: 0.2,
          sellProbability: 0.2,
          seed: 999,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1', 'market-2'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
        seed: 999,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      
      // Should have trades from multiple markets
      const trades = result?.trades ?? [];
      expect(trades.length).toBeGreaterThan(0);
      const marketIds = new Set(trades.map(t => t.marketId));
      expect(marketIds.size).toBeGreaterThan(1);
    });
  });

  describe('Metrics Computation', () => {
    it('should compute all required metrics for strategy backtest', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'random',
        strategyConfig: {
          buyProbability: 0.5,
          sellProbability: 0.5,
          seed: 555,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
        seed: 555,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      
      const metrics = result?.metrics;
      expect(metrics).toBeDefined();
      
      // All metrics should be present
      expect(typeof metrics?.pnl).toBe('number');
      expect(typeof metrics?.sharpe).toBe('number');
      expect(typeof metrics?.maxDrawdown).toBe('number');
      expect(typeof metrics?.winRate).toBe('number');
      expect(typeof metrics?.totalTrades).toBe('number');
      expect(typeof metrics?.avgTradeSize).toBe('number');
      
      // Metrics should be in valid ranges
      expect(metrics?.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(metrics?.maxDrawdown).toBeLessThanOrEqual(1);
      expect(metrics?.winRate).toBeGreaterThanOrEqual(0);
      expect(metrics?.winRate).toBeLessThanOrEqual(1);
      expect(metrics?.totalTrades).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Standard Format Output', () => {
    it('should output results in standard format', async () => {
      const backtestId = await engine.runBacktest({
        strategyId: 'random',
        strategyConfig: {
          seed: 777,
        },
        startDate: '2026-02-06T10:00:00.000Z',
        endDate: '2026-02-06T12:00:00.000Z',
        markets: ['market-1'],
        initialBalance: 10000,
        slippage: 0.01,
        feeRate: 0.002,
        seed: 777,
      });

      const result = engine.getBacktest(backtestId);
      expect(result).toBeDefined();
      
      // Standard format verification
      expect(result).toHaveProperty('backtestId');
      expect(result).toHaveProperty('strategyId');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('completedAt');
      
      // Config should be preserved
      expect(result?.config.strategyId).toBe('random');
      expect(result?.config.strategyConfig).toBeDefined();
      
      // Trades should have standard fields
      if (result && result.trades.length > 0) {
        const trade = result.trades[0];
        expect(trade).toHaveProperty('timestamp');
        expect(trade).toHaveProperty('marketId');
        expect(trade).toHaveProperty('side');
        expect(trade).toHaveProperty('price');
        expect(trade).toHaveProperty('size');
        expect(trade).toHaveProperty('pnl');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid strategy type gracefully', async () => {
      await expect(
        engine.runBacktest({
          strategyId: 'non-existent-strategy',
          strategyConfig: {},
          startDate: '2026-02-06T10:00:00.000Z',
          endDate: '2026-02-06T12:00:00.000Z',
          markets: ['market-1'],
          initialBalance: 10000,
          slippage: 0.01,
          feeRate: 0.002,
        })
      ).rejects.toThrow();
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
      bestBid: Math.max(0.01, Math.min(0.99, baseEvent.bestBid + variation)),
      bestAsk: Math.max(0.01, Math.min(0.99, baseEvent.bestAsk + variation)),
      mid: Math.max(0.01, Math.min(0.99, baseEvent.mid + variation)),
    };

    eventStore.writeEvent('MarketEvent', 'market-1', 'websocket', event, timestamp);
  }

  // Add events for market-2
  for (let i = 0; i < 8; i++) {
    const timestamp = new Date(2026, 1, 6, 10, i * 15).toISOString();
    
    const variation = (Math.random() - 0.5) * 0.08;
    const event: MarketEvent = {
      ...baseEvent,
      bestBid: Math.max(0.01, Math.min(0.99, baseEvent.bestBid + variation)),
      bestAsk: Math.max(0.01, Math.min(0.99, baseEvent.bestAsk + variation)),
      mid: Math.max(0.01, Math.min(0.99, baseEvent.mid + variation)),
    };
    
    eventStore.writeEvent('MarketEvent', 'market-2', 'websocket', event, timestamp);
  }
}
