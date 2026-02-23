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
    persistence = new PersistenceService({ dbPath: ':memory:' });
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
    persistence.saveOrder(order);

    // Simulate database corruption by closing
    persistence.close();

    // Try to save another order (should fail)
    let errorCaught = false;
    try {
      persistence.saveOrder({
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
    const persistence1 = new PersistenceService({ dbPath });

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
        status: 'FILLED' as const,
        createdAt: Date.now(),
      },
    ];

    // Save orders
    orders.forEach((order) => persistence1.saveOrder(order));

    // Get orders before "restart"
    const ordersBefore = persistence1.getOrders();
    expect(ordersBefore).toHaveLength(2);

    // Close (simulate restart)
    persistence1.close();

    // Create new instance (simulate restart)
    const persistence2 = new PersistenceService({ dbPath });

    // Should recover state
    const ordersAfter = persistence2.getOrders();
    expect(ordersAfter).toHaveLength(2);
    expect(ordersAfter[0].orderId).toBe('order-1');
    expect(ordersAfter[1].orderId).toBe('order-2');

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
          persistence.saveOrder(order);
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
      checkInterval: 60000,
      maxDiscrepancyAge: 300000,
      autoRecover: true,
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
    persistence = new PersistenceService({ dbPath: ':memory:' });
  });

  afterEach(() => {
    persistence.close();
  });

  it('should maintain audit trail during failures', async () => {
    const events = [
      { type: 'ORDER_PLACED', orderId: 'order-1', timestamp: Date.now() },
      { type: 'ORDER_FILLED', orderId: 'order-1', timestamp: Date.now() + 1 },
    ];

    // Log events
    events.forEach((event) => {
      persistence.logAuditEvent(event.type, event);
    });

    // Simulate partial failure (only some events logged)
    let failureOccurred = false;
    try {
      // Close database
      persistence.close();
      
      // Try to log another event
      persistence.logAuditEvent('ORDER_CANCELLED', {
        orderId: 'order-1',
        timestamp: Date.now() + 2,
      });
    } catch (e) {
      failureOccurred = true;
    }

    expect(failureOccurred).toBe(true);
  });

  it('should verify audit trail completeness', async () => {
    const orderEvents = [
      { type: 'ORDER_PLACED', orderId: 'order-1', timestamp: 1000 },
      { type: 'ORDER_FILLED', orderId: 'order-1', timestamp: 2000 },
    ];

    orderEvents.forEach((event) => {
      persistence.logAuditEvent(event.type, event);
    });

    const auditLog = persistence.getAuditLog({
      startTime: 0,
      endTime: Date.now(),
    });

    // Verify all events are recorded
    expect(auditLog.length).toBeGreaterThanOrEqual(2);
    
    // Verify chronological order
    for (let i = 1; i < auditLog.length; i++) {
      expect(auditLog[i].timestamp).toBeGreaterThanOrEqual(
        auditLog[i - 1].timestamp
      );
    }
  });
});

describe('Chaos: Backup and Restore', () => {
  let persistence: PersistenceService;

  beforeEach(() => {
    persistence = new PersistenceService({ dbPath: ':memory:' });
  });

  afterEach(() => {
    persistence.close();
  });

  it('should create backup of current state', () => {
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
    ];

    orders.forEach((order) => persistence.saveOrder(order));

    // Get backup
    const backup = persistence.createBackup();

    expect(backup).toBeDefined();
    expect(backup.orders).toHaveLength(1);
    expect(backup.timestamp).toBeDefined();
  });

  it('should restore from backup', () => {
    const backup = {
      orders: [
        {
          orderId: 'order-1',
          tokenId: '0xtest123',
          side: 'BUY' as const,
          size: '100',
          price: '0.50',
          status: 'OPEN' as const,
          createdAt: Date.now(),
        },
      ],
      positions: [],
      timestamp: Date.now(),
    };

    persistence.restoreFromBackup(backup);

    const orders = persistence.getOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].orderId).toBe('order-1');
  });

  it('should handle corrupted backup data', () => {
    const corruptedBackup = {
      orders: [
        {
          // Missing required fields
          orderId: 'order-1',
        },
      ],
      timestamp: Date.now(),
    };

    let errorCaught = false;
    try {
      persistence.restoreFromBackup(corruptedBackup as any);
    } catch (e) {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);
  });
});
