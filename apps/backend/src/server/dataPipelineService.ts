import { logger } from '../utils/logger';
import { marketFeedService } from './marketFeedService';
import { EventStore } from '../learning/eventStore';
import { config } from '../config';
import type { Orderbook } from '@polymarket/shared';
import type { MarketEvent, OrderBookUpdateEvent } from '../learning/types';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { retry } from '../utils/retry';
import {
  ingestionBufferSize,
  ingestionEventsTotal,
  ingestionFlushDurationSeconds,
  ingestionLastFailureTimestampSeconds,
  ingestionLastSuccessTimestampSeconds,
} from '../utils/metrics';
import { getAlertingService } from '../utils/alerting';

type PipelineStatus = {
  enabled: boolean;
  running: boolean;
  pipeline: string;
  bufferedMarkets: number;
  flushIntervalMs: number;
  orderbookLevels: number;
  storeOrderbookEvents: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  totals: {
    received: number;
    written: number;
    deduped: number;
    failed: number;
  };
};

const PIPELINE_NAME = 'market-feed';

export type DataPipelineConfig = {
  tokenIds: string[];
  dataPipelineEnabled: boolean;
  eventStorePath: string;
  dataPipelineFlushIntervalMs: number;
  dataPipelineOrderbookLevels: number;
  dataPipelineStoreOrderbookEvents: boolean;
  dataPipelineAlertAfterConsecutiveFailures: number;
  dataPipelineCircuitBreakerFailureThreshold: number;
  dataPipelineCircuitBreakerResetTimeoutMs: number;
  dataPipelineCircuitBreakerSuccessThreshold: number;
  retryAttempts: number;
  retryDelay: number;
  retryTotalTimeout: number;
};

export type DataPipelineEventStore = Pick<EventStore, 'writeEventsIdempotent' | 'close'>;

export type DataPipelineDeps = {
  cfg: DataPipelineConfig;
  marketFeed: Pick<typeof marketFeedService, 'on' | 'off'>;
  eventStoreFactory: (path: string) => DataPipelineEventStore;
};

function toIsoFromMs(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function parseLevelNumber(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function computeLiquidity(orderbook: Orderbook, levels: number): number {
  const topBids = orderbook.bids.slice(0, levels);
  const topAsks = orderbook.asks.slice(0, levels);
  let sum = 0;
  for (const l of topBids) sum += parseLevelNumber(l.size);
  for (const l of topAsks) sum += parseLevelNumber(l.size);
  return sum;
}

function computeTickSize(orderbook: Orderbook): number {
  // Polymarket markets are typically quoted in 0.01 increments.
  // When we can infer a finer tick from adjacent levels, take the min positive delta.
  const prices = [
    ...orderbook.bids.slice(0, 5).map((l) => parseLevelNumber(l.price)),
    ...orderbook.asks.slice(0, 5).map((l) => parseLevelNumber(l.price)),
  ].filter((p) => p > 0);

  let minDelta = Infinity;
  const sorted = [...new Set(prices)].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0 && d < minDelta) minDelta = d;
  }
  if (!Number.isFinite(minDelta) || minDelta <= 0) return 0.01;
  // Clamp to avoid absurdly small values from float noise.
  return Math.max(0.0001, Math.min(0.01, minDelta));
}

export class DataPipelineService {
  private enabled: boolean = true;
  private running: boolean = false;
  private eventStore: DataPipelineEventStore | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private buffer = new Map<string, Orderbook>();

  private consecutiveFailures = 0;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;

  private totals = {
    received: 0,
    written: 0,
    deduped: 0,
    failed: 0,
  };

  private readonly writeBreaker: CircuitBreaker;

  constructor(
    private readonly deps: DataPipelineDeps = {
      cfg: {
        tokenIds: config.tokenIds,
        dataPipelineEnabled: config.dataPipelineEnabled,
        eventStorePath: config.eventStorePath,
        dataPipelineFlushIntervalMs: config.dataPipelineFlushIntervalMs,
        dataPipelineOrderbookLevels: config.dataPipelineOrderbookLevels,
        dataPipelineStoreOrderbookEvents: config.dataPipelineStoreOrderbookEvents,
        dataPipelineAlertAfterConsecutiveFailures: config.dataPipelineAlertAfterConsecutiveFailures,
        dataPipelineCircuitBreakerFailureThreshold:
          config.dataPipelineCircuitBreakerFailureThreshold,
        dataPipelineCircuitBreakerResetTimeoutMs:
          config.dataPipelineCircuitBreakerResetTimeoutMs,
        dataPipelineCircuitBreakerSuccessThreshold:
          config.dataPipelineCircuitBreakerSuccessThreshold,
        retryAttempts: config.retryAttempts,
        retryDelay: config.retryDelay,
        retryTotalTimeout: config.retryTotalTimeout,
      },
      marketFeed: marketFeedService,
      eventStoreFactory: (path: string) => new EventStore({ path, readonly: false }),
    },
  ) {
    this.writeBreaker = new CircuitBreaker({
      name: 'event-store-write',
      failureThreshold: this.deps.cfg.dataPipelineCircuitBreakerFailureThreshold,
      resetTimeout: this.deps.cfg.dataPipelineCircuitBreakerResetTimeoutMs,
      successThreshold: this.deps.cfg.dataPipelineCircuitBreakerSuccessThreshold,
    });
    this.enabled = this.deps.cfg.dataPipelineEnabled;
  }

  start(): void {
    if (!this.enabled) {
      logger.info('Data pipeline disabled by config', { gap: 'GAP-021' });
      return;
    }
    if (this.running) {
      logger.warn('Data pipeline already running');
      return;
    }
    if (this.deps.cfg.tokenIds.length === 0) {
      logger.info('No token IDs configured, skipping data pipeline start', {
        pipeline: PIPELINE_NAME,
        gap: 'GAP-021',
      });
      return;
    }

    this.eventStore = this.deps.eventStoreFactory(this.deps.cfg.eventStorePath);

    const interval = this.deps.cfg.dataPipelineFlushIntervalMs;
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        logger.error('Data pipeline flush error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, interval);
    this.flushTimer.unref();

    this.deps.marketFeed.on('snapshot', this.onOrderbook);
    this.deps.marketFeed.on('update', this.onOrderbook);

    this.running = true;
    logger.info('Data pipeline started', {
      pipeline: PIPELINE_NAME,
      flushIntervalMs: interval,
      storeOrderbookEvents: this.deps.cfg.dataPipelineStoreOrderbookEvents,
      orderbookLevels: this.deps.cfg.dataPipelineOrderbookLevels,
      gap: 'GAP-021',
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.deps.marketFeed.off('snapshot', this.onOrderbook);
    this.deps.marketFeed.off('update', this.onOrderbook);

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining buffered data before closing.
    try {
      await this.flush();
    } catch (error) {
      logger.warn('Final data pipeline flush failed during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (this.eventStore) {
      this.eventStore.close();
      this.eventStore = null;
    }

    this.buffer.clear();
    ingestionBufferSize.set({ pipeline: PIPELINE_NAME }, 0);
    this.running = false;
    logger.info('Data pipeline stopped', { pipeline: PIPELINE_NAME });
  }

  getStatus(): PipelineStatus {
    return {
      enabled: this.enabled,
      running: this.running,
      pipeline: PIPELINE_NAME,
      bufferedMarkets: this.buffer.size,
      flushIntervalMs: this.deps.cfg.dataPipelineFlushIntervalMs,
      orderbookLevels: this.deps.cfg.dataPipelineOrderbookLevels,
      storeOrderbookEvents: this.deps.cfg.dataPipelineStoreOrderbookEvents,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      consecutiveFailures: this.consecutiveFailures,
      totals: { ...this.totals },
    };
  }

  private onOrderbook = (tokenId: string, orderbook: Orderbook) => {
    if (!this.running) return;

    this.buffer.set(tokenId, orderbook);
    ingestionBufferSize.set({ pipeline: PIPELINE_NAME }, this.buffer.size);

    this.totals.received++;
    ingestionEventsTotal.inc({
      pipeline: PIPELINE_NAME,
      event_type: 'orderbook',
      result: 'received',
      source: 'websocket',
    });
  };

  private buildEventsForOrderbook(tokenId: string, orderbook: Orderbook) {
    const occurredAt = toIsoFromMs(orderbook.timestamp);
    const snapshotId = `${tokenId}:${orderbook.timestamp}`;
    const levels = this.deps.cfg.dataPipelineOrderbookLevels;

    const bestBid = orderbook.bids.length > 0 ? parseLevelNumber(orderbook.bids[0].price) : 0;
    const bestAsk = orderbook.asks.length > 0 ? parseLevelNumber(orderbook.asks[0].price) : 0;
    const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
    const spread = bestBid > 0 && bestAsk > 0 ? bestAsk - bestBid : 0;
    const liquidity = computeLiquidity(orderbook, levels);
    const tickSize = computeTickSize(orderbook);

    const marketEvent: MarketEvent = {
      marketStatus: 'open',
      bestBid,
      bestAsk,
      mid,
      spread,
      liquidity,
      orderBookSnapshotId: snapshotId,
      tickSize,
    };

    const orderbookEvent: OrderBookUpdateEvent = {
      snapshotId,
      bids: orderbook.bids.slice(0, levels).map((l) => ({
        price: parseLevelNumber(l.price),
        size: parseLevelNumber(l.size),
      })),
      asks: orderbook.asks.slice(0, levels).map((l) => ({
        price: parseLevelNumber(l.price),
        size: parseLevelNumber(l.size),
      })),
      sequenceNumber: orderbook.timestamp,
    };

    const marketDedupeKey = `${PIPELINE_NAME}:MarketEvent:${tokenId}:${occurredAt}:${EventStore.hashPayload(marketEvent)}`;
    const obDedupeKey = `${PIPELINE_NAME}:OrderBookUpdateEvent:${tokenId}:${occurredAt}:${EventStore.hashPayload(orderbookEvent)}`;

    return {
      occurredAt,
      marketEvent,
      orderbookEvent,
      marketDedupeKey,
      obDedupeKey,
    };
  }

  private async flush(): Promise<void> {
    if (!this.running) return;
    if (!this.eventStore) return;
    if (this.buffer.size === 0) return;

    const endTimer = ingestionFlushDurationSeconds.startTimer({ pipeline: PIPELINE_NAME });

    // Swap buffer to minimize time spent in the event handler path.
    const batch = this.buffer;
    this.buffer = new Map<string, Orderbook>();
    ingestionBufferSize.set({ pipeline: PIPELINE_NAME }, 0);

    const storeOrderbook = this.deps.cfg.dataPipelineStoreOrderbookEvents;
    const events: Array<{
      eventType: 'MarketEvent' | 'OrderBookUpdateEvent';
      marketId: string;
      source: 'websocket';
      payload: unknown;
      occurredAt: string;
      eventVersion: number;
      dedupeKey: string;
    }> = [];

    for (const [tokenId, orderbook] of batch.entries()) {
      const built = this.buildEventsForOrderbook(tokenId, orderbook);
      events.push({
        eventType: 'MarketEvent',
        marketId: tokenId,
        source: 'websocket',
        payload: built.marketEvent,
        occurredAt: built.occurredAt,
        eventVersion: 1,
        dedupeKey: built.marketDedupeKey,
      });
      if (storeOrderbook) {
        events.push({
          eventType: 'OrderBookUpdateEvent',
          marketId: tokenId,
          source: 'websocket',
          payload: built.orderbookEvent,
          occurredAt: built.occurredAt,
          eventVersion: 1,
          dedupeKey: built.obDedupeKey,
        });
      }
    }

    try {
      const result = await this.writeBreaker.execute(async () => {
        return retry(
          async () => {
            const r = this.eventStore!.writeEventsIdempotent(events);
            return r;
          },
          {
            attempts: this.deps.cfg.retryAttempts,
            delay: Math.max(250, this.deps.cfg.retryDelay),
            totalTimeout: this.deps.cfg.retryTotalTimeout,
          }
        );
      });

      this.consecutiveFailures = 0;
      this.lastSuccessAt = new Date().toISOString();
      ingestionLastSuccessTimestampSeconds.set(
        { pipeline: PIPELINE_NAME },
        Math.floor(Date.now() / 1000)
      );

      this.totals.written += result.inserted;
      this.totals.deduped += result.deduped;
      ingestionEventsTotal.inc(
        { pipeline: PIPELINE_NAME, event_type: 'event', result: 'written', source: 'websocket' },
        result.inserted
      );
      if (result.deduped > 0) {
        ingestionEventsTotal.inc(
          { pipeline: PIPELINE_NAME, event_type: 'event', result: 'deduped', source: 'websocket' },
          result.deduped
        );
      }

      logger.debug('Data pipeline flush success', {
        pipeline: PIPELINE_NAME,
        bufferedMarkets: batch.size,
        eventsAttempted: events.length,
        inserted: result.inserted,
        deduped: result.deduped,
      });
    } catch (error) {
      this.consecutiveFailures++;
      this.lastFailureAt = new Date().toISOString();
      ingestionLastFailureTimestampSeconds.set(
        { pipeline: PIPELINE_NAME },
        Math.floor(Date.now() / 1000)
      );
      this.totals.failed++;
      ingestionEventsTotal.inc({
        pipeline: PIPELINE_NAME,
        event_type: 'flush',
        result: 'failed',
        source: 'websocket',
      });

      // Re-buffer the latest known orderbooks so we can retry on next flush.
      // Do not overwrite any newer snapshots that may have arrived while flushing.
      for (const [tokenId, orderbook] of batch.entries()) {
        if (!this.buffer.has(tokenId)) {
          this.buffer.set(tokenId, orderbook);
        }
      }
      ingestionBufferSize.set({ pipeline: PIPELINE_NAME }, this.buffer.size);

      logger.error('Data pipeline flush failed (will retry)', {
        pipeline: PIPELINE_NAME,
        consecutiveFailures: this.consecutiveFailures,
        error: error instanceof Error ? error.message : String(error),
      });

      // Alert on sustained failures (but rely on AlertingService dedupe/rate limiting).
      if (this.consecutiveFailures >= this.deps.cfg.dataPipelineAlertAfterConsecutiveFailures) {
        const alerting = getAlertingService();
        if (alerting) {
          alerting.sendAlert({
            severity: 'warning',
            title: 'Data pipeline ingestion failures',
            message: `Pipeline "${PIPELINE_NAME}" has failed ${this.consecutiveFailures} consecutive flushes`,
            context: {
              pipeline: PIPELINE_NAME,
              consecutiveFailures: this.consecutiveFailures,
              bufferedMarkets: this.buffer.size,
              storeOrderbookEvents: this.deps.cfg.dataPipelineStoreOrderbookEvents,
            },
            timestamp: new Date().toISOString(),
            dedupeKey: `data-pipeline:${PIPELINE_NAME}:flush-failures`,
          }).catch((err) => {
            logger.error('Failed to send ingestion alert', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    } finally {
      endTimer();
    }
  }
}

export const dataPipelineService = new DataPipelineService();

