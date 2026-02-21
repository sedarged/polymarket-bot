/**
 * Integration test: Backtest with all Strategy types
 * 
 * Validates that all registered strategies can be used in backtests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BacktestEngine } from '../../src/learning/backtestEngine';
import { EventStore } from '../../src/learning/eventStore';
import { registerStrategies, StrategyFactory } from '../../src/trading/strategies';
import type { MarketEvent } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('Backtest + Strategy Integration', () => {
  let engine: BacktestEngine;
  let eventStore: EventStore;
  const testBacktestDbPath = path.join(process.cwd(), 'data', 'test-integration-backtests.db');
  const testEventsDbPath = path.join(process.cwd(), 'data', 'test-integration-events.db');

  const deleteTestDbFiles = (dbPath: string) => {
    const dbFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const filePath of dbFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  };

  const seedTestEvents = (store: EventStore) => {
    const baseTime = new Date('2026-02-20T10:00:00.000Z').getTime();
    
    // Generate 100 market events over 2 hours
    for (let i = 0; i < 100; i++) {
      const timestamp = new Date(baseTime + i * 60 * 1000).toISOString();
      const price = 0.5 + Math.sin(i / 10) * 0.2; // Oscillating price
      
      const event: MarketEvent = {
        marketStatus: 'open',
        bestBid: price - 0.02,
        bestAsk: price + 0.02,
        mid: price,
        spread: 0.04,
        liquidity: 1000,
        tickSize: 0.01,
      };
      
      store.writeEvent('MarketEvent', 'test-market', 'test', event, timestamp);
    }
  };

  beforeAll(() => {
    // Register all strategies
    registerStrategies();
  });

  beforeEach(() => {
    deleteTestDbFiles(testBacktestDbPath);
    deleteTestDbFiles(testEventsDbPath);
    
    eventStore = new EventStore({ path: testEventsDbPath });
    engine = new BacktestEngine({ path: testBacktestDbPath, eventStore });
    seedTestEvents(eventStore);
  });

  afterAll(() => {
    engine?.close();
    eventStore?.close();
    deleteTestDbFiles(testBacktestDbPath);
    deleteTestDbFiles(testEventsDbPath);
  });

  it('should list all registered strategies', () => {
    const types = StrategyFactory.getRegisteredTypes();
    expect(types).toContain('random');
    expect(types).toContain('arbitrage');
    expect(types).toContain('mean-reversion');
    expect(types).toContain('market-making');
  });

  it('should backtest with random strategy', async () => {
    const backtestId = await engine.runBacktest({
      strategyId: 'random',
      strategyConfig: { seed: 42 },
      startDate: '2026-02-20T10:00:00.000Z',
      endDate: '2026-02-20T12:00:00.000Z',
      markets: ['test-market'],
      initialBalance: 10000,
      slippage: 0.01,
      feeRate: 0.002,
      seed: 42,
    });

    const result = engine.getBacktest(backtestId);
    expect(result).toBeDefined();
    expect(result?.strategyId).toBe('random');
    expect(result?.metrics).toBeDefined();
  });

  it('should backtest with arbitrage strategy', async () => {
    const backtestId = await engine.runBacktest({
      strategyId: 'arbitrage',
      strategyConfig: {},
      startDate: '2026-02-20T10:00:00.000Z',
      endDate: '2026-02-20T12:00:00.000Z',
      markets: ['test-market'],
      initialBalance: 10000,
      slippage: 0.01,
      feeRate: 0.002,
    });

    const result = engine.getBacktest(backtestId);
    expect(result).toBeDefined();
    expect(result?.strategyId).toBe('arbitrage');
    expect(result?.metrics).toBeDefined();
  });

  it('should backtest with mean-reversion strategy', async () => {
    const backtestId = await engine.runBacktest({
      strategyId: 'mean-reversion',
      strategyConfig: {},
      startDate: '2026-02-20T10:00:00.000Z',
      endDate: '2026-02-20T12:00:00.000Z',
      markets: ['test-market'],
      initialBalance: 10000,
      slippage: 0.01,
      feeRate: 0.002,
    });

    const result = engine.getBacktest(backtestId);
    expect(result).toBeDefined();
    expect(result?.strategyId).toBe('mean-reversion');
    expect(result?.metrics).toBeDefined();
  });

  it('should backtest with market-making strategy', async () => {
    const backtestId = await engine.runBacktest({
      strategyId: 'market-making',
      strategyConfig: {},
      startDate: '2026-02-20T10:00:00.000Z',
      endDate: '2026-02-20T12:00:00.000Z',
      markets: ['test-market'],
      initialBalance: 10000,
      slippage: 0.01,
      feeRate: 0.002,
    });

    const result = engine.getBacktest(backtestId);
    expect(result).toBeDefined();
    expect(result?.strategyId).toBe('market-making');
    expect(result?.metrics).toBeDefined();
  });

  it('should handle strategy with custom strategyId suffix', async () => {
    const backtestId = await engine.runBacktest({
      strategyId: 'arbitrage-v2', // Custom suffix
      strategyConfig: {},
      startDate: '2026-02-20T10:00:00.000Z',
      endDate: '2026-02-20T12:00:00.000Z',
      markets: ['test-market'],
      initialBalance: 10000,
      slippage: 0.01,
      feeRate: 0.002,
    });

    const result = engine.getBacktest(backtestId);
    expect(result).toBeDefined();
    expect(result?.strategyId).toBe('arbitrage-v2');
  });
});
