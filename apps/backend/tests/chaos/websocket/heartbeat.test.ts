/**
 * Chaos Test: WebSocket Heartbeat Failures
 * 
 * Tests system behavior when WebSocket heartbeat/ping-pong fails.
 * Validates timeout detection and recovery.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient, WebSocketState } from '../../../src/clients/websocket';
import { WebSocketServer } from 'ws';
import {
  waitForCondition,
  simulateNetworkLatency,
  CrashableWebSocketServer,
} from '../utils/chaosHelpers';

describe('Chaos: WebSocket Heartbeat Timeout', () => {
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

  it('should detect connection loss via heartbeat timeout', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 1000,
    });

    let connectionLost = false;

    client.on('close', () => {
      connectionLost = true;
    });

    // Connect
    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    expect(client.isConnected()).toBe(true);

    // Simulate network partition (connection alive but not responding)
    crashableServer.simulateNetworkPartition();

    // Wait beyond heartbeat interval + timeout
    // Default heartbeat is 30s, timeout is 5s
    await vi.advanceTimersByTimeAsync(40000);

    // Connection should be detected as lost
    expect(connectionLost).toBe(true);
    expect(client.getState()).not.toBe(WebSocketState.CONNECTED);
  });

  it('should maintain connection when heartbeat responds', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 1000,
    });

    let disconnectCount = 0;

    client.on('close', () => {
      disconnectCount++;
    });

    // Connect
    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    // Normal operation with heartbeat
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(35000); // Just past heartbeat interval
    }

    // Should still be connected (server responds to ping)
    expect(client.isConnected()).toBe(true);
    expect(disconnectCount).toBe(0);
  });

  it('should reconnect after heartbeat timeout', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 1000,
    });

    let reconnectCount = 0;

    client.on('open', () => {
      reconnectCount++;
    });

    // Initial connect
    client.connect();
    await vi.advanceTimersByTimeAsync(100);

    expect(reconnectCount).toBe(1);

    // Simulate network partition
    crashableServer.simulateNetworkPartition();

    // Wait for timeout
    await vi.advanceTimersByTimeAsync(40000);

    // Reconnect should be attempted
    await vi.advanceTimersByTimeAsync(2000);

    expect(reconnectCount).toBeGreaterThan(1);
  });
});

describe('Chaos: WebSocket Network Partition', () => {
  let server: WebSocketServer;
  let crashableServer: CrashableWebSocketServer;
  let port: number;
  let client: WebSocketClient;

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

  it('should detect and recover from network partition', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 100,
    });

    let partitionDetected = false;
    let recovered = false;
    let recoveryTime = 0;

    client.on('close', () => {
      partitionDetected = true;
      recoveryTime = Date.now();
    });

    client.on('open', () => {
      if (partitionDetected) {
        recovered = true;
        recoveryTime = Date.now() - recoveryTime;
      }
    });

    // Connect
    client.connect();
    await waitForCondition(() => client.isConnected(), 2000);

    // Simulate partition
    crashableServer.simulateNetworkPartition();
    await simulateNetworkLatency(100);

    // Resume from partition
    crashableServer.resumeFromPartition();

    // Wait for recovery
    await waitForCondition(() => recovered, 5000);

    expect(partitionDetected).toBe(true);
    expect(recovered).toBe(true);
    expect(recoveryTime).toBeGreaterThan(0);
  });

  it('should handle partial network partition (intermittent connectivity)', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 100,
      maxReconnectDelay: 1000,
    });

    let disconnectCount = 0;
    let reconnectCount = 0;

    client.on('close', () => disconnectCount++);
    client.on('open', () => reconnectCount++);

    // Initial connect
    client.connect();
    await waitForCondition(() => client.isConnected(), 2000);

    // Simulate intermittent connectivity
    for (let i = 0; i < 3; i++) {
      crashableServer.simulateNetworkPartition();
      await simulateNetworkLatency(200);
      
      crashableServer.resumeFromPartition();
      await simulateNetworkLatency(500);
    }

    // Should handle multiple partitions
    expect(disconnectCount).toBeGreaterThan(0);
    expect(reconnectCount).toBeGreaterThan(1);
  });
});

describe('Chaos: WebSocket Silent Connection Loss', () => {
  let server: WebSocketServer;
  let port: number;
  let client: WebSocketClient;

  beforeEach(async () => {
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
      await client.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should detect silent connection loss (zombie connection)', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 100,
    });

    let connectionLostDetected = false;

    client.on('close', () => {
      connectionLostDetected = true;
    });

    // Connect
    client.connect();
    await waitForCondition(() => client.isConnected(), 2000);

    // Silently close server side (client doesn't get close event immediately)
    server.clients.forEach((ws) => {
      // Remove all listeners to prevent proper close notification
      ws.removeAllListeners();
      ws.terminate();
    });

    await simulateNetworkLatency(100);

    // Should eventually detect the loss
    await waitForCondition(() => connectionLostDetected, 5000);

    expect(connectionLostDetected).toBe(true);
  });

  it('should recover from zombie connection state', async () => {
    client = new WebSocketClient({
      url: `ws://localhost:${port}`,
      reconnectDelay: 100,
    });

    let recoverySuccessful = false;

    client.on('open', () => {
      if (!client.isConnected()) {
        recoverySuccessful = false;
      } else {
        recoverySuccessful = true;
      }
    });

    // Initial connect
    client.connect();
    await waitForCondition(() => client.isConnected(), 2000);

    // Create zombie state
    server.clients.forEach((ws) => {
      ws.terminate();
    });

    await simulateNetworkLatency(200);

    // Should reconnect
    await waitForCondition(() => recoverySuccessful, 5000);

    expect(client.isConnected()).toBe(true);
    expect(recoverySuccessful).toBe(true);
  });
});
