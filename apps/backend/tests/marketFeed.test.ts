import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarketFeedClient } from '../src/clients/marketFeed';
import { WebSocketServer } from 'ws';
import {
  createMockOrderbookSnapshot,
  createMockPriceChange,
  mockTokenId,
} from './fixtures/websocket';

describe('MarketFeedClient', () => {
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

  describe('subscription', () => {
    it('should subscribe to market feed on connection', async () => {
      const subscriptionPromise = new Promise<unknown>((resolve) => {
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            resolve(JSON.parse(data.toString()));
          });
        });
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      client.connect();

      const subscription = await subscriptionPromise;
      expect(subscription).toEqual({
        type: 'market',
        assets_ids: [mockTokenId],
      });
    });

    it('should emit connected event', async () => {
      const connectedHandler = vi.fn();

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
      });

      client.on('connected', connectedHandler);

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      expect(connectedHandler).toHaveBeenCalledOnce();
    });
  });

  describe('snapshot handling', () => {
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

    it('should handle orderbook snapshot', async () => {
      const snapshot = createMockOrderbookSnapshot();

      const snapshotPromise = new Promise<void>((resolve) => {
        client.on('snapshot', (tokenId, orderbook) => {
          expect(tokenId).toBe(mockTokenId);
          expect(orderbook.asset_id).toBe(mockTokenId);
          expect(orderbook.bids).toEqual(snapshot.bids);
          expect(orderbook.asks).toEqual(snapshot.asks);
          resolve();
        });
      });

      // Server sends snapshot
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(snapshot));
      });

      await snapshotPromise;

      // Check cache
      const cached = client.getOrderbook(mockTokenId);
      expect(cached).not.toBeNull();
      expect(cached?.asset_id).toBe(mockTokenId);
    });

    it('should cache orderbook from snapshot', async () => {
      const snapshot = createMockOrderbookSnapshot();

      await new Promise<void>((resolve) => {
        client.on('snapshot', () => resolve());
        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(snapshot));
        });
      });

      const orderbook = client.getOrderbook(mockTokenId);
      expect(orderbook).not.toBeNull();
      expect(orderbook?.bids).toHaveLength(3);
      expect(orderbook?.asks).toHaveLength(3);
    });
  });

  describe('incremental update handling', () => {
    beforeEach(async () => {
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
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
    });

    it('should apply price change update to cached orderbook', async () => {
      const priceChange = createMockPriceChange({
        side: 'buy',
        price: '0.55',
        size: '250', // Update existing level
      });

      await new Promise<void>((resolve) => {
        client.on('update', (tokenId, orderbook) => {
          expect(tokenId).toBe(mockTokenId);
          const bid = orderbook.bids.find(b => b.price === '0.55');
          expect(bid?.size).toBe('250');
          resolve();
        });

        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(priceChange));
        });
      });
    });

    it('should add new price level', async () => {
      const priceChange = createMockPriceChange({
        side: 'buy',
        price: '0.52',
        size: '100',
      });

      await new Promise<void>((resolve) => {
        client.on('update', (tokenId, orderbook) => {
          const bid = orderbook.bids.find(b => b.price === '0.52');
          expect(bid).toBeDefined();
          expect(bid?.size).toBe('100');
          resolve();
        });

        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(priceChange));
        });
      });
    });

    it('should remove price level when size is 0', async () => {
      const priceChange = createMockPriceChange({
        side: 'buy',
        price: '0.55',
        size: '0',
      });

      await new Promise<void>((resolve) => {
        client.on('update', (tokenId, orderbook) => {
          const bid = orderbook.bids.find(b => b.price === '0.55');
          expect(bid).toBeUndefined();
          resolve();
        });

        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(priceChange));
        });
      });
    });

    it('should maintain bid sort order (descending)', async () => {
      const priceChange = createMockPriceChange({
        side: 'buy',
        price: '0.56',
        size: '50',
      });

      await new Promise<void>((resolve) => {
        client.on('update', (tokenId, orderbook) => {
          const prices = orderbook.bids.map(b => parseFloat(b.price));
          expect(prices).toEqual(prices.slice().sort((a, b) => b - a));
          resolve();
        });

        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(priceChange));
        });
      });
    });

    it('should maintain ask sort order (ascending)', async () => {
      const priceChange = createMockPriceChange({
        side: 'sell',
        price: '0.555',
        size: '75',
      });

      await new Promise<void>((resolve) => {
        client.on('update', (tokenId, orderbook) => {
          const prices = orderbook.asks.map(a => parseFloat(a.price));
          expect(prices).toEqual(prices.slice().sort((a, b) => a - b));
          resolve();
        });

        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(priceChange));
        });
      });
    });
  });

  describe('reconnect and resync', () => {
    it('should handle connection state correctly', async () => {
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      expect(client.isConnected()).toBe(false);

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      expect(client.isConnected()).toBe(true);

      client.close();

      // Give it time to close
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getAllOrderbooks', () => {
    beforeEach(async () => {
      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId, '0xabc123'],
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });
    });

    it('should return all cached orderbooks', async () => {
      const snapshot1 = createMockOrderbookSnapshot({ asset_id: mockTokenId });
      const snapshot2 = createMockOrderbookSnapshot({ asset_id: '0xabc123' });

      await new Promise<void>((resolve) => {
        let count = 0;
        client.on('snapshot', () => {
          count++;
          if (count === 2) resolve();
        });

        server.clients.forEach((ws) => {
          ws.send(JSON.stringify(snapshot1));
          ws.send(JSON.stringify(snapshot2));
        });
      });

      const allOrderbooks = client.getAllOrderbooks();
      expect(allOrderbooks.size).toBe(2);
      expect(allOrderbooks.has(mockTokenId)).toBe(true);
      expect(allOrderbooks.has('0xabc123')).toBe(true);
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

    it('should handle price change for uncached orderbook gracefully', async () => {
      const priceChange = createMockPriceChange({
        asset_id: 'uncached-token',
      });

      // Should not throw, but will log warning
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(priceChange));
      });

      // Give it time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const orderbook = client.getOrderbook('uncached-token');
      expect(orderbook).toBeNull();
    });

    it('should handle malformed messages gracefully', async () => {
      // Send invalid JSON
      server.clients.forEach((ws) => {
        ws.send('invalid json');
      });

      // Should not crash
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(client.isConnected()).toBe(true);
    });

    it('should handle unknown message types', async () => {
      const unknownMessage = {
        event_type: 'unknown',
        data: 'test',
      };

      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(unknownMessage));
      });

      // Should not crash
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(client.isConnected()).toBe(true);
    });
  });
});
