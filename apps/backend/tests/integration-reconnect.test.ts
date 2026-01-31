import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarketFeedClient } from '../src/clients/marketFeed';
import { WebSocketServer } from 'ws';
import { WSOrderbookSnapshot } from '@polymarket/shared';

describe('Market Feed Integration - WebSocket Reconnect and Safe Resume', () => {
  let server: WebSocketServer;
  let port: number;
  let client: MarketFeedClient;
  let serverConnections: any[] = [];

  const mockTokenId = '0xabcdef123456';
  const mockOrderbook: WSOrderbookSnapshot = {
    event_type: 'book',
    asset_id: mockTokenId,
    market: 'test-market',
    bids: [
      { price: '0.50', size: '100' },
      { price: '0.49', size: '50' },
    ],
    asks: [
      { price: '0.51', size: '100' },
      { price: '0.52', size: '50' },
    ],
    timestamp: Date.now(),
  };

  beforeEach(async () => {
    serverConnections = [];
    
    // Create a test WebSocket server
    server = new WebSocketServer({ port: 0 });
    
    server.on('connection', (ws) => {
      serverConnections.push(ws);
    });

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

  it('should reconnect after WebSocket drop and safely resume', async () => {
    // Setup client
    client = new MarketFeedClient({
      url: `ws://localhost:${port}`,
      tokenIds: [mockTokenId],
      reconnectDelay: 100,
    });

    // Track connection events
    let connectCount = 0;
    let disconnectCount = 0;
    
    client.on('connected', () => {
      connectCount++;
    });
    
    client.on('disconnected', () => {
      disconnectCount++;
    });

    // Start client and wait for connection
    client.connect();
    
    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
    });

    expect(connectCount).toBe(1);
    expect(client.isConnected()).toBe(true);

    // Send initial orderbook data
    const firstConnection = serverConnections[0];
    firstConnection.send(JSON.stringify(mockOrderbook));
    
    // Wait for orderbook to be cached
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const initialOrderbook = client.getOrderbook(mockTokenId);
    expect(initialOrderbook).toBeDefined();
    expect(initialOrderbook?.bids).toHaveLength(2);
    expect(initialOrderbook?.asks).toHaveLength(2);

    // Simulate WebSocket drop (server closes connection)
    firstConnection.close();
    
    // Wait for disconnect event
    await new Promise<void>((resolve) => {
      const checkDisconnect = () => {
        if (disconnectCount >= 1) {
          resolve();
        } else {
          setTimeout(checkDisconnect, 50);
        }
      };
      checkDisconnect();
    });

    expect(disconnectCount).toBe(1);

    // Wait for reconnection
    await new Promise<void>((resolve) => {
      const checkReconnect = () => {
        if (connectCount >= 2) {
          resolve();
        } else {
          setTimeout(checkReconnect, 50);
        }
      };
      setTimeout(checkReconnect, 100);
    });

    // Verify reconnection occurred
    expect(connectCount).toBeGreaterThanOrEqual(2);
    expect(client.isConnected()).toBe(true);

    // Verify cache still has data (safe resume)
    const orderbookAfterReconnect = client.getOrderbook(mockTokenId);
    expect(orderbookAfterReconnect).toBeDefined();
    expect(orderbookAfterReconnect?.bids).toHaveLength(2);
    expect(orderbookAfterReconnect?.asks).toHaveLength(2);

    // Send updated orderbook data on new connection
    if (serverConnections.length > 1) {
      const secondConnection = serverConnections[1];
      const updatedOrderbook: WSOrderbookSnapshot = {
        ...mockOrderbook,
        bids: [
          { price: '0.52', size: '120' },
          { price: '0.51', size: '60' },
        ],
        timestamp: Date.now(),
      };
      
      secondConnection.send(JSON.stringify(updatedOrderbook));
      
      // Wait for updated orderbook to be cached
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const finalOrderbook = client.getOrderbook(mockTokenId);
      expect(finalOrderbook).toBeDefined();
      expect(finalOrderbook?.bids).toHaveLength(2);
      expect(finalOrderbook?.bids[0].price).toBe('0.52');
    }
    
    // Verify the client handled reconnection gracefully
    expect(serverConnections.length).toBeGreaterThanOrEqual(2); // Original + reconnection
  });

  it('should maintain state across multiple reconnections', async () => {
    client = new MarketFeedClient({
      url: `ws://localhost:${port}`,
      tokenIds: [mockTokenId],
      reconnectDelay: 50,
    });

    let connectCount = 0;
    client.on('connected', () => {
      connectCount++;
    });

    // Start client
    client.connect();
    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
    });

    // Simulate multiple drops and reconnections
    for (let i = 0; i < 2; i++) {
      // Send data
      if (serverConnections[i]) {
        serverConnections[i].send(JSON.stringify({
          ...mockOrderbook,
          timestamp: Date.now() + i,
        }));
        
        await new Promise((resolve) => setTimeout(resolve, 100));
        
        // Verify data is cached
        const orderbook = client.getOrderbook(mockTokenId);
        expect(orderbook).toBeDefined();
        
        // Drop connection
        serverConnections[i].close();
        
        // Wait for reconnection
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // Should have connected at least twice (initial + 1 reconnect)
    expect(connectCount).toBeGreaterThanOrEqual(2);
    
    // Cache should still have the data
    const finalOrderbook = client.getOrderbook(mockTokenId);
    expect(finalOrderbook).toBeDefined();
  });
});
