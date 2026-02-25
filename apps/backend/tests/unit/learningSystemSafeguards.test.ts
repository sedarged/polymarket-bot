/**
 * Learning System Production Safeguards Tests - GAP-044
 *
 * Tests production-grade error handling and limits for learning system components:
 * - EventStore: input validation, payload size limit, query limit, event pruning
 * - BanditAllocator: config validation
 * - MetricsGating: threshold validation
 * - BacktestEngine: concurrency limit, config validation
 * - PromotionWorkflow: reviewer input validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventStore } from '../../src/learning/eventStore';
import { BanditAllocator } from '../../src/learning/banditAllocator';
import { MetricsGating } from '../../src/learning/metricsGating';
import { BacktestEngine } from '../../src/learning/backtestEngine';
import { PromotionWorkflow } from '../../src/learning/promotionWorkflow';
import type { MarketEvent, StrategyPerformance } from '../../src/learning/types';

// ─── EventStore safeguards ────────────────────────────────────────────────────

describe('EventStore - production safeguards', () => {
  let store: EventStore;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-safeguard-'));
    store = new EventStore({ path: path.join(testDir, 'events.db') });
  });

  afterEach(() => {
    store.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor validation', () => {
    it('should reject negative maxEvents', () => {
      expect(() => new EventStore({
        path: path.join(testDir, 'ev2.db'),
        maxEvents: -1,
      })).toThrow('maxEvents must be a non-negative integer');
    });

    it('should reject non-integer maxEvents', () => {
      expect(() => new EventStore({
        path: path.join(testDir, 'ev3.db'),
        maxEvents: 1.5,
      })).toThrow('maxEvents must be a non-negative integer');
    });
  });

  describe('writeEvent input validation', () => {
    const goodPayload: MarketEvent = {
      marketStatus: 'open',
      bestBid: 0.48,
      bestAsk: 0.52,
      mid: 0.50,
      spread: 0.04,
      liquidity: 1000,
      tickSize: 0.01,
    };

    it('should reject empty marketId', () => {
      expect(() => store.writeEvent('MarketEvent', '', 'websocket', goodPayload))
        .toThrow('marketId must be a non-empty string');
    });

    it('should reject whitespace-only marketId', () => {
      expect(() => store.writeEvent('MarketEvent', '   ', 'websocket', goodPayload))
        .toThrow('marketId must be a non-empty string');
    });

    it('should reject marketId exceeding max length', () => {
      const longId = 'a'.repeat(257);
      expect(() => store.writeEvent('MarketEvent', longId, 'websocket', goodPayload))
        .toThrow('exceeds maximum length');
    });

    it('should reject invalid eventType', () => {
      expect(() =>
        store.writeEvent('InvalidType' as any, 'market-1', 'websocket', goodPayload)
      ).toThrow('invalid eventType');
    });

    it('should reject invalid source', () => {
      expect(() =>
        store.writeEvent('MarketEvent', 'market-1', 'invalid-source' as any, goodPayload)
      ).toThrow('invalid source');
    });

    it('should reject payload exceeding 1 MB', () => {
      const bigPayload = { data: 'x'.repeat(1_100_000) };
      expect(() =>
        store.writeEvent('MarketEvent', 'market-1', 'websocket', bigPayload)
      ).toThrow('payload exceeds maximum size');
    });

    it('should accept valid inputs', () => {
      const id = store.writeEvent('MarketEvent', 'market-1', 'websocket', goodPayload);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('writeEventsIdempotent input validation', () => {
    it('should reject invalid eventType in batch', () => {
      expect(() =>
        store.writeEventsIdempotent([{
          eventType: 'BadType' as any,
          marketId: 'market-1',
          source: 'websocket',
          payload: { data: 1 },
          dedupeKey: 'k1',
        }])
      ).toThrow('invalid eventType');
    });

    it('should reject empty marketId in batch', () => {
      expect(() =>
        store.writeEventsIdempotent([{
          eventType: 'MarketEvent',
          marketId: '',
          source: 'websocket',
          payload: { data: 1 },
          dedupeKey: 'k2',
        }])
      ).toThrow('marketId must be a non-empty string');
    });
  });

  describe('queryEvents validation', () => {
    it('should reject invalid startDate format', () => {
      expect(() => store.queryEvents({ startDate: 'not-a-date' }))
        .toThrow();
    });

    it('should reject limit exceeding MAX_QUERY_LIMIT', () => {
      expect(() => store.queryEvents({ limit: 99999 }))
        .toThrow();
    });

    it('should reject negative offset', () => {
      expect(() => store.queryEvents({ offset: -1 }))
        .toThrow();
    });

    it('should apply a default limit and not throw without explicit limit', () => {
      // Write a few events and verify query works with default limit
      const payload: MarketEvent = {
        marketStatus: 'open', bestBid: 0.48, bestAsk: 0.52,
        mid: 0.50, spread: 0.04, liquidity: 1000, tickSize: 0.01,
      };
      store.writeEvent('MarketEvent', 'market-1', 'websocket', payload);
      const events = store.queryEvents({ marketId: 'market-1' });
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(1);
    });
  });

  describe('maxEvents pruning', () => {
    it('should prune oldest events when maxEvents limit is reached', () => {
      const storeWithLimit = new EventStore({
        path: path.join(testDir, 'ev-limit.db'),
        maxEvents: 3,
      });

      const payload: MarketEvent = {
        marketStatus: 'open', bestBid: 0.48, bestAsk: 0.52,
        mid: 0.50, spread: 0.04, liquidity: 1000, tickSize: 0.01,
      };

      // Write 5 events, only 3 should remain
      for (let i = 0; i < 5; i++) {
        storeWithLimit.writeEvent('MarketEvent', `market-${i}`, 'websocket', payload);
      }

      const count = storeWithLimit.getEventCount();
      expect(count).toBeLessThanOrEqual(3);

      storeWithLimit.close();
    });

    it('should not prune when maxEvents is 0 (unlimited)', () => {
      const storeUnlimited = new EventStore({
        path: path.join(testDir, 'ev-unlimited.db'),
        maxEvents: 0,
      });

      const payload: MarketEvent = {
        marketStatus: 'open', bestBid: 0.48, bestAsk: 0.52,
        mid: 0.50, spread: 0.04, liquidity: 1000, tickSize: 0.01,
      };

      for (let i = 0; i < 5; i++) {
        storeUnlimited.writeEvent('MarketEvent', `market-${i}`, 'websocket', payload);
      }

      expect(storeUnlimited.getEventCount()).toBe(5);
      storeUnlimited.close();
    });
  });
});

// ─── BanditAllocator config validation ───────────────────────────────────────

describe('BanditAllocator - config validation', () => {
  it('should reject invalid algorithm', () => {
    expect(() => new BanditAllocator({ algorithm: 'invalid' as any, totalCapital: 1000 }))
      .toThrow('invalid algorithm');
  });

  it('should reject zero totalCapital', () => {
    expect(() => new BanditAllocator({ algorithm: 'epsilon-greedy', totalCapital: 0 }))
      .toThrow('totalCapital must be a positive number');
  });

  it('should reject negative totalCapital', () => {
    expect(() => new BanditAllocator({ algorithm: 'epsilon-greedy', totalCapital: -100 }))
      .toThrow('totalCapital must be a positive number');
  });

  it('should reject negative explorationFactor', () => {
    expect(() => new BanditAllocator({
      algorithm: 'epsilon-greedy',
      totalCapital: 1000,
      explorationFactor: -0.1,
    })).toThrow('explorationFactor must be a non-negative number');
  });

  it('should reject minAllocation > maxAllocation', () => {
    expect(() => new BanditAllocator({
      algorithm: 'epsilon-greedy',
      totalCapital: 1000,
      minAllocation: 0.6,
      maxAllocation: 0.3,
    })).toThrow('minAllocation');
  });

  it('should reject minAllocation out of [0,1] range', () => {
    expect(() => new BanditAllocator({
      algorithm: 'epsilon-greedy',
      totalCapital: 1000,
      minAllocation: -0.1,
    })).toThrow('minAllocation must be between 0 and 1');
  });

  it('should reject maxAllocation > 1', () => {
    expect(() => new BanditAllocator({
      algorithm: 'epsilon-greedy',
      totalCapital: 1000,
      maxAllocation: 1.5,
    })).toThrow('maxAllocation must be between 0 and 1');
  });

  it('should reject fractional minTradeCount', () => {
    expect(() => new BanditAllocator({
      algorithm: 'epsilon-greedy',
      totalCapital: 1000,
      minTradeCount: 2.5,
    })).toThrow('minTradeCount must be a non-negative integer');
  });

  it('should accept valid configuration', () => {
    expect(() => new BanditAllocator({
      algorithm: 'ucb1',
      totalCapital: 5000,
      explorationFactor: 1.5,
      minAllocation: 0.05,
      maxAllocation: 0.4,
      minTradeCount: 10,
    })).not.toThrow();
  });
});

// ─── MetricsGating threshold validation ──────────────────────────────────────

describe('MetricsGating - threshold validation', () => {
  it('should reject non-finite minSharpe', () => {
    expect(() => new MetricsGating({ thresholds: { minSharpe: NaN } }))
      .toThrow('minSharpe must be a finite number');
  });

  it('should reject maxDrawdown > 1', () => {
    expect(() => new MetricsGating({ thresholds: { maxDrawdown: 1.5 } }))
      .toThrow('maxDrawdown must be between 0 and 1');
  });

  it('should reject negative maxDrawdown', () => {
    expect(() => new MetricsGating({ thresholds: { maxDrawdown: -0.1 } }))
      .toThrow('maxDrawdown must be between 0 and 1');
  });

  it('should reject non-integer minSampleSize', () => {
    expect(() => new MetricsGating({ thresholds: { minSampleSize: 1.5 } }))
      .toThrow('minSampleSize must be a non-negative integer');
  });

  it('should reject negative minDays', () => {
    expect(() => new MetricsGating({ thresholds: { minDays: -1 } }))
      .toThrow('minDays must be a non-negative integer');
  });

  it('should reject maxErrorRate > 1', () => {
    expect(() => new MetricsGating({ thresholds: { maxErrorRate: 1.1 } }))
      .toThrow('maxErrorRate must be between 0 and 1');
  });

  it('should reject invalid thresholds via updateThresholds', () => {
    const gating = new MetricsGating();
    expect(() => gating.updateThresholds({ maxDrawdown: 2.0 }))
      .toThrow('maxDrawdown must be between 0 and 1');
    // original thresholds unchanged
    expect(gating.getThresholds().maxDrawdown).toBe(0.1);
  });

  it('should accept valid custom thresholds', () => {
    expect(() => new MetricsGating({
      thresholds: {
        minSharpe: -1,   // Negative Sharpe is valid as a threshold
        maxDrawdown: 0.5,
        minSampleSize: 0,
        minDays: 0,
        maxErrorRate: 0,
      },
    })).not.toThrow();
  });
});

// ─── BacktestEngine safeguards ────────────────────────────────────────────────

describe('BacktestEngine - production safeguards', () => {
  let eventStore: EventStore;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-safeguard-'));
    eventStore = new EventStore({ path: path.join(testDir, 'events.db') });
  });

  afterEach(() => {
    eventStore.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor validation', () => {
    it('should reject maxConcurrentBacktests < 1', () => {
      expect(() => new BacktestEngine({
        path: path.join(testDir, 'bt.db'),
        eventStore,
        maxConcurrentBacktests: 0,
      })).toThrow('maxConcurrentBacktests must be a positive integer');
    });

    it('should reject fractional maxDateRangeDays', () => {
      expect(() => new BacktestEngine({
        path: path.join(testDir, 'bt2.db'),
        eventStore,
        maxDateRangeDays: 1.5,
      })).toThrow('maxDateRangeDays must be a positive integer');
    });
  });

  describe('runBacktest input validation', () => {
    let engine: BacktestEngine;

    beforeEach(() => {
      engine = new BacktestEngine({
        path: path.join(testDir, 'bt.db'),
        eventStore,
        maxConcurrentBacktests: 2,
        maxDateRangeDays: 90,
      });
    });

    afterEach(() => {
      engine.close();
    });

    it('should reject empty strategyId', async () => {
      await expect(engine.runBacktest({
        strategyId: '',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        markets: ['market-1'],
        initialBalance: 1000,
        slippage: 0.001,
        feeRate: 0.002,
      })).rejects.toThrow('strategyId must be a non-empty string');
    });

    it('should reject endDate before startDate', async () => {
      await expect(engine.runBacktest({
        strategyId: 'random',
        startDate: '2026-01-10T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z',
        markets: ['market-1'],
        initialBalance: 1000,
        slippage: 0.001,
        feeRate: 0.002,
      })).rejects.toThrow('endDate must be after startDate');
    });

    it('should reject date range exceeding maxDateRangeDays', async () => {
      await expect(engine.runBacktest({
        strategyId: 'random',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z', // ~365 days, limit is 90
        markets: ['market-1'],
        initialBalance: 1000,
        slippage: 0.001,
        feeRate: 0.002,
      })).rejects.toThrow('date range');
    });

    it('should reject empty markets array', async () => {
      await expect(engine.runBacktest({
        strategyId: 'random',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        markets: [],
        initialBalance: 1000,
        slippage: 0.001,
        feeRate: 0.002,
      })).rejects.toThrow('markets must be a non-empty array');
    });

    it('should reject non-positive initialBalance', async () => {
      await expect(engine.runBacktest({
        strategyId: 'random',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        markets: ['market-1'],
        initialBalance: 0,
        slippage: 0.001,
        feeRate: 0.002,
      })).rejects.toThrow('initialBalance must be a positive number');
    });

    it('should reject slippage >= 1', async () => {
      await expect(engine.runBacktest({
        strategyId: 'random',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        markets: ['market-1'],
        initialBalance: 1000,
        slippage: 1.0,
        feeRate: 0.002,
      })).rejects.toThrow('slippage must be between 0 and 1');
    });

    it('should reject negative feeRate', async () => {
      await expect(engine.runBacktest({
        strategyId: 'random',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        markets: ['market-1'],
        initialBalance: 1000,
        slippage: 0.001,
        feeRate: -0.01,
      })).rejects.toThrow('feeRate must be between 0 and 1');
    });

    it('should reject invalid startDate format', async () => {
      await expect(engine.runBacktest({
        strategyId: 'random',
        startDate: 'not-a-date',
        endDate: '2026-01-10T00:00:00Z',
        markets: ['market-1'],
        initialBalance: 1000,
        slippage: 0.001,
        feeRate: 0.002,
      })).rejects.toThrow('invalid startDate');
    });
  });

  describe('concurrency limit', () => {
    it('should enforce maxConcurrentBacktests', async () => {
      const engine = new BacktestEngine({
        path: path.join(testDir, 'bt-conc.db'),
        eventStore,
        maxConcurrentBacktests: 1,
      });

      const validConfig = {
        strategyId: 'random',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        markets: ['market-1'],
        initialBalance: 1000,
        slippage: 0.001,
        feeRate: 0.002,
      };

      // Run two backtests concurrently - the second should be rejected immediately
      const p1 = engine.runBacktest(validConfig);
      const p2 = engine.runBacktest(validConfig);

      const results = await Promise.allSettled([p1, p2]);
      const rejected = results.filter(r => r.status === 'rejected');
      // At least one must be rejected with the concurrency error
      const concurrencyError = rejected.some(
        r => r.status === 'rejected' && r.reason.message.includes('maximum concurrent backtests')
      );
      expect(concurrencyError).toBe(true);

      engine.close();
    });
  });
});

// ─── PromotionWorkflow safeguards ─────────────────────────────────────────────

describe('PromotionWorkflow - input validation', () => {
  let workflow: PromotionWorkflow;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-safeguard-'));
    workflow = new PromotionWorkflow({
      dbPath: path.join(testDir, 'promotions.db'),
      config: {
        criteria: {
          minPnl: 0,
          minSharpe: 0.5,
          maxDrawdown: 0.2,
          maxErrorRate: 0.05,
          minTradeCount: 5,
          minDays: 1,
          requireMultipleRegimes: false,
        },
        autoFlag: true,
        requireManualApproval: true,
      },
    });
  });

  afterEach(() => {
    workflow.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const goodPerformance: StrategyPerformance = {
    strategyId: 'strategy-1',
    pnl: 500,
    sharpe: 1.5,
    maxDrawdown: 0.05,
    winRate: 0.6,
    errorRate: 0.01,
    tradeCount: 50,
    lastUpdated: new Date().toISOString(),
  };

  describe('evaluate input validation', () => {
    it('should reject empty strategyId', () => {
      expect(() => workflow.evaluate('', goodPerformance, 30))
        .toThrow('strategyId must be a non-empty string');
    });

    it('should reject negative daysSinceStart', () => {
      expect(() => workflow.evaluate('strategy-1', goodPerformance, -1))
        .toThrow('daysSinceStart must be a non-negative number');
    });

    it('should reject non-finite daysSinceStart', () => {
      expect(() => workflow.evaluate('strategy-1', goodPerformance, NaN))
        .toThrow('daysSinceStart must be a non-negative number');
    });
  });

  describe('approve input validation', () => {
    beforeEach(() => {
      // Create a strategy in under-review status by meeting criteria with auto-flag
      workflow.evaluate('strategy-1', goodPerformance, 5);
    });

    it('should reject empty reviewedBy', () => {
      expect(() => workflow.approve('strategy-1', ''))
        .toThrow('reviewedBy must be a non-empty string');
    });

    it('should reject reviewNotes exceeding 2000 characters', () => {
      const longNotes = 'a'.repeat(2001);
      expect(() => workflow.approve('strategy-1', 'reviewer', longNotes))
        .toThrow('reviewNotes must not exceed 2000 characters');
    });
  });

  describe('reject input validation', () => {
    beforeEach(() => {
      workflow.evaluate('strategy-1', goodPerformance, 5);
    });

    it('should reject empty reviewedBy', () => {
      expect(() => workflow.reject('strategy-1', '', 'Some reason'))
        .toThrow('reviewedBy must be a non-empty string');
    });

    it('should reject empty reviewNotes', () => {
      expect(() => workflow.reject('strategy-1', 'reviewer', ''))
        .toThrow('reviewNotes are required for rejection');
    });

    it('should reject reviewNotes exceeding 2000 characters', () => {
      const longNotes = 'a'.repeat(2001);
      expect(() => workflow.reject('strategy-1', 'reviewer', longNotes))
        .toThrow('reviewNotes must not exceed 2000 characters');
    });
  });
});
