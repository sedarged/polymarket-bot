import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataPipelineService, type DataPipelineConfig, type DataPipelineEventStore } from '../../src/server/dataPipelineService';

type Handler = (...args: any[]) => void;

class FakeMarketFeed {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  off(event: string, handler: Handler) {
    const set = this.handlers.get(event);
    if (set) set.delete(handler);
    return this;
  }

  emit(event: string, ...args: any[]) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set.values()) h(...args);
  }
}

function makeOrderbook(overrides?: Partial<any>) {
  return {
    market: 'm1',
    asset_id: 't1',
    bids: [
      { price: '0.48', size: '100' },
      { price: '0.47', size: '50' },
    ],
    asks: [
      { price: '0.52', size: '90' },
      { price: '0.53', size: '60' },
    ],
    timestamp: 1700000000000,
    ...overrides,
  };
}

describe('DataPipelineService (GAP-021)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers orderbooks and flushes MarketEvent + OrderBookUpdateEvent', async () => {
    const feed = new FakeMarketFeed();
    const seenBatches: any[] = [];

    const store: DataPipelineEventStore = {
      writeEventsIdempotent: (events: any[]) => {
        seenBatches.push(events);
        return { inserted: events.length, deduped: 0 };
      },
      close: () => undefined,
    };

    const cfg: DataPipelineConfig = {
      tokenIds: ['t1'],
      dataPipelineEnabled: true,
      eventStorePath: ':memory:',
      dataPipelineFlushIntervalMs: 10,
      dataPipelineOrderbookLevels: 1,
      dataPipelineStoreOrderbookEvents: true,
      dataPipelineAlertAfterConsecutiveFailures: 3,
      dataPipelineCircuitBreakerFailureThreshold: 5,
      dataPipelineCircuitBreakerResetTimeoutMs: 60000,
      dataPipelineCircuitBreakerSuccessThreshold: 2,
      retryAttempts: 1,
      retryDelay: 1,
      retryTotalTimeout: 1000,
    };

    const svc = new DataPipelineService({
      cfg,
      marketFeed: feed as any,
      eventStoreFactory: () => store,
    });

    svc.start();
    expect(svc.getStatus().running).toBe(true);

    feed.emit('snapshot', 't1', makeOrderbook());

    await vi.advanceTimersByTimeAsync(20);

    expect(seenBatches.length).toBeGreaterThan(0);
    const events = seenBatches[0];
    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe('MarketEvent');
    expect(events[1].eventType).toBe('OrderBookUpdateEvent');

    // Ensure numeric conversion and level truncation are applied.
    const marketPayload = events[0].payload;
    expect(marketPayload.bestBid).toBeCloseTo(0.48);
    expect(marketPayload.bestAsk).toBeCloseTo(0.52);
    expect(marketPayload.liquidity).toBeCloseTo(190); // 100 bid + 90 ask (top 1 level)

    const obPayload = events[1].payload;
    expect(obPayload.bids).toHaveLength(1);
    expect(obPayload.asks).toHaveLength(1);
    expect(obPayload.bids[0].price).toBeCloseTo(0.48);
    expect(obPayload.bids[0].size).toBeCloseTo(100);

    await svc.stop();
    expect(svc.getStatus().running).toBe(false);
  });

  it('re-buffers on flush failure and recovers on next flush', async () => {
    const feed = new FakeMarketFeed();
    const calls: any[] = [];
    let shouldFail = true;

    const store: DataPipelineEventStore = {
      writeEventsIdempotent: (events: any[]) => {
        calls.push(events);
        if (shouldFail) {
          shouldFail = false;
          throw new Error('sqlite busy');
        }
        return { inserted: events.length, deduped: 0 };
      },
      close: () => undefined,
    };

    const cfg: DataPipelineConfig = {
      tokenIds: ['t1'],
      dataPipelineEnabled: true,
      eventStorePath: ':memory:',
      dataPipelineFlushIntervalMs: 100,
      dataPipelineOrderbookLevels: 1,
      dataPipelineStoreOrderbookEvents: false, // simpler batch size
      dataPipelineAlertAfterConsecutiveFailures: 1,
      dataPipelineCircuitBreakerFailureThreshold: 10,
      dataPipelineCircuitBreakerResetTimeoutMs: 60000,
      dataPipelineCircuitBreakerSuccessThreshold: 2,
      retryAttempts: 1,
      retryDelay: 1,
      retryTotalTimeout: 1000,
    };

    const svc = new DataPipelineService({
      cfg,
      marketFeed: feed as any,
      eventStoreFactory: () => store,
    });

    svc.start();
    feed.emit('snapshot', 't1', makeOrderbook());

    // First flush fails, should re-buffer.
    await vi.advanceTimersByTimeAsync(110);
    const afterFail = svc.getStatus();
    expect(afterFail.consecutiveFailures).toBeGreaterThanOrEqual(1);
    expect(afterFail.bufferedMarkets).toBe(1);

    // Next flush should succeed.
    await vi.advanceTimersByTimeAsync(110);
    const afterRecover = svc.getStatus();
    expect(afterRecover.consecutiveFailures).toBe(0);
    expect(afterRecover.totals.written).toBeGreaterThan(0);

    await svc.stop();
  });

  it('preserves newer orderbook snapshots during re-buffering after flush failure', async () => {
    const feed = new FakeMarketFeed();
    const calls: any[] = [];
    let shouldFail = true;

    const store: DataPipelineEventStore = {
      writeEventsIdempotent: (events: any[]) => {
        calls.push(events);
        if (shouldFail) {
          shouldFail = false;
          // Simulate a newer orderbook arriving during the flush
          feed.emit('snapshot', 't1', makeOrderbook({ timestamp: 1700000001000 }));
          throw new Error('sqlite busy');
        }
        return { inserted: events.length, deduped: 0 };
      },
      close: () => undefined,
    };

    const cfg: DataPipelineConfig = {
      tokenIds: ['t1'],
      dataPipelineEnabled: true,
      eventStorePath: ':memory:',
      dataPipelineFlushIntervalMs: 100,
      dataPipelineOrderbookLevels: 1,
      dataPipelineStoreOrderbookEvents: false,
      dataPipelineAlertAfterConsecutiveFailures: 1,
      dataPipelineCircuitBreakerFailureThreshold: 10,
      dataPipelineCircuitBreakerResetTimeoutMs: 60000,
      dataPipelineCircuitBreakerSuccessThreshold: 2,
      retryAttempts: 1,
      retryDelay: 1,
      retryTotalTimeout: 1000,
    };

    const svc = new DataPipelineService({
      cfg,
      marketFeed: feed as any,
      eventStoreFactory: () => store,
    });

    svc.start();
    // Emit older orderbook first
    feed.emit('snapshot', 't1', makeOrderbook({ timestamp: 1700000000000 }));

    // First flush fails, and a newer orderbook arrives during the flush
    await vi.advanceTimersByTimeAsync(110);
    const afterFail = svc.getStatus();
    expect(afterFail.consecutiveFailures).toBeGreaterThanOrEqual(1);
    expect(afterFail.bufferedMarkets).toBe(1);

    // Next flush should succeed with the newer orderbook
    await vi.advanceTimersByTimeAsync(110);
    const afterRecover = svc.getStatus();
    expect(afterRecover.consecutiveFailures).toBe(0);
    expect(afterRecover.totals.written).toBeGreaterThan(0);

    // Verify that the second flush (successful one) contains the newer timestamp
    expect(calls.length).toBe(2);
    const successfulBatch = calls[1];
    expect(successfulBatch.length).toBeGreaterThan(0);
    const marketEvent = successfulBatch.find((e: any) => e.eventType === 'MarketEvent');
    expect(marketEvent).toBeDefined();
    // The newer orderbook should have timestamp 1700000001000, which converts to 2023-11-14T22:13:21.000Z
    expect(marketEvent.occurredAt).toBe('2023-11-14T22:13:21.000Z');

    await svc.stop();
  });
});

