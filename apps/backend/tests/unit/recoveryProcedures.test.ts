import { describe, it, expect, beforeEach } from 'vitest';
import { RecoveryProcedures } from '../../src/sync/recoveryProcedures';
import {
  Discrepancy,
  DiscrepancyType,
  DiscrepancySeverity,
  RecoveryActionType,
  SyncConfig,
} from '../../src/sync/types';

describe('RecoveryProcedures', () => {
  let recovery: RecoveryProcedures;
  let config: SyncConfig;

  beforeEach(() => {
    config = {
      syncIntervalMs: 5 * 60 * 1000,
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
    recovery = new RecoveryProcedures(config);
  });

  describe('recover - missing order', () => {
    it('should create cancel orphan order action', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.MISSING_ORDER,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Order exists locally but not remotely',
        metadata: { orderId: 'order-1' },
      };

      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.CANCEL_ORPHAN_ORDER);
      expect(action.executed).toBe(true);
      expect(action.success).toBe(true);
      expect(action.discrepancyType).toBe(DiscrepancyType.MISSING_ORDER);
    });
  });

  describe('recover - extra order', () => {
    it('should create sync order action', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.EXTRA_ORDER,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Order exists remotely but not locally',
        metadata: { orderId: 'order-1' },
      };

      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.SYNC_ORDER);
      expect(action.executed).toBe(true);
      expect(action.success).toBe(true);
      expect(action.discrepancyType).toBe(DiscrepancyType.EXTRA_ORDER);
    });
  });

  describe('recover - order status mismatch', () => {
    it('should create sync order action', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.ORDER_STATUS_MISMATCH,
        severity: DiscrepancySeverity.MEDIUM,
        timestamp: Date.now(),
        description: 'Order status differs',
        metadata: { orderId: 'order-1', localStatus: 'OPEN', remoteStatus: 'MATCHED' },
      };

      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.SYNC_ORDER);
      expect(action.executed).toBe(true);
      expect(action.success).toBe(true);
    });
  });

  describe('recover - position mismatch', () => {
    it('should create update position action', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.POSITION_MISMATCH,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Position size mismatch',
        metadata: { tokenId: 'token-1', localSize: '100', remoteSize: '150' },
      };

      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.UPDATE_POSITION);
      expect(action.executed).toBe(true);
      expect(action.success).toBe(true);
    });
  });

  describe('recover - balance mismatch', () => {
    it('should create update balance action', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.BALANCE_MISMATCH,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Balance mismatch',
        metadata: { tokenId: 'USDC', localAmount: '1000', remoteAmount: '900' },
      };

      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.UPDATE_BALANCE);
      expect(action.executed).toBe(true);
      expect(action.success).toBe(true);
    });
  });

  describe('recover - stale orderbook', () => {
    it('should create resync orderbook action', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.ORDERBOOK_STALE,
        severity: DiscrepancySeverity.MEDIUM,
        timestamp: Date.now(),
        description: 'Orderbook is stale',
        metadata: { tokenId: 'token-1', ageMs: 60000 },
      };

      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.RESYNC_ORDERBOOK);
      expect(action.executed).toBe(true);
      expect(action.success).toBe(true);
    });
  });

  describe('recover - missed fill', () => {
    it('should create fetch missed fills action', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.MISSED_FILL,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Fill was missed locally',
        metadata: { fillId: 'fill-1', orderId: 'order-1' },
      };

      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.FETCH_MISSED_FILLS);
      expect(action.executed).toBe(true);
      expect(action.success).toBe(true);
    });
  });

  describe('auto-recovery disabled', () => {
    it('should require manual intervention when auto-recovery is disabled', async () => {
      const disabledConfig = { ...config, autoRecoveryEnabled: false };
      const disabledRecovery = new RecoveryProcedures(disabledConfig);

      const discrepancy: Discrepancy = {
        type: DiscrepancyType.MISSING_ORDER,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Order exists locally but not remotely',
        metadata: { orderId: 'order-1' },
      };

      const action = await disabledRecovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.MANUAL_INTERVENTION);
      expect(action.executed).toBe(false);
    });
  });

  describe('max recovery attempts', () => {
    it('should require manual intervention after max attempts exceeded', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.MISSING_ORDER,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Order exists locally but not remotely',
        metadata: { orderId: 'order-1' },
      };

      // Attempt recovery multiple times
      await recovery.recover(discrepancy);
      await recovery.recover(discrepancy);
      await recovery.recover(discrepancy);
      
      // Fourth attempt should fail
      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.MANUAL_INTERVENTION);
      expect(action.executed).toBe(false);
      expect(action.description).toContain('Max recovery attempts');
    });

    it('should reset attempts after calling resetAttempts', async () => {
      const discrepancy: Discrepancy = {
        type: DiscrepancyType.MISSING_ORDER,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Order exists locally but not remotely',
        metadata: { orderId: 'order-1' },
      };

      // Attempt recovery multiple times
      await recovery.recover(discrepancy);
      await recovery.recover(discrepancy);
      
      // Reset attempts
      recovery.resetAttempts();
      
      // Should be able to recover again
      const action = await recovery.recover(discrepancy);

      expect(action.type).toBe(RecoveryActionType.CANCEL_ORPHAN_ORDER);
      expect(action.executed).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should track recovery statistics', async () => {
      const discrepancy1: Discrepancy = {
        type: DiscrepancyType.MISSING_ORDER,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Order 1',
        metadata: { orderId: 'order-1' },
      };

      const discrepancy2: Discrepancy = {
        type: DiscrepancyType.POSITION_MISMATCH,
        severity: DiscrepancySeverity.HIGH,
        timestamp: Date.now(),
        description: 'Position mismatch',
        metadata: { tokenId: 'token-1' },
      };

      await recovery.recover(discrepancy1);
      await recovery.recover(discrepancy2);

      const stats = recovery.getStats();

      expect(stats.totalAttempts).toBe(2);
      expect(stats.byType[DiscrepancyType.MISSING_ORDER]).toBe(1);
      expect(stats.byType[DiscrepancyType.POSITION_MISMATCH]).toBe(1);
    });

    it('should return empty stats initially', () => {
      const stats = recovery.getStats();

      expect(stats.totalAttempts).toBe(0);
      expect(Object.keys(stats.byType)).toHaveLength(0);
    });
  });
});
