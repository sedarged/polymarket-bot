import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarketFeedClient } from '../../src/clients/marketFeed';
import { WebSocketServer } from 'ws';
import { ClobClient } from '../../src/clients/clob';
import { mockTokenId } from '../fixtures/websocket';

/**
 * Tests for WebSocket Resync Race Condition Fix (A-007)
 * 
 * These tests verify that concurrent resync operations for the same token
 * are properly synchronized and do not cause multiple REST API calls.
 */
describe('WebSocket Resync Race Condition - Audit Finding A-007', () => {
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

  describe('concurrent resync prevention', () => {
    it('should prevent concurrent resync calls for the same token', async () => {
      // Mock the ClobClient.getOrderbook to track calls
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      let callCount = 0;
      
      getOrderbookSpy.mockImplementation(async (tokenId: string) => {
        callCount++;
        // Simulate a slow API call
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          market: 'test-market',
          asset_id: tokenId,
          bids: [{ price: '0.5', size: '100' }],
          asks: [{ price: '0.6', size: '100' }],
          timestamp: Date.now(),
        };
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      // Wait for connection
      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // Trigger multiple concurrent resyncs for the same token
      // These should all wait for the same promise
      const resyncPromises = [
        client['resyncOrderbook'](mockTokenId),
        client['resyncOrderbook'](mockTokenId),
        client['resyncOrderbook'](mockTokenId),
      ];

      await Promise.all(resyncPromises);

      // Verify that getOrderbook was only called once
      expect(callCount).toBe(1);
      expect(getOrderbookSpy).toHaveBeenCalledTimes(1);
      
      getOrderbookSpy.mockRestore();
    });

    it('should allow concurrent resyncs for different tokens', async () => {
      const token1 = 'token1';
      const token2 = 'token2';
      
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      const callTokens: string[] = [];
      
      getOrderbookSpy.mockImplementation(async (tokenId: string) => {
        callTokens.push(tokenId);
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          market: 'test-market',
          asset_id: tokenId,
          bids: [{ price: '0.5', size: '100' }],
          asks: [{ price: '0.6', size: '100' }],
          timestamp: Date.now(),
        };
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [token1, token2],
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // Trigger concurrent resyncs for different tokens
      const resyncPromises = [
        client['resyncOrderbook'](token1),
        client['resyncOrderbook'](token2),
      ];

      await Promise.all(resyncPromises);

      // Both tokens should have been called
      expect(callTokens).toHaveLength(2);
      expect(callTokens).toContain(token1);
      expect(callTokens).toContain(token2);
      
      getOrderbookSpy.mockRestore();
    });

    it('should properly clean up promises after successful resync', async () => {
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      
      getOrderbookSpy.mockImplementation(async (tokenId: string) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          market: 'test-market',
          asset_id: tokenId,
          bids: [{ price: '0.5', size: '100' }],
          asks: [{ price: '0.6', size: '100' }],
          timestamp: Date.now(),
        };
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // First resync
      await client['resyncOrderbook'](mockTokenId);
      
      // Check that the promise was cleaned up
      expect(client['resyncPromises'].has(mockTokenId)).toBe(false);
      
      // Second resync should create a new promise
      await client['resyncOrderbook'](mockTokenId);
      
      // Should have been called twice (not reusing old promise)
      expect(getOrderbookSpy).toHaveBeenCalledTimes(2);
      
      getOrderbookSpy.mockRestore();
    });

    it('should properly clean up promises after failed resync', async () => {
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      
      getOrderbookSpy.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        throw new Error('API failure');
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // First resync (will fail)
      await expect(client['resyncOrderbook'](mockTokenId)).rejects.toThrow('API failure');
      
      // Check that the promise was cleaned up even after failure
      expect(client['resyncPromises'].has(mockTokenId)).toBe(false);
      
      // Second resync should create a new promise
      await expect(client['resyncOrderbook'](mockTokenId)).rejects.toThrow('API failure');
      
      // Should have been called twice
      expect(getOrderbookSpy).toHaveBeenCalledTimes(2);
      
      getOrderbookSpy.mockRestore();
    });

    it('should handle race condition between check and promise storage', async () => {
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      let resolveFirst: () => void;
      let firstCallStarted = false;
      
      getOrderbookSpy.mockImplementation(async (tokenId: string) => {
        if (!firstCallStarted) {
          firstCallStarted = true;
          // First call waits for explicit resolution
          await new Promise<void>(resolve => {
            resolveFirst = resolve;
          });
        } else {
          // Subsequent calls resolve quickly
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return {
          market: 'test-market',
          asset_id: tokenId,
          bids: [{ price: '0.5', size: '100' }],
          asks: [{ price: '0.6', size: '100' }],
          timestamp: Date.now(),
        };
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // Start first resync (will block)
      const firstResync = client['resyncOrderbook'](mockTokenId);
      
      // Wait a bit to ensure first call has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Start second resync while first is still in progress
      const secondResync = client['resyncOrderbook'](mockTokenId);
      
      // Now resolve the first call
      resolveFirst!();
      
      // Both should complete
      await Promise.all([firstResync, secondResync]);
      
      // Should only have been called once (second reused the promise)
      expect(getOrderbookSpy).toHaveBeenCalledTimes(1);
      
      getOrderbookSpy.mockRestore();
    });

    it('should emit snapshot event only once for concurrent resyncs', async () => {
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      
      getOrderbookSpy.mockImplementation(async (tokenId: string) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          market: 'test-market',
          asset_id: tokenId,
          bids: [{ price: '0.5', size: '100' }],
          asks: [{ price: '0.6', size: '100' }],
          timestamp: Date.now(),
        };
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      let snapshotCount = 0;
      client.on('snapshot', () => {
        snapshotCount++;
      });

      // Trigger multiple concurrent resyncs
      const resyncPromises = [
        client['resyncOrderbook'](mockTokenId),
        client['resyncOrderbook'](mockTokenId),
        client['resyncOrderbook'](mockTokenId),
      ];

      await Promise.all(resyncPromises);

      // Should only emit one snapshot event
      expect(snapshotCount).toBe(1);
      
      getOrderbookSpy.mockRestore();
    });

    it('should handle resyncAll with proper concurrency control', async () => {
      const token1 = 'token1';
      const token2 = 'token2';
      
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      const callCounts = new Map<string, number>();
      
      getOrderbookSpy.mockImplementation(async (tokenId: string) => {
        callCounts.set(tokenId, (callCounts.get(tokenId) || 0) + 1);
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          market: 'test-market',
          asset_id: tokenId,
          bids: [{ price: '0.5', size: '100' }],
          asks: [{ price: '0.6', size: '100' }],
          timestamp: Date.now(),
        };
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [token1, token2],
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // Trigger resyncAll multiple times concurrently
      const resyncAllPromises = [
        client['resyncAll'](),
        client['resyncAll'](),
      ];

      await Promise.all(resyncAllPromises);

      // With proper deduplication, each token should be called exactly once
      // even when multiple resyncAll calls are made concurrently
      expect(callCounts.get(token1)).toBe(1);
      expect(callCounts.get(token2)).toBe(1);
      
      getOrderbookSpy.mockRestore();
    });
  });

  describe('atomic state updates', () => {
    it('should maintain cache consistency during concurrent resyncs', async () => {
      const getOrderbookSpy = vi.spyOn(ClobClient.prototype, 'getOrderbook');
      let callNumber = 0;
      
      getOrderbookSpy.mockImplementation(async (tokenId: string) => {
        const thisCall = ++callNumber;
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          market: `test-market-${thisCall}`,
          asset_id: tokenId,
          bids: [{ price: '0.5', size: `${thisCall}00` }],
          asks: [{ price: '0.6', size: `${thisCall}00` }],
          timestamp: Date.now(),
        };
      });

      client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: [mockTokenId],
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
        client.connect();
      });

      // Trigger concurrent resyncs
      const resyncPromises = [
        client['resyncOrderbook'](mockTokenId),
        client['resyncOrderbook'](mockTokenId),
        client['resyncOrderbook'](mockTokenId),
      ];

      await Promise.all(resyncPromises);

      // Get the final cached orderbook
      const finalOrderbook = client.getOrderbook(mockTokenId);
      
      // Should have the data from the single call that was made
      expect(finalOrderbook).not.toBeNull();
      expect(finalOrderbook?.market).toBe('test-market-1');
      expect(finalOrderbook?.bids[0].size).toBe('100');
      
      getOrderbookSpy.mockRestore();
    });
  });
});
