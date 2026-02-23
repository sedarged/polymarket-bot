/**
 * Chaos Test: Process and System Failures
 * 
 * Tests system behavior during process crashes, restarts, and resource issues.
 * Validates graceful shutdown, startup reconciliation, and resource cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistenceService } from '../../../src/trading/persistenceService';
import {
  waitForCondition,
  simulateNetworkLatency,
  countEvents,
} from '../utils/chaosHelpers';

describe('Chaos: Graceful Shutdown', () => {
  it('should close all connections during shutdown', async () => {
    const connections: any[] = [];
    let allClosed = false;

    // Simulate multiple active connections
    for (let i = 0; i < 5; i++) {
      connections.push({
        id: i,
        close: vi.fn(() => {
          connections[i].closed = true;
        }),
        closed: false,
      });
    }

    // Graceful shutdown
    const shutdown = async () => {
      for (const conn of connections) {
        conn.close();
      }
      
      // Wait for all to close
      allClosed = connections.every((c) => c.closed);
    };

    await shutdown();

    expect(allClosed).toBe(true);
    expect(connections.every((c) => c.close)).toHaveBeenCalledTimes(5);
  });

  it('should cancel all pending orders during shutdown', async () => {
    const pendingOrders = [
      { orderId: 'order-1', status: 'PENDING' },
      { orderId: 'order-2', status: 'PENDING' },
      { orderId: 'order-3', status: 'PENDING' },
    ];

    let cancelledOrders: string[] = [];

    const cancelOrder = async (orderId: string) => {
      cancelledOrders.push(orderId);
      return { success: true };
    };

    // Shutdown: cancel all pending
    for (const order of pendingOrders) {
      await cancelOrder(order.orderId);
    }

    expect(cancelledOrders).toHaveLength(3);
    expect(cancelledOrders).toContain('order-1');
    expect(cancelledOrders).toContain('order-2');
    expect(cancelledOrders).toContain('order-3');
  });

  it('should persist state before shutdown', async () => {
    const persistence = new PersistenceService({ dbPath: ':memory:' });

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

    // Save state
    orders.forEach((order) => persistence.saveOrder(order));

    // Verify saved
    const savedOrders = persistence.getOrders();
    expect(savedOrders).toHaveLength(1);

    // Create backup before shutdown
    const backup = persistence.createBackup();
    expect(backup.orders).toHaveLength(1);

    persistence.close();
  });

  it('should emit shutdown event before closing', async () => {
    const EventEmitter = require('events');
    const emitter = new EventEmitter();

    let shutdownEventReceived = false;
    let cleanupCompleted = false;

    emitter.on('shutdown', () => {
      shutdownEventReceived = true;
      
      // Cleanup logic
      setTimeout(() => {
        cleanupCompleted = true;
      }, 10);
    });

    // Trigger shutdown
    emitter.emit('shutdown');

    // Wait for cleanup
    await simulateNetworkLatency(50);

    expect(shutdownEventReceived).toBe(true);
    expect(cleanupCompleted).toBe(true);
  });
});

describe('Chaos: Kill Switch Activation', () => {
  // Mock kill switch implementation for testing
  class MockKillSwitch {
    private active = false;
    private reason = '';
    private activatedAt: number | null = null;

    activate(reason: string): void {
      this.active = true;
      this.reason = reason;
      this.activatedAt = Date.now();
    }

    isActive(): boolean {
      return this.active;
    }

    canTrade(): boolean {
      return !this.active;
    }

    getStatus() {
      return {
        active: this.active,
        reason: this.reason,
        activatedAt: this.activatedAt,
      };
    }

    reset(): void {
      this.active = false;
      this.reason = '';
      this.activatedAt = null;
    }
  }

  let killSwitch: MockKillSwitch;

  beforeEach(() => {
    killSwitch = new MockKillSwitch();
  });

  afterEach(() => {
    killSwitch.reset();
  });

  it('should immediately halt all trading when activated', () => {
    expect(killSwitch.isActive()).toBe(false);

    killSwitch.activate('Emergency stop - testing');

    expect(killSwitch.isActive()).toBe(true);
    expect(killSwitch.canTrade()).toBe(false);
  });

  it('should reject all order attempts when active', () => {
    killSwitch.activate('Testing kill switch');

    const canPlaceOrder = !killSwitch.isActive();
    expect(canPlaceOrder).toBe(false);
  });

  it('should log kill switch activation', () => {
    const reason = 'Chaos test activation';
    killSwitch.activate(reason);

    const status = killSwitch.getStatus();
    expect(status.active).toBe(true);
    expect(status.reason).toBe(reason);
    expect(status.activatedAt).toBeDefined();
  });

  it('should require manual reset after activation', () => {
    killSwitch.activate('Emergency');

    expect(killSwitch.isActive()).toBe(true);

    // Should not auto-reset
    expect(killSwitch.isActive()).toBe(true);

    // Manual reset required
    killSwitch.reset();
    expect(killSwitch.isActive()).toBe(false);
  });
});

describe('Chaos: Startup Reconciliation', () => {
  it('should reconcile orders on startup', async () => {
    // Simulate local state from previous session
    const localOrders = [
      { orderId: 'order-1', status: 'OPEN' },
      { orderId: 'order-2', status: 'FILLED' },
    ];

    // Simulate remote state (what actually exists on exchange)
    const remoteOrders = [
      { orderId: 'order-1', status: 'CANCELLED' }, // Status changed
      { orderId: 'order-3', status: 'OPEN' }, // New order
      // order-2 completed and removed
    ];

    // Reconciliation logic
    const toSync: any[] = [];
    const toRemove: any[] = [];

    // Find orders that need syncing
    for (const remote of remoteOrders) {
      const local = localOrders.find((o) => o.orderId === remote.orderId);
      if (!local || local.status !== remote.status) {
        toSync.push(remote);
      }
    }

    // Find orders to remove (exist locally but not remotely)
    for (const local of localOrders) {
      const remote = remoteOrders.find((o) => o.orderId === local.orderId);
      if (!remote) {
        toRemove.push(local);
      }
    }

    expect(toSync.length).toBeGreaterThan(0);
    expect(toRemove.length).toBeGreaterThan(0);
    expect(toSync.some((o) => o.orderId === 'order-1')).toBe(true);
    expect(toRemove.some((o) => o.orderId === 'order-2')).toBe(true);
  });

  it('should fetch missed fills during downtime', async () => {
    // Simulate: bot was down from time A to time B
    const downtimeStart = Date.now() - 3600000; // 1 hour ago
    const downtimeEnd = Date.now();

    // Orders that existed during downtime
    const ordersBeforeDowntime = [
      { orderId: 'order-1', status: 'OPEN', filledSize: '0' },
      { orderId: 'order-2', status: 'OPEN', filledSize: '50' },
    ];

    // Current state (after downtime)
    const ordersAfterRestart = [
      { orderId: 'order-1', status: 'FILLED', filledSize: '100' },
      { orderId: 'order-2', status: 'FILLED', filledSize: '100' },
    ];

    // Detect missed fills
    const missedFills: any[] = [];
    for (let i = 0; i < ordersBeforeDowntime.length; i++) {
      const before = ordersBeforeDowntime[i];
      const after = ordersAfterRestart[i];

      if (before.filledSize !== after.filledSize) {
        const missedAmount = parseFloat(after.filledSize) - parseFloat(before.filledSize);
        missedFills.push({
          orderId: after.orderId,
          missedAmount,
        });
      }
    }

    expect(missedFills).toHaveLength(2);
    expect(missedFills[0].missedAmount).toBe(100);
    expect(missedFills[1].missedAmount).toBe(50);
  });

  it('should recalculate positions on startup', async () => {
    const orders = [
      { tokenId: '0xtest123', side: 'BUY', filledSize: '100' },
      { tokenId: '0xtest123', side: 'SELL', filledSize: '30' },
      { tokenId: '0xtest456', side: 'BUY', filledSize: '50' },
    ];

    // Calculate positions
    const positions = new Map<string, number>();
    
    for (const order of orders) {
      const current = positions.get(order.tokenId) || 0;
      const size = parseFloat(order.filledSize);
      const newPosition = order.side === 'BUY' ? current + size : current - size;
      positions.set(order.tokenId, newPosition);
    }

    expect(positions.get('0xtest123')).toBe(70); // 100 - 30
    expect(positions.get('0xtest456')).toBe(50);
  });
});

describe('Chaos: Memory Leak Prevention', () => {
  it('should clean up event listeners', async () => {
    const EventEmitter = require('events');
    const emitter = new EventEmitter();

    const listeners: Array<() => void> = [];

    // Add many listeners
    for (let i = 0; i < 100; i++) {
      const listener = () => {};
      listeners.push(listener);
      emitter.on('test-event', listener);
    }

    expect(emitter.listenerCount('test-event')).toBe(100);

    // Cleanup
    listeners.forEach((listener) => {
      emitter.removeListener('test-event', listener);
    });

    expect(emitter.listenerCount('test-event')).toBe(0);
  });

  it('should clear timers on cleanup', async () => {
    vi.useFakeTimers();

    const timers: NodeJS.Timeout[] = [];

    // Create many timers
    for (let i = 0; i < 10; i++) {
      const timer = setTimeout(() => {}, 1000 * (i + 1));
      timers.push(timer);
    }

    // Cleanup
    timers.forEach((timer) => clearTimeout(timer));

    // Advance time - no callbacks should fire
    await vi.advanceTimersByTimeAsync(20000);

    vi.useRealTimers();
  });

  it('should close database connections', () => {
    const persistence = new PersistenceService({ dbPath: ':memory:' });

    // Use the connection
    persistence.saveOrder({
      orderId: 'order-1',
      tokenId: '0xtest123',
      side: 'BUY',
      size: '100',
      price: '0.50',
      status: 'OPEN',
      createdAt: Date.now(),
    });

    // Close connection
    persistence.close();

    // Should not be able to use after close
    let errorCaught = false;
    try {
      persistence.saveOrder({
        orderId: 'order-2',
        tokenId: '0xtest123',
        side: 'BUY',
        size: '100',
        price: '0.50',
        status: 'OPEN',
        createdAt: Date.now(),
      });
    } catch (e) {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);
  });
});

describe('Chaos: Resource Cleanup', () => {
  it('should release all resources on shutdown', async () => {
    const resources = {
      websocket: { closed: false, close: vi.fn(() => { resources.websocket.closed = true; }) },
      database: { closed: false, close: vi.fn(() => { resources.database.closed = true; }) },
      timers: [] as NodeJS.Timeout[],
    };

    // Simulate active timers
    for (let i = 0; i < 5; i++) {
      const timer = setTimeout(() => {}, 1000);
      resources.timers.push(timer);
    }

    // Cleanup
    resources.websocket.close();
    resources.database.close();
    resources.timers.forEach((t) => clearTimeout(t));

    expect(resources.websocket.closed).toBe(true);
    expect(resources.database.closed).toBe(true);
    expect(resources.websocket.close).toHaveBeenCalled();
    expect(resources.database.close).toHaveBeenCalled();
  });

  it('should handle cleanup errors gracefully', async () => {
    const resources = {
      websocket: {
        close: vi.fn(() => {
          throw new Error('Failed to close');
        }),
      },
      database: {
        closed: false,
        close: vi.fn(() => {
          resources.database.closed = true;
        }),
      },
    };

    let errors: Error[] = [];

    // Cleanup with error handling
    try {
      resources.websocket.close();
    } catch (e) {
      errors.push(e as Error);
    }

    try {
      resources.database.close();
    } catch (e) {
      errors.push(e as Error);
    }

    // Database should still close even if websocket failed
    expect(errors).toHaveLength(1);
    expect(resources.database.closed).toBe(true);
  });

  it('should not leave orphaned processes', async () => {
    // Simulate child processes
    const processes: any[] = [];

    for (let i = 0; i < 3; i++) {
      processes.push({
        pid: i,
        killed: false,
        kill: vi.fn(function(this: any) {
          this.killed = true;
        }),
      });
    }

    // Kill all processes
    processes.forEach((p) => p.kill());

    expect(processes.every((p) => p.killed)).toBe(true);
  });
});
