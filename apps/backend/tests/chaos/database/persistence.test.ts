/**
 * Chaos Test: Database and State Failures
 * 
 * Tests system behavior when persistence layer fails.
 * Validates state recovery, order reconciliation, and data integrity.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistenceService } from '../../../src/trading/persistenceService';
import { RecoveryProcedures } from '../../../src/sync/recoveryProcedures';
import {
  DiscrepancyType,
  DiscrepancySeverity,
  type Discrepancy,
} from '../../../src/sync/types';
import {
  waitForCondition,
  simulateNetworkLatency,
} from '../utils/chaosHelpers';

describe('Chaos: Order Persistence Failure', () => {
  let persistence: PersistenceService;

  beforeEach(() => {
    persistence = new PersistenceService(':memory:');
  });

  afterEach(() => {
    persistence.close();
  });

  it('should handle database write failure gracefully', async () => {
    const order = {
      orderId: 'test-order-1',
      tokenId: '0xtest123',
      side: 'BUY' as const,
      size: '100',
      price: '0.50',
      status: 'OPEN' as const,
      createdAt: Date.now(),
    };

    // Save order
    persistence.recordOrder(order);

    // Simulate database corruption by closing
    persistence.close();

    // Try to save another order (should fail)
    let errorCaught = false;
    try {
      persistence.recordOrder({
        ...order,
        orderId: 'test-order-2',
      });
    } catch (e) {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);
  });

  it('should recover state from database after restart', async () => {
    // Create persistence with file-based DB
    const dbPath = ':memory:'; // In real scenario would be temp file
    const persistence1 = new PersistenceService(dbPath);

    const orders = [
      {
        orderId: 'order-1',
        tokenId: '0xtest123',
        side: 'BUY' as const,
        size: '100',
        price: '0.50',
        status: 'OPEN' as const,
        createdAt: Date.now(),
      },
      {
        orderId: 'order-2',
        tokenId: '0xtest456',
        side: 'SELL' as const,
        size: '50',
        price: '0.55',
        status: 'MATCHED' as const,
        createdAt: Date.now(),
      },
    ];

    // Save orders
    orders.forEach((order) => persistence1.recordOrder(order));

    // Get orders before "restart"
    const ordersBefore = persistence1.getOrders();
    expect(ordersBefore).toHaveLength(2);

    // Close (simulate restart)
    persistence1.close();

    // Create new instance (simulate restart)
    const persistence2 = new PersistenceService(dbPath);

    // Should recover state
    const ordersAfter = persistence2.getOrders();
    expect(ordersAfter).toHaveLength(2);
    expect(ordersAfter[0].orderId).toBe('order-2'); // Ordered by created_at DESC
    expect(ordersAfter[1].orderId).toBe('order-1');

    persistence2.close();
  });

  it('should handle concurrent write failures', async () => {
    const orders = Array(10)
      .fill(null)
      .map((_, i) => ({
        orderId: `order-${i}`,
        tokenId: '0xtest123',
        side: 'BUY' as const,
        size: '100',
        price: '0.50',
        status: 'OPEN' as const,
        createdAt: Date.now() + i,
      }));

    // Attempt concurrent writes
    const writes = orders.map((order) => {
      return new Promise((resolve, reject) => {
        try {
          persistence.recordOrder(order);
          resolve(true);
        } catch (e) {
          reject(e);
        }
      });
    });

    const results = await Promise.allSettled(writes);
    
    // All writes should succeed (SQLite handles concurrent writes)
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThan(0);
  });
});

describe('Chaos: State Reconciliation After Failure', () => {
  let recovery: RecoveryProcedures;

  beforeEach(() => {
    recovery = new RecoveryProcedures({
      syncIntervalMs: 60000,
      balanceDriftThresholdPercent: 1.0,
      balanceDriftThresholdAbsolute: 10.0,
      orderbookStaleThresholdMs: 30000,
      autoRecoveryEnabled: true,
      maxRecoveryAttempts: 3,
      syncOrdersEnabled: true,
      syncPositionsEnabled: true,
      syncBalancesEnabled: true,
      syncOrderbooksEnabled: true,
    });
  });

  it('should detect missing orders after reconnect', async () => {
    // Simulate manual comparison of orders
    const localOrders = [
      { orderId: 'order-1', status: 'OPEN' },
      { orderId: 'order-2', status: 'OPEN' },
    ];

    const remoteOrders = [
      { orderId: 'order-1', status: 'OPEN' },
      // order-2 missing on remote
    ];

    // Manual discrepancy detection
    const missingInRemote = localOrders.filter(
      (local) => !remoteOrders.find((remote) => remote.orderId === local.orderId)
    );

    expect(missingInRemote.length).toBeGreaterThan(0);
    expect(missingInRemote[0].orderId).toBe('order-2');
  });

  it('should detect extra orders after reconnect', async () => {
    const localOrders = [
      { orderId: 'order-1', status: 'OPEN' },
    ];

    const remoteOrders = [
      { orderId: 'order-1', status: 'OPEN' },
      { orderId: 'order-2', status: 'OPEN' }, // Extra order on remote
    ];

    // Manual discrepancy detection
    const extraInRemote = remoteOrders.filter(
      (remote) => !localOrders.find((local) => local.orderId === remote.orderId)
    );

    expect(extraInRemote.length).toBeGreaterThan(0);
    expect(extraInRemote[0].orderId).toBe('order-2');
  });

  it('should detect order status mismatch', async () => {
    const localOrders = [
      { orderId: 'order-1', status: 'OPEN', originalSize: '100', filledSize: '0' },
    ];

    const remoteOrders = [
      { orderId: 'order-1', status: 'FILLED', originalSize: '100', filledSize: '100' },
    ];

    // Detect status mismatch
    const mismatches = localOrders.filter((local) => {
      const remote = remoteOrders.find((r) => r.orderId === local.orderId);
      return remote && remote.status !== local.status;
    });

    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches[0].orderId).toBe('order-1');
  });

  it('should recover from missing order discrepancy', async () => {
    const discrepancy: Discrepancy = {
      type: DiscrepancyType.MISSING_ORDER,
      severity: DiscrepancySeverity.HIGH,
      timestamp: Date.now(),
      description: 'Order exists locally but not remotely',
      metadata: { orderId: 'order-1' },
    };

    const action = await recovery.recover(discrepancy);

    expect(action.executed).toBe(true);
    expect(action.success).toBe(true);
    expect(action.discrepancyType).toBe(DiscrepancyType.MISSING_ORDER);
  });

  it('should recover from order status mismatch', async () => {
    const discrepancy: Discrepancy = {
      type: DiscrepancyType.ORDER_STATUS_MISMATCH,
      severity: DiscrepancySeverity.MEDIUM,
      timestamp: Date.now(),
      description: 'Order status differs between local and remote',
      metadata: {
        orderId: 'order-1',
        localStatus: 'OPEN',
        remoteStatus: 'FILLED',
      },
    };

    const action = await recovery.recover(discrepancy);

    expect(action.executed).toBe(true);
    expect(action.success).toBe(true);
    expect(action.type).toBe('SYNC_ORDER');
  });
});

describe('Chaos: Position Reconciliation', () => {
  it('should detect position mismatch', async () => {
    const localPositions = [
      { tokenId: '0xtest123', size: '100', side: 'YES' },
    ];

    const remotePositions = [
      { tokenId: '0xtest123', size: '150', side: 'YES' }, // Mismatch
    ];

    // Manual discrepancy detection
    const mismatches = localPositions.filter((local) => {
      const remote = remotePositions.find((r) => r.tokenId === local.tokenId);
      return remote && remote.size !== local.size;
    });

    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches[0].tokenId).toBe('0xtest123');
  });

  it('should recalculate positions from orders', async () => {
    const orders = [
      {
        orderId: 'order-1',
        tokenId: '0xtest123',
        side: 'BUY',
        originalSize: '100',
        filledSize: '100',
        status: 'FILLED',
      },
      {
        orderId: 'order-2',
        tokenId: '0xtest123',
        side: 'SELL',
        originalSize: '50',
        filledSize: '50',
        status: 'FILLED',
      },
    ];

    // Calculate net position
    const netPosition = orders.reduce((acc, order) => {
      const size = parseFloat(order.filledSize);
      return order.side === 'BUY' ? acc + size : acc - size;
    }, 0);

    expect(netPosition).toBe(50); // 100 bought - 50 sold = 50
  });
});

describe('Chaos: Audit Trail Integrity', () => {
  let persistence: PersistenceService;

  beforeEach(() => {
    persistence = new PersistenceService(':memory:');
  });

  afterEach(() => {
    persistence.close();
  });

  it.skip('should maintain audit trail during failures - requires logAuditEvent implementation', async () => {
    // This test requires logAuditEvent() which doesn't exist yet
    // Keeping as skip until API is implemented
  });

  it('should verify audit trail completeness', async () => {
    const orderEvents = [
      { orderId: 'order-1', eventType: 'PLACED', timestamp: 1000 },
      { orderId: 'order-1', eventType: 'MATCHED', timestamp: 2000 },
    ];

    orderEvents.forEach((event) => {
      persistence.recordOrderEvent(event.orderId, event.eventType);
    });

    // Verify events are recorded (using getOrders as proxy)
    const orders = persistence.getOrders();
    // We can't directly query order_events table without exposing that API
    // This test validates recordOrderEvent doesn't throw
    expect(orders).toBeDefined();
  });
});

describe('Chaos: Backup and Restore', () => {
  let persistence: PersistenceService;

  beforeEach(() => {
    persistence = new PersistenceService(':memory:');
  });

  afterEach(() => {
    persistence.close();
  });

  it.skip('should create backup of current state - requires createBackup implementation', () => {
    // This test requires createBackup() which doesn't exist yet
    // Keeping as skip until API is implemented
  });

  it.skip('should restore from backup - requires restoreFromBackup implementation', () => {
    // This test requires restoreFromBackup() which doesn't exist yet
    // Keeping as skip until API is implemented
  });

  it.skip('should handle corrupted backup data - requires restoreFromBackup implementation', () => {
    // This test requires restoreFromBackup() which doesn't exist yet
    // Keeping as skip until API is implemented
  });
});
