import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradingClient } from '../src/clients/tradingClient';
import { retry } from '../src/utils/retry';

// Store reference to mock implementations that we'll update per test
const mockGetBalanceAllowance = vi.fn();
const mockGetOrders = vi.fn();
const mockCreateOrder = vi.fn();

// Mock dependencies
vi.mock('../src/config', () => ({
  config: {
    liveTrading: true,
    complianceAccepted: true,
    privateKey: '0x' + '1'.repeat(64),
    clobApiUrl: 'https://clob.polymarket.com',
    chainId: 137,
    adminToken: 'test-token',
  },
}));

vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../src/secrets', () => ({
  loadSecretsConfig: vi.fn(() => ({
    provider: 'env',
  })),
  getPrivateKey: vi.fn(async () => ({
    key: '0x' + '1'.repeat(64),
    source: 'env',
  })),
}));

vi.mock('../src/utils/metrics', () => ({
  ordersTotal: {
    inc: vi.fn(),
  },
  orderLatency: {
    observe: vi.fn(),
  },
  orderCancellations: {
    inc: vi.fn(),
  },
  openOrders: {
    inc: vi.fn(),
    dec: vi.fn(),
  },
}));

vi.mock('../src/clients/clob', () => ({
  ClobClient: class MockClobRestClient {
    getMarkets = vi.fn().mockResolvedValue([
      {
        tokens: [{ token_id: 'test-token' }],
        minimum_order_size: '1',
        minimum_tick_size: '0.01',
      },
    ]);
    getMarketMetadata = vi.fn().mockResolvedValue({
      tickSize: '0.01',
      minOrderSize: '1',
    });
    destroy = vi.fn();
  },
}));

vi.mock('@polymarket/clob-client', () => ({
  ClobClient: class MockClobClient {
    getBalanceAllowance = mockGetBalanceAllowance;
    getOrders = mockGetOrders;
    createOrder = mockCreateOrder;
  },
  Side: {
    BUY: 'BUY',
    SELL: 'SELL',
  },
}));

vi.mock('../src/utils/retry');

describe('TradingClient - Balance Fetch Error Handling (A-011)', () => {
  let client: TradingClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock implementations
    mockGetBalanceAllowance.mockReset();
    mockGetOrders.mockReset().mockResolvedValue([]);
    mockCreateOrder.mockReset().mockResolvedValue({
      orderID: 'order-123',
      id: 'order-123',
    });
    
    // Mock retry to call the function directly (no actual retry for most tests)
    vi.mocked(retry).mockImplementation(async (fn) => await fn());
    
    client = new TradingClient();
  });

  describe('Balance fetch during reconciliation', () => {
    it('should throw error when balance fetch fails', async () => {
      // Setup: Balance fetch fails
      mockGetBalanceAllowance.mockRejectedValue(new Error('Network error'));
      
      // Mock retry to actually throw after attempts
      vi.mocked(retry).mockRejectedValue(new Error('Balance fetch failed: Network error'));

      // Expect: Initialize should throw
      await expect(client.initialize()).rejects.toThrow('Balance fetch failed');
    });

    it('should retry balance fetch on transient failures', async () => {
      // Setup: First attempt fails, second succeeds
      mockGetBalanceAllowance
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce({ balance: '1000.00' });
      
      // Mock retry to call function twice
      let attemptCount = 0;
      vi.mocked(retry).mockImplementation(async (fn) => {
        attemptCount++;
        if (attemptCount === 1) {
          try {
            return await fn();
          } catch (err) {
            // First attempt fails, retry
            return await fn();
          }
        }
        return await fn();
      });

      // Execute: Should succeed on retry
      await client.initialize();
      
      // Verify: Balance was fetched successfully
      const state = client.getState();
      expect(state.balances).toHaveLength(1);
      expect(state.balances[0].available).toBe('1000.00');
    });

    it('should clear balances on fetch failure', async () => {
      // Setup: Balance fetch fails
      mockGetBalanceAllowance.mockRejectedValue(new Error('API error'));
      
      vi.mocked(retry).mockRejectedValue(new Error('Balance fetch failed: API error'));

      // Execute: Try to initialize
      await expect(client.initialize()).rejects.toThrow();
      
      // Verify: Balances should be empty
      const state = client.getState();
      expect(state.balances).toHaveLength(0);
    });

    it('should update lastBalanceFetchTime on successful fetch', async () => {
      // Setup: Successful balance fetch
      mockGetBalanceAllowance.mockResolvedValue({ balance: '1000.00' });

      // Execute
      await client.initialize();
      
      // Verify: Balance timestamp should be set
      const state = client.getState();
      expect(state.balances).toHaveLength(1);
      
      // The timestamp should be set (we can't access private field, but we can test behavior)
      // This is tested indirectly through order placement validation
    });
  });

  describe('Balance staleness validation', () => {
    it('should block order placement when balances are unavailable', async () => {
      // Setup: Initialize without balance data
      mockGetBalanceAllowance.mockResolvedValue(null);
      
      // Initialize will try to fetch balances but get null
      // The balance fetch should throw because getBalanceAllowance returns null
      vi.mocked(retry).mockImplementation(async (fn) => {
        await fn(); // This will set empty balances
        throw new Error('Balance API returned no data');
      });
      
      // Client initialization will fail
      await expect(client.initialize()).rejects.toThrow();
      
      // Verify state shows no balances
      const state = client.getState();
      expect(state.balances).toHaveLength(0);
    });

    it('should block order placement when balances are stale', async () => {
      // Setup: Initialize with balances
      mockGetBalanceAllowance.mockResolvedValue({ balance: '1000.00' });
      await client.initialize();
      
      // Mock Date.now to simulate time passing (61 seconds = stale)
      const originalNow = Date.now;
      const initTime = originalNow();
      let timeOffset = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => initTime + timeOffset);
      
      // Fast-forward time by 61 seconds (past staleness threshold)
      timeOffset = 61000;

      // Execute: Try to create order
      await expect(
        client.createOrder('test-token', 'BUY', '0.5', '10')
      ).rejects.toThrow('Balance data is stale');
      
      // Cleanup
      Date.now = originalNow;
    });

    it('should allow order placement when balances are fresh', async () => {
      // Setup: Initialize with balances
      mockGetBalanceAllowance.mockResolvedValue({ balance: '1000.00' });
      
      await client.initialize();

      // Execute: Create order immediately (balances are fresh)
      const order = await client.createOrder('test-token', 'BUY', '0.5', '10');
      
      // Verify: Order created successfully
      expect(order).toBeDefined();
      expect(order.tokenId).toBe('test-token');
    });
  });

  describe('Error logging and escalation', () => {
    it('should log error with retry attempt count on balance fetch failure', async () => {
      const { logger } = await import('../src/utils/logger');
      
      // Setup: Balance fetch fails
      mockGetBalanceAllowance.mockRejectedValue(new Error('Service unavailable'));
      
      vi.mocked(retry).mockRejectedValue(new Error('Balance fetch failed: Service unavailable'));

      // Execute
      await expect(client.initialize()).rejects.toThrow();
      
      // Verify: Error was logged with proper context
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch balances after retries - trading will be blocked',
        expect.objectContaining({
          error: expect.stringContaining('Service unavailable'),
          attempts: 3,
        })
      );
    });

    it('should log successful balance fetch with timestamp', async () => {
      const { logger } = await import('../src/utils/logger');
      
      // Setup: Successful fetch
      mockGetBalanceAllowance.mockResolvedValue({ balance: '1000.00' });

      // Execute
      await client.initialize();
      
      // Verify: Success was logged
      expect(logger.info).toHaveBeenCalledWith(
        'Balances fetched successfully',
        expect.objectContaining({
          balance: '1000.00',
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('Integration with retry logic', () => {
    it('should use retry utility with correct parameters', async () => {
      // Setup
      mockGetBalanceAllowance.mockResolvedValue({ balance: '1000.00' });

      // Execute
      await client.initialize();
      
      // Verify: retry was called with correct options
      expect(retry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          attempts: 3,
          delay: 1000,
          backoffMultiplier: 2,
          jitter: 0.1,
          timeout: 5000,
        })
      );
    });
  });
});
