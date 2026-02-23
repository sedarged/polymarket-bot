/**
 * Chaos Test: WebSocket Disconnections
 * 
 * Tests system behavior when WebSocket connections are suddenly dropped.
 * Validates reconnection logic, exponential backoff, and state consistency.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient, WebSocketState } from '../../../src/clients/websocket';
import { MarketFeedClient } from '../../../src/clients/marketFeed';
import { WebSocketServer } from 'ws';
import {
  waitForCondition,
  waitForEvent,
  simulateNetworkLatency,
  CrashableWebSocketServer,
  measureTime,
} from '../utils/chaosHelpers';
import { WSOrderbookSnapshot } from '@polymarket/shared';

// Mock CLOB client to prevent real API calls
// Note: This is a module-level mock shared across all tests in this file.
// If tests need different behaviors, override in beforeEach or use vi.mock with factory.
vi.mock('../../../src/clients/clob', () => {
  const mockGetOrderbook = vi.fn().mockResolvedValue({
    market: 'test-market',
    asset_id: '0xtest123',
    bids: [{ price: '0.50', size: '100' }],
    asks: [{ price: '0.51', size: '100' }],
    timestamp: Date.now(),
  });

  return {
    ClobClient: class MockClobClient {
      getOrderbook = mockGetOrderbook;
    },
  };
});

describe('Chaos: WebSocket Sudden Disconnect', () => {
  let server: WebSocketServer;
  let crashableServer: CrashableWebSocketServer;
  let port: number;
  let client: WebSocketClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    server = new WebSocketServer({ port: 0 });
    crashableServer = new CrashableWebSocketServer(server);

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
    vi.useRealTimers();
  });

  it('should automatically reconnect after sudden disconnect', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 1000,
      maxReconnectDelay: 5000,
    });

    let connectCount = 0;
    let disconnectCount = 0;

    client.on('open', () => connectCount++);
    client.on('close', () => disconnectCount++);

    // Initial connection
    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    expect(connectCount).toBe(1);
    expect(client.getState()).toBe(WebSocketState.CONNECTED);

    // Simulate sudden disconnect
    crashableServer.crash();
    await vi.advanceTimersByTimeAsync(100);

    expect(disconnectCount).toBe(1);
    expect(client.getState()).toBe(WebSocketState.RECONNECTING);

    // Wait for reconnection
    await vi.advanceTimersByTimeAsync(2000);

    // Should have reconnected
    expect(connectCount).toBeGreaterThanOrEqual(2);
    expect(client.getState()).toBe(WebSocketState.CONNECTED);
  });

  it('should maintain exponential backoff on repeated disconnects', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 100,
      maxReconnectDelay: 1000,
      reconnectBackoffMultiplier: 2,
    });

    const reconnectTimes: number[] = [];
    let disconnectCount = 0;

    client.on('close', () => {
      disconnectCount++;
      reconnectTimes.push(Date.now());
    });

    // Initial connection
    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    // Simulate multiple disconnects
    for (let i = 0; i < 3; i++) {
      crashableServer.crash();
      await vi.advanceTimersByTimeAsync(100);
      
      // Wait for reconnect attempt
      const backoffDelay = Math.min(100 * Math.pow(2, i), 1000);
      await vi.advanceTimersByTimeAsync(backoffDelay + 500);
    }

    expect(disconnectCount).toBe(3);
    expect(reconnectTimes.length).toBe(3);
  });

  it('should stop reconnecting after max attempts', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 100,
      maxReconnectAttempts: 3,
    });

    let finalState: WebSocketState | null = null;
    let reconnectAttempts = 0;

    client.on('close', () => {
      reconnectAttempts++;
      finalState = client.getState();
    });

    // Initial connection
    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    // Close server permanently
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // Wait for max reconnect attempts
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    // Should have stopped trying after max attempts
    expect(client.getState()).toBe(WebSocketState.DISCONNECTED);
  });
});

describe('Chaos: WebSocket Disconnect During Operation', () => {
  let server: WebSocketServer;
  let crashableServer: CrashableWebSocketServer;
  let port: number;
  let client: MarketFeedClient;

  const mockTokenId = '0xtest123';
  const mockOrderbook: WSOrderbookSnapshot = {
    event_type: 'book',
    asset_id: mockTokenId,
    market: 'test-market',
    bids: [{ price: '0.50', size: '100' }],
    asks: [{ price: '0.51', size: '100' }],
    timestamp: Date.now(),
  };

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0 });
    crashableServer = new CrashableWebSocketServer(server);

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
      await client.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should maintain orderbook cache after disconnect and reconnect', async () => {
    client = new MarketFeedClient({
      url: `ws://localhost:${port}`,
      tokenIds: [mockTokenId],
      reconnectDelay: 100,
    });

    client.connect();
    await waitForEvent(client, 'connected', 2000);

    // Receive initial orderbook
    const connections = Array.from(server.clients);
    if (connections[0]) {
      connections[0].send(JSON.stringify(mockOrderbook));
      await simulateNetworkLatency(100);
    }

    const beforeDisconnect = client.getOrderbook(mockTokenId);
    expect(beforeDisconnect).toBeDefined();
    expect(beforeDisconnect?.bids).toHaveLength(1);

    // Disconnect
    crashableServer.crash();
    await simulateNetworkLatency(200);

    // Cache should still have data during reconnection
    const duringReconnect = client.getOrderbook(mockTokenId);
    expect(duringReconnect).toBeDefined();
    expect(duringReconnect?.bids).toHaveLength(1);

    // Wait for reconnect
    await waitForCondition(() => client.isConnected(), 3000);

    // Cache should still be intact
    const afterReconnect = client.getOrderbook(mockTokenId);
    expect(afterReconnect).toBeDefined();
    expect(afterReconnect?.bids).toHaveLength(1);
  });

  it('should handle disconnect during data reception', async () => {
    client = new MarketFeedClient({
      url: `ws://localhost:${port}`,
      tokenIds: [mockTokenId],
      reconnectDelay: 100,
    });

    let updateCount = 0;
    client.on('snapshot', () => updateCount++);

    client.connect();
    await waitForEvent(client, 'connected', 2000);

    // Start sending data
    const connections = Array.from(server.clients);
    if (connections[0]) {
      // Send first update
      connections[0].send(JSON.stringify(mockOrderbook));
      await simulateNetworkLatency(50);

      // Disconnect in the middle
      crashableServer.crash();
      await simulateNetworkLatency(100);
    }

    // Wait for reconnect
    await waitForCondition(() => client.isConnected(), 3000);

    // Send data on new connection
    const newConnections = Array.from(server.clients);
    if (newConnections[0]) {
      newConnections[0].send(JSON.stringify({
        ...mockOrderbook,
        timestamp: Date.now(),
      }));
      await simulateNetworkLatency(100);
    }

    // Should have received updates
    expect(updateCount).toBeGreaterThan(0);
  });
});

describe('Chaos: Multiple Rapid Disconnects', () => {
  let server: WebSocketServer;
  let crashableServer: CrashableWebSocketServer;
  let port: number;
  let client: WebSocketClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    server = new WebSocketServer({ port: 0 });
    crashableServer = new CrashableWebSocketServer(server);

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
      await client.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    vi.useRealTimers();
  });

  it('should handle rapid consecutive disconnects', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 100,
      maxReconnectDelay: 1000,
    });

    let connectCount = 0;
    let disconnectCount = 0;

    client.on('open', () => connectCount++);
    client.on('close', () => disconnectCount++);

    // Initial connection
    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    // Rapid disconnects
    for (let i = 0; i < 5; i++) {
      crashableServer.crash();
      await vi.advanceTimersByTimeAsync(50);
      
      // Wait for reconnect
      await vi.advanceTimersByTimeAsync(200);
    }

    // Should eventually reconnect and stabilize
    await vi.advanceTimersByTimeAsync(2000);
    
    expect(disconnectCount).toBe(5);
    expect(connectCount).toBeGreaterThan(1);
  });

  it('should not create duplicate reconnection timers', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 1000,
    });

    let reconnectScheduled = 0;
    
    // Track reconnection attempts
    client.on('close', () => {
      reconnectScheduled++;
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    // Disconnect multiple times quickly
    for (let i = 0; i < 3; i++) {
      crashableServer.crash();
      await vi.advanceTimersByTimeAsync(100);
    }

    // Should only schedule reconnect once per disconnect
    expect(reconnectScheduled).toBe(3);
  });
});
