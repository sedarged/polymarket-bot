import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingClient } from '../src/clients/tradingClient';
import { isLiveTradingEnabled } from '../src/utils/liveTrading';

// Mock the dependencies
vi.mock('../src/config', () => ({
  config: {
    liveTrading: false,
    complianceAccepted: false,
    privateKey: undefined,
    clobApiUrl: 'https://clob.polymarket.com',
    chainId: 137,
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

describe('TradingClient', () => {
  let client: TradingClient;

  beforeEach(() => {
    client = new TradingClient();
  });

  describe('initialization', () => {
    it('should not be initialized by default', () => {
      expect(client.isInitialized()).toBe(false);
    });

    it('should fail to initialize without live trading enabled', async () => {
      await expect(client.initialize()).rejects.toThrow(
        'Live trading is disabled'
      );
    });

    it('should return null for wallet address when not initialized', () => {
      expect(client.getAddress()).toBeNull();
    });
  });

  describe('getState', () => {
    it('should return empty state when not initialized', () => {
      const state = client.getState();
      expect(state.orders).toEqual([]);
      expect(state.fills).toEqual([]);
      expect(state.positions).toEqual([]);
      expect(state.balances).toEqual([]);
    });
  });

  describe('order operations', () => {
    it('should fail to create order without initialization', async () => {
      await expect(
        client.createOrder('0xtoken', 'BUY', '0.5', '10')
      ).rejects.toThrow();
    });

    it('should fail to cancel order without initialization', async () => {
      await expect(client.cancelOrder('order-123')).rejects.toThrow();
    });

    it('should fail to cancel all orders without initialization', async () => {
      await expect(client.cancelAllOrders()).rejects.toThrow();
    });
  });
});

describe('isLiveTradingEnabled', () => {
  it('should return false when both flags are false', () => {
    expect(
      isLiveTradingEnabled({
        liveTrading: false,
        complianceAccepted: false,
      } as any)
    ).toBe(false);
  });

  it('should return false when only liveTrading is true', () => {
    expect(
      isLiveTradingEnabled({
        liveTrading: true,
        complianceAccepted: false,
      } as any)
    ).toBe(false);
  });

  it('should return false when only complianceAccepted is true', () => {
    expect(
      isLiveTradingEnabled({
        liveTrading: false,
        complianceAccepted: true,
      } as any)
    ).toBe(false);
  });

  it('should return true when both flags are true', () => {
    expect(
      isLiveTradingEnabled({
        liveTrading: true,
        complianceAccepted: true,
      } as any)
    ).toBe(true);
  });
});
