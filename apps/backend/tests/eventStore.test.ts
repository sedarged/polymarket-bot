/**
 * Learning System Tests - Event Store
 * 
 * Tests for append-only event storage with partitioning and querying.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventStore } from '../src/learning/eventStore';
import type { MarketEvent, SignalEvent } from '../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('EventStore', () => {
  let eventStore: EventStore;
  const testDbPath = path.join(process.cwd(), 'data', 'test-events.db');

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    eventStore = new EventStore({ path: testDbPath });
  });

  afterEach(() => {
    eventStore.close();
    
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('initialization', () => {
    it('should initialize with correct schema', () => {
      expect(eventStore).toBeDefined();
      const stats = eventStore.getStats();
      expect(stats.totalEvents).toBe(0);
    });
  });

  describe('writeEvent', () => {
    it('should write a MarketEvent', () => {
      const marketEvent: MarketEvent = {
        marketStatus: 'open',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.50,
        spread: 0.04,
        liquidity: 1000,
        tickSize: 0.01,
      };

      const eventId = eventStore.writeEvent(
        'MarketEvent',
        'market-123',
        'websocket',
        marketEvent
      );

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');

      const stats = eventStore.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType['MarketEvent']).toBe(1);
    });

    it('should write a SignalEvent', () => {
      const signalEvent: SignalEvent = {
        signalId: 'signal-1',
        signalName: 'mid_price',
        signalValue: 0.50,
        signalVersion: '1.0.0',
        featureSetId: 'feature-set-1',
        metadata: { confidence: 0.95 },
      };

      const eventId = eventStore.writeEvent(
        'SignalEvent',
        'market-123',
        'strategy',
        signalEvent
      );

      expect(eventId).toBeDefined();

      const event = eventStore.getEvent(eventId);
      expect(event).toBeDefined();
      expect(event?.eventType).toBe('SignalEvent');
      expect(event?.payload).toEqual(signalEvent);
    });

    it('should create partition key correctly', () => {
      const marketEvent: MarketEvent = {
        marketStatus: 'open',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.50,
        spread: 0.04,
        liquidity: 1000,
        tickSize: 0.01,
      };

      const occurredAt = '2026-02-06T12:00:00.000Z';
      const eventId = eventStore.writeEvent(
        'MarketEvent',
        'market-123',
        'websocket',
        marketEvent,
        occurredAt
      );

      const event = eventStore.getEvent(eventId);
      expect(event).toBeDefined();
      expect(event?.occurredAt).toBe(occurredAt);
    });
  });

  describe('queryEvents', () => {
    beforeEach(() => {
      // Insert test events
      const marketEvent: MarketEvent = {
        marketStatus: 'open',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.50,
        spread: 0.04,
        liquidity: 1000,
        tickSize: 0.01,
      };

      eventStore.writeEvent(
        'MarketEvent',
        'market-1',
        'websocket',
        marketEvent,
        '2026-02-06T10:00:00.000Z'
      );

      eventStore.writeEvent(
        'MarketEvent',
        'market-1',
        'websocket',
        marketEvent,
        '2026-02-06T11:00:00.000Z'
      );

      eventStore.writeEvent(
        'MarketEvent',
        'market-2',
        'websocket',
        marketEvent,
        '2026-02-06T12:00:00.000Z'
      );
    });

    it('should query all events', () => {
      const events = eventStore.queryEvents();
      expect(events).toHaveLength(3);
    });

    it('should filter by marketId', () => {
      const events = eventStore.queryEvents({ marketId: 'market-1' });
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.marketId === 'market-1')).toBe(true);
    });

    it('should filter by time range', () => {
      const events = eventStore.queryEvents({
        startDate: '2026-02-06T10:30:00.000Z',
        endDate: '2026-02-06T11:30:00.000Z',
      });
      expect(events).toHaveLength(1);
      expect(events[0].occurredAt).toBe('2026-02-06T11:00:00.000Z');
    });

    it('should filter by eventType', () => {
      const signalEvent: SignalEvent = {
        signalId: 'signal-1',
        signalName: 'test',
        signalValue: 1,
        signalVersion: '1.0.0',
        featureSetId: 'fs-1',
        metadata: {},
      };

      eventStore.writeEvent(
        'SignalEvent',
        'market-1',
        'strategy',
        signalEvent,
        '2026-02-06T13:00:00.000Z'
      );

      const events = eventStore.queryEvents({ eventType: 'SignalEvent' });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('SignalEvent');
    });

    it('should support pagination', () => {
      const page1 = eventStore.queryEvents({ limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);

      const page2 = eventStore.queryEvents({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });

    it('should return events in chronological order', () => {
      const events = eventStore.queryEvents();
      expect(events[0].occurredAt).toBe('2026-02-06T10:00:00.000Z');
      expect(events[1].occurredAt).toBe('2026-02-06T11:00:00.000Z');
      expect(events[2].occurredAt).toBe('2026-02-06T12:00:00.000Z');
    });
  });

  describe('getEventCount', () => {
    it('should return correct count', () => {
      const marketEvent: MarketEvent = {
        marketStatus: 'open',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.50,
        spread: 0.04,
        liquidity: 1000,
        tickSize: 0.01,
      };

      eventStore.writeEvent('MarketEvent', 'market-1', 'websocket', marketEvent);
      eventStore.writeEvent('MarketEvent', 'market-1', 'websocket', marketEvent);

      const count = eventStore.getEventCount();
      expect(count).toBe(2);
    });

    it('should support filters', () => {
      const marketEvent: MarketEvent = {
        marketStatus: 'open',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.50,
        spread: 0.04,
        liquidity: 1000,
        tickSize: 0.01,
      };

      eventStore.writeEvent(
        'MarketEvent',
        'market-1',
        'websocket',
        marketEvent,
        '2026-02-06T10:00:00.000Z'
      );
      eventStore.writeEvent(
        'MarketEvent',
        'market-2',
        'websocket',
        marketEvent,
        '2026-02-06T11:00:00.000Z'
      );

      const count = eventStore.getEventCount({ marketId: 'market-1' });
      expect(count).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive stats', () => {
      const marketEvent: MarketEvent = {
        marketStatus: 'open',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.50,
        spread: 0.04,
        liquidity: 1000,
        tickSize: 0.01,
      };

      const signalEvent: SignalEvent = {
        signalId: 'signal-1',
        signalName: 'test',
        signalValue: 1,
        signalVersion: '1.0.0',
        featureSetId: 'fs-1',
        metadata: {},
      };

      eventStore.writeEvent(
        'MarketEvent',
        'market-1',
        'websocket',
        marketEvent,
        '2026-02-06T10:00:00.000Z'
      );
      eventStore.writeEvent(
        'SignalEvent',
        'market-1',
        'strategy',
        signalEvent,
        '2026-02-06T11:00:00.000Z'
      );

      const stats = eventStore.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByType['MarketEvent']).toBe(1);
      expect(stats.eventsByType['SignalEvent']).toBe(1);
      expect(stats.dateRange.earliest).toBe('2026-02-06T10:00:00.000Z');
      expect(stats.dateRange.latest).toBe('2026-02-06T11:00:00.000Z');
    });
  });
});
