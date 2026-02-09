import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserFeedClient } from '../src/clients/userFeed';
import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';
import { WSUserOrder, WSUserFill } from '@polymarket/shared';

// Mock ClobClient to avoid L1 authentication during tests
vi.mock('@polymarket/clob-client', () => {
  return {
    ClobClient: vi.fn().mockImplementation(() => ({
      createOrDeriveApiKey: vi.fn().mockResolvedValue({
        apiKey: 'test-api-key',
        secret: 'test-secret',
        passphrase: 'test-passphrase',
      }),
    })),
  };
});

// Mock logger to avoid console output during tests
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config
vi.mock('../src/config', () => ({
  config: {
    wsMarketUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    clobApiUrl: 'https://clob.polymarket.com',
    chainId: 137,
    retryAttempts: 3,
    retryDelay: 1000,
    retryTotalTimeout: 300000,
    liveTrading: true, // Required for UserFeedClient
    complianceAccepted: true, // Required for UserFeedClient
  },
}));

// Mock live trading check
vi.mock('../src/utils/liveTrading', () => ({
  assertLiveTradingEnabled: vi.fn(), // Allow UserFeedClient to be created in tests
  isLiveTradingEnabled: vi.fn().mockReturnValue(true),
}));

describe('UserFeedClient', () => {
  let server: WebSocketServer;
  let port: number;
  let client: UserFeedClient;
  let testWallet: ethers.Wallet;

  beforeEach(async () => {
    // Create test wallet
    testWallet = ethers.Wallet.createRandom();

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
      client.disconnect();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('initialization', () => {
    it('should initialize with wallet', () => {
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      expect(client).toBeDefined();
      expect(client.getState()).toBe('disconnected');
    });

    it('should initialize with market IDs', () => {
      const marketIds = ['market1', 'market2'];
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
        marketIds,
      });

      expect(client).toBeDefined();
    });
  });

  describe('connection', () => {
    it('should connect to WebSocket and emit connected event', async () => {
      const connectedHandler = vi.fn();
      const authPromise = new Promise<unknown>((resolve) => {
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            resolve(JSON.parse(data.toString()));
          });
        });
      });

      client = new UserFeedClient({
        wallet: testWallet,
        wsUrl: `ws://localhost:${port}/ws/user`, // Use wsUrl parameter for testing
      });

      client.on('connected', connectedHandler);

      await client.connect();

      await new Promise<void>((resolve) => {
        client.on('connected', () => resolve());
      });

      const authMessage = await authPromise;
      expect(authMessage).toHaveProperty('type', 'USER');
      expect(authMessage).toHaveProperty('apikey');
      expect(authMessage).toHaveProperty('secret');
      expect(authMessage).toHaveProperty('passphrase');
      expect(connectedHandler).toHaveBeenCalled();
    });

    it('should authenticate with market IDs', async () => {
      const marketIds = ['market1', 'market2'];
      const authPromise = new Promise<any>((resolve) => {
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'USER' && msg.apikey) {
              resolve(msg);
            }
          });
        });
      });

      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
        marketIds,
      });

      await client.connect();

      const authMessage = await authPromise;
      expect(authMessage.markets).toEqual(marketIds);
    });
  });

  describe('message handling', () => {
    it('should handle order events', async () => {
      const orderHandler = vi.fn();
      const mockOrder: WSUserOrder = {
        event_type: 'order',
        order_id: 'order123',
        client_order_id: 'client123',
        asset_id: 'asset123',
        side: 'BUY',
        price: '0.5',
        original_size: '100',
        size_matched: '50',
        status: 'PARTIALLY_FILLED',
        created_at: Date.now(),
      };

      server.on('connection', (ws) => {
        // Send authentication acknowledgment
        setTimeout(() => {
          ws.send(JSON.stringify(mockOrder));
        }, 100);
      });

      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      client.on('order', orderHandler);

      await client.connect();

      await new Promise<void>((resolve) => {
        client.on('order', () => resolve());
      });

      expect(orderHandler).toHaveBeenCalledWith(mockOrder);
    });

    it('should handle fill events', async () => {
      const fillHandler = vi.fn();
      const mockFill: WSUserFill = {
        event_type: 'fill',
        fill_id: 'fill123',
        order_id: 'order123',
        asset_id: 'asset123',
        side: 'BUY',
        price: '0.5',
        size: '50',
        fee: '0.01',
        timestamp: Date.now(),
      };

      server.on('connection', (ws) => {
        setTimeout(() => {
          ws.send(JSON.stringify(mockFill));
        }, 100);
      });

      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      client.on('fill', fillHandler);

      await client.connect();

      await new Promise<void>((resolve) => {
        client.on('fill', () => resolve());
      });

      expect(fillHandler).toHaveBeenCalledWith(mockFill);
    });

    it('should deduplicate messages', async () => {
      const orderHandler = vi.fn();
      const mockOrder: WSUserOrder = {
        event_type: 'order',
        order_id: 'order123',
        asset_id: 'asset123',
        side: 'BUY',
        price: '0.5',
        original_size: '100',
        size_matched: '50',
        status: 'OPEN',
        created_at: Date.now(),
      };

      server.on('connection', (ws) => {
        setTimeout(() => {
          // Send same message twice
          ws.send(JSON.stringify(mockOrder));
          ws.send(JSON.stringify(mockOrder));
        }, 100);
      });

      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      client.on('order', orderHandler);

      await client.connect();

      // Wait for messages to be processed
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should only be called once due to deduplication
      expect(orderHandler).toHaveBeenCalledOnce();
    });
  });

  describe('subscription management', () => {
    it('should subscribe to additional markets', async () => {
      const subscribePromise = new Promise<any>((resolve) => {
        let messageCount = 0;
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            messageCount++;
            const msg = JSON.parse(data.toString());
            // First message is auth, second is subscribe
            if (messageCount === 2) {
              resolve(msg);
            }
          });
        });
      });

      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      await client.connect();

      const newMarkets = ['market3', 'market4'];
      await client.subscribe(newMarkets);

      const subscribeMessage = await subscribePromise;
      expect(subscribeMessage).toEqual({
        type: 'USER',
        operation: 'subscribe',
        markets: newMarkets,
      });
    });

    it('should unsubscribe from markets', async () => {
      const unsubscribePromise = new Promise<any>((resolve) => {
        let messageCount = 0;
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            messageCount++;
            const msg = JSON.parse(data.toString());
            // First message is auth, second is unsubscribe
            if (messageCount === 2) {
              resolve(msg);
            }
          });
        });
      });

      const marketIds = ['market1', 'market2'];
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
        marketIds,
      });

      await client.connect();

      await client.unsubscribe(['market1']);

      const unsubscribeMessage = await unsubscribePromise;
      expect(unsubscribeMessage).toEqual({
        type: 'USER',
        operation: 'unsubscribe',
        markets: ['market1'],
      });
    });
  });

  describe('disconnection', () => {
    it('should disconnect and update state', async () => {
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      await client.connect();

      client.disconnect();

      expect(client.getState()).toBe('disconnected');
      expect(client.isAuthenticatedState()).toBe(false);
    });

    it('should emit disconnected event', async () => {
      const disconnectedHandler = vi.fn();

      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      client.on('disconnected', disconnectedHandler);

      await client.connect();

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      client.disconnect();

      // Wait for disconnection event
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(disconnectedHandler).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should emit error event on WebSocket error', async () => {
      const errorHandler = vi.fn();

      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      client.on('error', errorHandler);

      // Connect to a closed server to trigger error
      server.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      await client.connect();

      // Wait for error
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should throw error if subscribe called before connection', async () => {
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      await expect(client.subscribe(['market1'])).rejects.toThrow(
        'WebSocket not connected or not authenticated'
      );
    });

    it('should throw error if unsubscribe called before connection', async () => {
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      await expect(client.unsubscribe(['market1'])).rejects.toThrow(
        'WebSocket not connected or not authenticated'
      );
    });
  });

  describe('authentication state', () => {
    it('should report authenticated state after connection', async () => {
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      expect(client.isAuthenticatedState()).toBe(false);

      await client.connect();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(client.isAuthenticatedState()).toBe(true);
    });

    it('should reset authenticated state on disconnection', async () => {
      client = new UserFeedClient({
        wsUrl: `ws://localhost:${port}/ws/user`,
        wallet: testWallet,
      });

      await client.connect();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(client.isAuthenticatedState()).toBe(true);

      client.disconnect();

      expect(client.isAuthenticatedState()).toBe(false);
    });
  });
});
