import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager, SyncDataSource } from '../../src/sync/syncManager';
import { SyncConfig, DiscrepancyType } from '../../src/sync/types';
import { Order, Fill, Position, Balance, Orderbook } from '@polymarket/shared';

describe('SyncManager', () => {
  let syncManager: SyncManager;
  let config: SyncConfig;
  let mockDataSource: SyncDataSource;

  beforeEach(() => {
    config = {
      syncIntervalMs: 100, // Short interval for testing
      balanceDriftThresholdPercent: 1.0,
      balanceDriftThresholdAbsolute: 10.0,
      orderbookStaleThresholdMs: 30 * 1000,
      autoRecoveryEnabled: true,
      maxRecoveryAttempts: 3,
      syncOrdersEnabled: true,
      syncPositionsEnabled: true,
      syncBalancesEnabled: true,
      syncOrderbooksEnabled: true,
    };

    mockDataSource = {
      getOrders: vi.fn().mockResolvedValue([]),
      getFills: vi.fn().mockResolvedValue([]),
      getPositions: vi.fn().mockResolvedValue([]),
      getBalances: vi.fn().mockResolvedValue([]),
      getOrderbooks: vi.fn().mockResolvedValue(new Map()),
    };

    syncManager = new SyncManager(config, mockDataSource);
  });

  afterEach(() => {
    syncManager.stop();
    vi.clearAllMocks();
  });

  describe('start and stop', () => {
    it('should start successfully', () => {
      syncManager.start();
      expect(syncManager.isActive()).toBe(true);
    });

    it('should stop successfully', () => {
      syncManager.start();
      syncManager.stop();
      expect(syncManager.isActive()).toBe(false);
    });

    it('should not start if already running', () => {
      syncManager.start();
      syncManager.start(); // Second call should be ignored
      expect(syncManager.isActive()).toBe(true);
    });

    it('should not stop if not running', () => {
      syncManager.stop(); // Should not throw
      expect(syncManager.isActive()).toBe(false);
    });
  });

  describe('sync', () => {
    it('should perform a successful sync with no discrepancies', async () => {
      const result = await syncManager.sync();

      expect(result.success).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
      expect(result.recoveryActions).toHaveLength(0);
      expect(result.errors).toBeUndefined();
    });

    it('should detect extra orders in remote state', async () => {
      const remoteOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];

      mockDataSource.getOrders = vi.fn().mockResolvedValue(remoteOrders);

      const result = await syncManager.sync();

      expect(result.success).toBe(true);
      expect(result.discrepancies.length).toBeGreaterThan(0);
      expect(result.discrepancies[0].type).toBe(DiscrepancyType.EXTRA_ORDER);
    });

    it('should create state snapshots', async () => {
      await syncManager.sync();
      await syncManager.sync();

      const snapshots = syncManager.getSnapshots();
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].version).toBe(1);
      expect(snapshots[1].version).toBe(2);
    });

    it('should handle sync errors gracefully', async () => {
      mockDataSource.getOrders = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await syncManager.sync();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toContain('Network error');
    });

    it('should update statistics after sync', async () => {
      await syncManager.sync();

      const stats = syncManager.getStats();
      expect(stats.totalSyncs).toBe(1);
      expect(stats.successfulSyncs).toBe(1);
      expect(stats.lastSyncTime).toBeGreaterThan(0);
    });
  });

  describe('periodic sync', () => {
    it('should perform periodic syncs when started', async () => {
      syncManager.start();

      // Wait for at least one periodic sync
      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = syncManager.getStats();
      expect(stats.totalSyncs).toBeGreaterThanOrEqual(1);

      syncManager.stop();
    });
  });

  describe('snapshots', () => {
    it('should limit snapshots to maxSnapshots', async () => {
      // Perform many syncs to exceed snapshot limit
      for (let i = 0; i < 105; i++) {
        await syncManager.sync();
      }

      const snapshots = syncManager.getSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(100);
    });

    it('should return limited snapshots when requested', async () => {
      await syncManager.sync();
      await syncManager.sync();
      await syncManager.sync();

      const snapshots = syncManager.getSnapshots(2);
      expect(snapshots).toHaveLength(2);
    });
  });

  describe('statistics', () => {
    it('should track successful and failed syncs', async () => {
      await syncManager.sync(); // Success

      mockDataSource.getOrders = vi.fn().mockRejectedValue(new Error('Error'));
      await syncManager.sync(); // Failure

      const stats = syncManager.getStats();
      expect(stats.totalSyncs).toBe(2);
      expect(stats.successfulSyncs).toBe(1);
      expect(stats.failedSyncs).toBe(1);
    });

    it('should track discrepancies by type', async () => {
      const remoteOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];

      mockDataSource.getOrders = vi.fn().mockResolvedValue(remoteOrders);

      await syncManager.sync();

      const stats = syncManager.getStats();
      expect(stats.totalDiscrepancies).toBeGreaterThan(0);
      expect(stats.discrepanciesByType[DiscrepancyType.EXTRA_ORDER]).toBeGreaterThan(0);
    });

    it('should calculate average sync duration', async () => {
      await syncManager.sync();
      await syncManager.sync();

      const stats = syncManager.getStats();
      expect(stats.averageSyncDurationMs).toBeGreaterThanOrEqual(0);
      expect(stats.totalSyncs).toBe(2);
    });
  });

  describe('feature flags', () => {
    it('should skip order sync when disabled', async () => {
      const configWithDisabledOrders = { ...config, syncOrdersEnabled: false };
      const manager = new SyncManager(configWithDisabledOrders, mockDataSource);

      await manager.sync();

      expect(mockDataSource.getOrders).not.toHaveBeenCalled();
    });

    it('should skip position sync when disabled', async () => {
      const configWithDisabledPositions = { ...config, syncPositionsEnabled: false };
      const manager = new SyncManager(configWithDisabledPositions, mockDataSource);

      await manager.sync();

      expect(mockDataSource.getPositions).not.toHaveBeenCalled();
    });

    it('should skip balance sync when disabled', async () => {
      const configWithDisabledBalances = { ...config, syncBalancesEnabled: false };
      const manager = new SyncManager(configWithDisabledBalances, mockDataSource);

      await manager.sync();

      expect(mockDataSource.getBalances).not.toHaveBeenCalled();
    });

    it('should skip orderbook sync when disabled', async () => {
      const configWithDisabledOrderbooks = { ...config, syncOrderbooksEnabled: false };
      const manager = new SyncManager(configWithDisabledOrderbooks, mockDataSource);

      await manager.sync();

      expect(mockDataSource.getOrderbooks).not.toHaveBeenCalled();
    });
  });

  describe('recovery actions', () => {
    it('should execute recovery actions for detected discrepancies', async () => {
      const remoteOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];

      mockDataSource.getOrders = vi.fn().mockResolvedValue(remoteOrders);

      const result = await syncManager.sync();

      expect(result.recoveryActions.length).toBeGreaterThan(0);
      expect(result.recoveryActions[0].executed).toBe(true);
    });

    it('should track successful recovery actions', async () => {
      const remoteOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];

      mockDataSource.getOrders = vi.fn().mockResolvedValue(remoteOrders);

      await syncManager.sync();

      const stats = syncManager.getStats();
      expect(stats.totalRecoveryActions).toBeGreaterThan(0);
      expect(stats.successfulRecoveryActions).toBeGreaterThan(0);
    });
  });
});
