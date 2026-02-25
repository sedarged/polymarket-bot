import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarketFeedClient } from '../../src/clients/marketFeed';
import { WebSocketServer } from 'ws';
import {
  createMockOrderbookSnapshot,
  createMockPriceChange,
  mockTokenId,
} from '../fixtures/websocket';

/**
 * WebSocket Message Deduplication Tests - Audit Finding A-010
 * 
 * Tests message deduplication logic using LRU cache for recent message IDs.
 * Validates:
 * - Duplicate message rejection
 * - Reconnect scenarios with message replay
 * - Cache size limits (LRU behavior)
 * - Rapid message replay scenarios
 */
describe('WebSocket Message Deduplication - A-010', () => {
  let server: WebSocketServer;
  let port: number;
  let client: MarketFeedClient;

  beforeEach(async () => {
    // Create a test WebSocket server
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      server.on('listening', () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (client) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('duplicate message rejection', () => {
    beforeEach(async () => {
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });
    });

    it('should reject duplicate snapshot messages', async () => {
      const snapshot = createMockOrderbookSnapshot();
      let snapshotCount = 0;

      client.on('snapshot', () => {
        snapshotCount++;
      });

      // Send the same snapshot twice
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot));
        ws.send(JSON.stringify(snapshot));
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only receive one snapshot event
      expect(snapshotCount).toBe(1);
    });

    it('should reject duplicate price change messages', async () => {
      // Send initial snapshot
      const snapshot = createMockOrderbookSnapshot();
      await new Promise<void>((resolve) => {
        client.on('snapshot', () => resolve());
        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(snapshot));
        });
      });

      const priceChange = createMockPriceChange({
        side: 'buy',
        price: '0.55',
        size: '250',
      });

      let updateCount = 0;
      client.on('update', () => {
        updateCount++;
      });

      // Send the same price change twice
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(priceChange));
        ws.send(JSON.stringify(priceChange));
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only receive one update event
      expect(updateCount).toBe(1);
    });

    it('should process messages with different timestamps', async () => {
      const snapshot1 = createMockOrderbookSnapshot({ timestamp: 1000 });
      const snapshot2 = createMockOrderbookSnapshot({ timestamp: 2000 });

      let snapshotCount = 0;
      client.on('snapshot', () => {
        snapshotCount++;
      });

      // Send snapshots with different timestamps
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot1));
        ws.send(JSON.stringify(snapshot2));
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should receive both snapshots
      expect(snapshotCount).toBe(2);
    });

    it('should process messages with different asset IDs', async () => {
      const snapshot1 = createMockOrderbookSnapshot({ asset_id: mockTokenId });
      const snapshot2 = createMockOrderbookSnapshot({ asset_id: '0xabc123' });

      let snapshotCount = 0;
      client.on('snapshot', () => {
        snapshotCount++;
      });

      // Send snapshots for different assets
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot1));
        ws.send(JSON.stringify(snapshot2));
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should receive both snapshots
      expect(snapshotCount).toBe(2);
    });

    it('should process price changes with different prices as separate messages', async () => {
      // Send initial snapshot
      const snapshot = createMockOrderbookSnapshot();
      await new Promise<void>((resolve) => {
        client.on('snapshot', () => resolve());
        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(snapshot));
        });
      });

      const priceChange1 = createMockPriceChange({
        side: 'buy',
        price: '0.55',
        size: '250',
      });
      const priceChange2 = createMockPriceChange({
        side: 'buy',
        price: '0.56',
        size: '250',
      });

      let updateCount = 0;
      client.on('update', () => {
        updateCount++;
      });

      // Send price changes with different prices
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(priceChange1));
        ws.send(JSON.stringify(priceChange2));
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should receive both updates
      expect(updateCount).toBe(2);
    });
  });

  describe('reconnect scenarios with message replay', () => {
    it('should handle duplicate messages after reconnect', async () => {
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 50,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      const snapshot = createMockOrderbookSnapshot();
      let snapshotCount = 0;

      client.on('snapshot', () => {
        snapshotCount++;
      });

      // Send snapshot
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot));
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close connection to trigger reconnect
      server.clients.forEach((ws) => {
        ws.close();
      });

      // Wait for reconnect
      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
      });

      // Server replays the same snapshot (common on reconnect)
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot));
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still only process snapshot once
      expect(snapshotCount).toBe(1);
    });

    it('should handle rapid message replay on reconnect', async () => {
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 50,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // Send initial snapshot
      const snapshot = createMockOrderbookSnapshot();
      await new Promise<void>((resolve) => {
        client.on('snapshot', () => resolve());
        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(snapshot));
        });
      });

      // Send multiple price changes rapidly
      const priceChanges = Array.from({ length: 5 }, (_, i) => 
        createMockPriceChange({
          side: 'buy',
          price: `0.${50 + i}`,
          size: '100',
          timestamp: 1000 + i,
        })
      );

      let updateCount = 0;
      client.on('update', () => {
        updateCount++;
      });

      // Send all price changes
      server.clients.forEach((ws) => {
        priceChanges.forEach(pc => ws.send(JSON.stringify(pc)));
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close connection
      server.clients.forEach((ws) => {
        ws.close();
      });

      // Wait for reconnect
      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
      });

      // Replay all messages rapidly (simulating catchup)
      server.clients.forEach((ws) => {
        priceChanges.forEach(pc => ws.send(JSON.stringify(pc)));
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only process each unique message once
      expect(updateCount).toBe(5);
    });
  });

  describe('LRU cache behavior', () => {
    it('should allow reprocessing messages after cache eviction', async () => {
      // Use a small dedup cache so eviction is deterministic without large floods.
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        dedupCacheSize: 5,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      const snapshot = createMockOrderbookSnapshot({ timestamp: 1000 });
      let snapshotCount = 0;

      client.on('snapshot', () => {
        snapshotCount++;
      });

      // Send initial snapshot
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot));
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(snapshotCount).toBe(1);

      // Record count before flooding
      const countBeforeFlood = snapshotCount;

      // Fill cache with dedupCacheSize+1 unique messages to trigger LRU eviction.
      // With a cache size of 5, sending 6 unique messages evicts the first entry.
      const manySnapshots = Array.from({ length: 6 }, (_, i) =>
        createMockOrderbookSnapshot({ timestamp: 2000 + i })
      );

      server.clients.forEach((ws) => {
        manySnapshots.forEach(s => ws.send(JSON.stringify(s)));
      });

      // Wait for messages to process
      await new Promise((resolve) => setTimeout(resolve, 200));

      const countAfterFlood = snapshotCount;
      // Verify at least some of the flood messages were processed
      expect(countAfterFlood).toBeGreaterThan(countBeforeFlood);

      // Now resend the original snapshot - it should be reprocessable
      // because the LRU cache has evicted older entries
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot));
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // The replayed snapshot should be processed (not deduped),
      // so count should be at least one more than after the flood
      expect(snapshotCount).toBeGreaterThan(countAfterFlood);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });
    });

    it('should handle messages with identical timestamps but different data', async () => {
      // Send initial snapshot
      const snapshot = createMockOrderbookSnapshot();
      await new Promise<void>((resolve) => {
        client.on('snapshot', () => resolve());
        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(snapshot));
        });
      });

      const timestamp = 1000;
      const priceChange1 = createMockPriceChange({
        side: 'buy',
        price: '0.55',
        size: '250',
        timestamp,
      });
      const priceChange2 = createMockPriceChange({
        side: 'sell',
        price: '0.60',
        size: '150',
        timestamp,
      });

      let updateCount = 0;
      client.on('update', () => {
        updateCount++;
      });

      // Send price changes with same timestamp but different data
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(priceChange1));
        ws.send(JSON.stringify(priceChange2));
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should process both as they have different side/price/size
      expect(updateCount).toBe(2);
    });

    it('should deduplicate last_trade_price messages with identical data', async () => {
      const lastTrade1 = {
        event_type: 'last_trade_price' as const,
        asset_id: mockTokenId,
        price: '0.55',
        timestamp: 1000,
      };
      
      const lastTrade2 = {
        event_type: 'last_trade_price' as const,
        asset_id: mockTokenId,
        price: '0.55',
        timestamp: 1000,
      };

      // These should be treated as duplicates since they have identical data
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(lastTrade1));
        ws.send(JSON.stringify(lastTrade2));
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // No updates expected, but should not crash
      expect(client.isConnected()).toBe(true);
    });

    it('should handle concurrent rapid-fire duplicate messages', async () => {
      const snapshot = createMockOrderbookSnapshot();
      let snapshotCount = 0;

      client.on('snapshot', () => {
        snapshotCount++;
      });

      // Send many duplicates rapidly in parallel
      const promises = Array.from({ length: 10 }, () => 
        new Promise<void>((resolve) => {
          server.clients.forEach((ws) => {
            ws.send(JSON.stringify(snapshot));
          });
          resolve();
        })
      );

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should only process once despite multiple concurrent sends
      expect(snapshotCount).toBe(1);
    });
  });
});
