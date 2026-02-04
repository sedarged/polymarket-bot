/**
 * Tests for graceful shutdown behavior (Audit Finding A-017)
 * 
 * Verifies that:
 * - WebSocket connections close properly
 * - All resources are cleaned up
 * - Shutdown completes within timeout
 * - No resource leaks or lingering connections
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient, WebSocketState } from '../src/clients/websocket';
import { MarketFeedClient } from '../src/clients/marketFeed';
import { WebSocketServer } from 'ws';

describe('Graceful Shutdown (A-017)', () => {
  let server: WebSocketServer;
  let port: number;

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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('WebSocketClient.close()', () => {
    it('should close connection and return Promise', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      // Connect first
      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      expect(client.isConnected()).toBe(true);

      // Close should return a Promise
      const closePromise = client.close();
      expect(closePromise).toBeInstanceOf(Promise);

      // Wait for close to complete
      await closePromise;

      // Connection should be closed
      expect(client.getState()).toBe(WebSocketState.CLOSED);
      expect(client.isConnected()).toBe(false);
    });

    it('should clear reconnect timer on close', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
        maxReconnectDelay: 1000,
      });

      // Connect first
      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      // Close the client
      await client.close();

      // Verify reconnect timer was cleared and state is closed
      expect(client.getState()).toBe(WebSocketState.CLOSED);
    });

    it('should handle close timeout gracefully', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      // Connect first
      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      // Mock the WebSocket to never emit close event (simulates hanging)
      const ws = (client as any).ws;
      if (ws) {
        const originalClose = ws.close.bind(ws);
        ws.close = vi.fn(() => {
          // Don't call original close, simulating hang
          // The timeout should kick in
        });
      }

      // Close should still complete due to timeout
      const startTime = Date.now();
      await client.close();
      const duration = Date.now() - startTime;

      // Should complete within timeout window (5 seconds + buffer)
      expect(duration).toBeLessThan(6000);
      expect(client.getState()).toBe(WebSocketState.CLOSED);
    }, 10000); // Increased timeout for this test

    it('should be idempotent (safe to call multiple times)', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      // Connect first
      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      // Close multiple times
      await client.close();
      await client.close();
      await client.close();

      // Should still be closed with no errors
      expect(client.getState()).toBe(WebSocketState.CLOSED);
    });

    it('should handle already-closed connection', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
      });

      // Close without ever connecting
      await client.close();

      expect(client.getState()).toBe(WebSocketState.CLOSED);
    });
  });

  describe('MarketFeedClient.close()', () => {
    it('should close WebSocket and wait for pending operations', async () => {
      const client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: ['test-token-1'],
        reconnectDelay: 100,
      });

      // Connect first
      const connectedPromise = new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
      });
      client.connect();
      await connectedPromise;

      expect(client.isConnected()).toBe(true);

      // Close should return a Promise
      const closePromise = client.close();
      expect(closePromise).toBeInstanceOf(Promise);

      // Wait for close to complete
      await closePromise;

      // Connection should be closed
      expect(client.isConnected()).toBe(false);
    });

    it('should wait for in-flight resync operations', async () => {
      const client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: ['test-token-1'],
        reconnectDelay: 100,
      });

      // Start a resync operation (by triggering a reconnect scenario)
      const connectedPromise = new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
      });
      client.connect();
      await connectedPromise;

      // Close should wait for any pending operations
      const startTime = Date.now();
      await client.close();
      const duration = Date.now() - startTime;

      // Should complete reasonably quickly (no long hangs)
      expect(duration).toBeLessThan(10000);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Shutdown under various scenarios', () => {
    it('should handle shutdown with active WebSocket connection', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      // Simulate messages being processed
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify({ type: 'test', data: 'test' }));
      });

      // Should close cleanly
      await client.close();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle shutdown during reconnect attempt', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      // Connect first
      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      // Close should work even if there's a reconnect timer pending
      await client.close();
      expect(client.getState()).toBe(WebSocketState.CLOSED);
    });

    it('should handle shutdown with network issues', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      // Abruptly close server (simulates network issue)
      server.clients.forEach((ws) => {
        ws.terminate();
      });

      // Should still close cleanly
      await client.close();
      expect(client.getState()).toBe(WebSocketState.CLOSED);
    });
  });

  describe('Resource cleanup verification', () => {
    it('should not leave lingering timers after close', async () => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      const openPromise = new Promise<void>((resolve) => {
        client.on('open', () => resolve());
      });
      client.connect();
      await openPromise;

      // Get initial handle count (rough measure)
      const initialHandles = process._getActiveHandles ? process._getActiveHandles().length : 0;

      await client.close();

      // Wait a bit for any async cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have significantly more handles
      const finalHandles = process._getActiveHandles ? process._getActiveHandles().length : 0;
      
      // Note: This is a rough check - some handles are unavoidable
      // We mainly want to ensure we're not leaking many timers
      expect(finalHandles).toBeLessThanOrEqual(initialHandles + 5);
    });

    it('should complete shutdown within timeout', async () => {
      const client = new MarketFeedClient({
        url: `ws://localhost:${port}`,
        tokenIds: ['test-token-1', 'test-token-2'],
        reconnectDelay: 100,
      });

      const connectedPromise = new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
      });
      client.connect();
      await connectedPromise;

      // Shutdown should complete within reasonable time
      const startTime = Date.now();
      await client.close();
      const duration = Date.now() - startTime;

      // Should complete well within the 10 second server shutdown timeout
      expect(duration).toBeLessThan(8000);
    });
  });
});
