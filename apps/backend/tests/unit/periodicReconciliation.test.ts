import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TradingClient } from '../../src/clients/tradingClient';
import { logger } from '../../src/utils/logger';

/**
 * Tests for periodic reconciliation (Gap RE-001)
 * 
 * These tests validate:
 * - Periodic reconciliation starts and runs at intervals
 * - Reconciliation detects missing/orphan orders (RE-002)
 * - Reconciliation detects balance drift (RE-003)
 * - Reconciliation detects position drift (RE-003)
 * - Reconciliation can be stopped gracefully
 * - Reconciliation errors don't stop the periodic timer
 */

// Mock the dependencies
vi.mock('../../src/config', () => ({
  config: {
    liveTrading: false,
    complianceAccepted: false,
    privateKey: undefined,
    clobApiUrl: 'https://clob.polymarket.com',
    chainId: 137,
    reconciliationIntervalSeconds: 300, // 5 minutes
  },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Periodic Reconciliation (Gap RE-001)', () => {
  let client: TradingClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    client = new TradingClient();
  });

  afterEach(() => {
    // Ensure any running periodic reconciliation interval is cleaned up
    client.stopPeriodicReconciliation();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Periodic Reconciliation Control', () => {
    it('should start periodic reconciliation', () => {
      // Start periodic reconciliation with a short interval for testing (5 seconds)
      client.startPeriodicReconciliation(5);

      // Verify it started (no error thrown)
      expect(client.getLastReconciliationTime()).toBe(0); // Not run yet
      
      // Cleanup to prevent interval leakage
      client.stopPeriodicReconciliation();
    });

    it('should not start if already running', () => {
      client.startPeriodicReconciliation(5);
      client.startPeriodicReconciliation(5); // Try to start again

      // Should log a warning
      expect(logger.warn).toHaveBeenCalledWith('Periodic reconciliation already running');

      // Cleanup to prevent interval leakage
      client.stopPeriodicReconciliation();
    });

    it('should stop periodic reconciliation', () => {
      client.startPeriodicReconciliation(5);
      client.stopPeriodicReconciliation();

      // Should log that it stopped
      expect(logger.info).toHaveBeenCalledWith(
        'Stopped periodic reconciliation',
        expect.objectContaining({ gap: 'RE-001' })
      );
    });

    it('should handle stopping when not running', () => {
      // Should not throw
      expect(() => client.stopPeriodicReconciliation()).not.toThrow();
    });
  });

  describe('Reconciliation Timing', () => {
    it('should run reconciliation at configured intervals', async () => {
      // Mock the reconcile method to track calls
      const reconcileSpy = vi.spyOn(client as any, 'reconcile').mockResolvedValue(undefined);

      // Start with 1 second interval for faster testing
      client.startPeriodicReconciliation(1);

      // Fast-forward time by 1 second
      await vi.advanceTimersByTimeAsync(1000);

      // Should have called reconcile once
      expect(reconcileSpy).toHaveBeenCalledTimes(1);

      // Fast-forward another second
      await vi.advanceTimersByTimeAsync(1000);

      // Should have called reconcile twice
      expect(reconcileSpy).toHaveBeenCalledTimes(2);

      client.stopPeriodicReconciliation();
    });

    it('should update last reconciliation time', async () => {
      // Mock Date.now to return predictable values
      const mockNow = 1000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);
      
      // Mock the reconcile method to set lastReconciliationTime
      vi.spyOn(client as any, 'reconcile').mockImplementation(async function(this: any) {
        this.lastReconciliationTime = Date.now();
      });

      client.startPeriodicReconciliation(1);

      // Initially zero
      expect(client.getLastReconciliationTime()).toBe(0);

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000);

      // Should be updated to our mocked timestamp
      expect(client.getLastReconciliationTime()).toBe(mockNow);

      client.stopPeriodicReconciliation();
    });

    it('should continue running after reconciliation errors', async () => {
      // Mock reconcile to fail
      const reconcileSpy = vi.spyOn(client as any, 'reconcile')
        .mockRejectedValue(new Error('Test error'));

      client.startPeriodicReconciliation(1);

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000);

      // Should have attempted reconciliation
      expect(reconcileSpy).toHaveBeenCalledTimes(1);

      // Should log the error
      expect(logger.error).toHaveBeenCalledWith(
        'Periodic reconciliation failed',
        expect.objectContaining({
          error: 'Test error',
          gap: 'RE-001',
        })
      );

      // Fast-forward again - should still attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(reconcileSpy).toHaveBeenCalledTimes(2);

      client.stopPeriodicReconciliation();
    });
  });

  describe('Drift Detection (Gap RE-002, RE-003)', () => {
    it('should detect missing orders on exchange', () => {
      // Add a test order to local state
      client._addTestOrder({
        orderId: 'local-order-1',
        tokenId: '0xtoken123',
        side: 'BUY' as const,
        price: '0.50',
        size: '100',
        status: 'OPEN' as const,
        createdAt: Date.now(),
        filledSize: '0',
        remainingSize: '100',
      });

      // Simulate reconciliation with empty remote orders (order is missing)
      const previousOrderIds = new Set(['local-order-1']);
      const remoteOrders: any[] = [];
      const previousBalances: any[] = [];
      const previousPositions: any[] = [];

      (client as any).detectDiscrepancies(
        previousOrderIds,
        remoteOrders,
        previousBalances,
        previousPositions
      );

      // Should log missing order error
      expect(logger.error).toHaveBeenCalledWith(
        'Reconciliation: detected missing orders on exchange',
        expect.objectContaining({
          count: 1,
          orderIds: ['local-order-1'],
          gap: 'RE-002',
        })
      );
    });

    it('should detect orphaned orders on exchange', () => {
      // No local orders
      const previousOrderIds = new Set<string>();
      
      // But remote has an order we don't know about
      const remoteOrders = [{
        orderId: 'remote-orphan-1',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.50',
        size: '100',
        status: 'OPEN',
      }];
      
      const previousBalances: any[] = [];
      const previousPositions: any[] = [];

      (client as any).detectDiscrepancies(
        previousOrderIds,
        remoteOrders,
        previousBalances,
        previousPositions
      );

      // Should log orphaned order warning
      expect(logger.warn).toHaveBeenCalledWith(
        'Reconciliation: detected orphaned orders on exchange',
        expect.objectContaining({
          count: 1,
          orderIds: ['remote-orphan-1'],
          gap: 'RE-002',
        })
      );
    });

    it('should detect significant balance drift', () => {
      const previousOrderIds = new Set<string>();
      const remoteOrders: any[] = [];
      
      // Previous balance: 1000 USDC
      const previousBalances = [{
        currency: 'USDC',
        available: '1000',
        total: '1000',
      }];
      
      const previousPositions: any[] = [];

      // Set current balance to 900 (10% drift)
      (client as any).state.balances = [{
        currency: 'USDC',
        available: '900',
        total: '900',
      }];

      (client as any).detectDiscrepancies(
        previousOrderIds,
        remoteOrders,
        previousBalances,
        previousPositions
      );

      // Should log balance drift warning
      expect(logger.warn).toHaveBeenCalledWith(
        'Reconciliation: detected balance drift',
        expect.objectContaining({
          currency: 'USDC',
          previous: '1000',
          current: '900',
          drift: '100.00',
          driftPercent: '10.00%',
          gap: 'RE-003',
        })
      );
    });

    it('should detect position size changes', () => {
      const previousOrderIds = new Set<string>();
      const remoteOrders: any[] = [];
      const previousBalances: any[] = [];
      
      // Previous position: 50 units
      const previousPositions = [{
        tokenId: '0xtoken123',
        side: 'BUY',
        size: '50',
        averagePrice: '0.50',
      }];

      // Set current position to 45 units
      (client as any).state.positions = [{
        tokenId: '0xtoken123',
        side: 'BUY',
        size: '45',
        averagePrice: '0.50',
      }];

      (client as any).detectDiscrepancies(
        previousOrderIds,
        remoteOrders,
        previousBalances,
        previousPositions
      );

      // Should log position change
      expect(logger.info).toHaveBeenCalledWith(
        'Reconciliation: position size changed',
        expect.objectContaining({
          tokenId: '0xtoken123',
          previousSize: '50',
          currentSize: '45',
          drift: '5.0000',
          gap: 'RE-003',
        })
      );
    });

    it('should not log insignificant balance drift', () => {
      const previousOrderIds = new Set<string>();
      const remoteOrders: any[] = [];
      
      // Previous balance: 1000 USDC
      const previousBalances = [{
        currency: 'USDC',
        available: '1000',
        total: '1000',
      }];
      
      const previousPositions: any[] = [];

      // Set current balance to 1005 (0.5% drift, below threshold)
      (client as any).state.balances = [{
        currency: 'USDC',
        available: '1005',
        total: '1005',
      }];

      (client as any).detectDiscrepancies(
        previousOrderIds,
        remoteOrders,
        previousBalances,
        previousPositions
      );

      // Should NOT log balance drift (below 1% and below $10 threshold)
      expect(logger.warn).not.toHaveBeenCalledWith(
        'Reconciliation: detected balance drift',
        expect.anything()
      );
    });
  });
});
