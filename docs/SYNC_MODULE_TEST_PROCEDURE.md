# Market Synchronization Module - Manual Test Procedure

**Document Version**: 1.0  
**Created**: 2026-02-18  
**Purpose**: Manual testing guide for the Market Synchronization Module (GAP-004)

## Overview

This document provides step-by-step procedures for manually testing and verifying the Market Synchronization Module. The module ensures local bot state remains consistent with remote market data through periodic reconciliation and automated recovery.

## Prerequisites

Before testing, ensure you have:

- [ ] Bot running with access to test environment
- [ ] Valid API credentials configured
- [ ] Database initialized (for state persistence)
- [ ] Logging enabled at INFO or DEBUG level
- [ ] Access to log files or console output

## Test Scenarios

### Test 1: Basic Sync Cycle

**Objective**: Verify the sync manager executes periodic sync cycles successfully.

**Steps**:
1. Start the sync manager with a short interval (e.g., 30 seconds for testing)
2. Monitor logs for sync cycle messages
3. Verify sync completes without errors

**Expected Log Output**:
```
[system] Starting sync cycle
[system] Discrepancies detected { count: 0, byType: {}, bySeverity: {} }
[system] Sync cycle completed { durationMs: 124, discrepancies: 0, recoveryActions: 0 }
```

**Success Criteria**:
- ✅ Sync cycle starts automatically
- ✅ No errors or exceptions logged
- ✅ Sync completes within reasonable time (< 5 seconds typically)
- ✅ Statistics updated (check via API or logs)

---

### Test 2: Order Discrepancy Detection

**Objective**: Verify detection of orders that exist remotely but not locally.

**Steps**:
1. Clear local order state
2. Create an order via API (bypassing local state)
3. Wait for next sync cycle or trigger manual sync
4. Check logs for discrepancy detection

**Expected Log Output**:
```
[system] Discrepancies detected { count: 1, byType: { EXTRA_ORDER: 1 }, bySeverity: { HIGH: 1 } }
[system] HIGH severity discrepancy detected {
  type: 'EXTRA_ORDER',
  severity: 'HIGH',
  description: 'Order order-123 exists remotely but not locally',
  metadata: { orderId: 'order-123', status: 'OPEN' }
}
[system] Recovery action {
  type: 'SYNC_ORDER',
  executed: true,
  success: true,
  description: 'Synced missing order from remote'
}
```

**Success Criteria**:
- ✅ Discrepancy detected as EXTRA_ORDER
- ✅ Severity classified as HIGH
- ✅ Recovery action executed (SYNC_ORDER)
- ✅ Recovery reported as successful

---

### Test 3: Balance Drift Detection

**Objective**: Verify detection of balance discrepancies beyond configured thresholds.

**Steps**:
1. Set initial balance state locally
2. Modify remote balance (simulate balance change)
3. Trigger sync cycle
4. Verify discrepancy detection

**Expected Log Output**:
```
[system] MEDIUM severity discrepancy detected {
  type: 'BALANCE_MISMATCH',
  severity: 'MEDIUM',
  description: 'Balance mismatch for token USDC: local=1000, remote=950 (diff: 50.00, 5.00%)',
  metadata: {
    tokenId: 'USDC',
    localAmount: '1000',
    remoteAmount: '950',
    difference: '50.00',
    percentDiff: '5.00'
  }
}
```

**Success Criteria**:
- ✅ Discrepancy detected when difference exceeds thresholds
- ✅ Severity appropriate to difference magnitude
- ✅ Recovery action proposed (UPDATE_BALANCE)
- ✅ No discrepancy when difference below thresholds

---

### Test 4: Stale Orderbook Detection

**Objective**: Verify detection of orderbooks that haven't updated recently.

**Steps**:
1. Subscribe to orderbook feed
2. Simulate WebSocket disconnect (pause updates)
3. Wait for orderbook to become stale (> 30 seconds by default)
4. Trigger sync cycle

**Expected Log Output**:
```
[system] MEDIUM severity discrepancy detected {
  type: 'ORDERBOOK_STALE',
  severity: 'MEDIUM',
  description: 'Orderbook for token token-123 is stale (age: 45.2s)',
  metadata: {
    tokenId: 'token-123',
    orderbookTimestamp: 1708278901234,
    ageMs: 45200,
    ageSeconds: '45.2'
  }
}
[system] Recovery action {
  type: 'RESYNC_ORDERBOOK',
  executed: true,
  success: true,
  description: 'Triggered orderbook resync'
}
```

**Success Criteria**:
- ✅ Stale orderbook detected after threshold
- ✅ Age calculated correctly
- ✅ Recovery action triggers resync
- ✅ Fresh orderbooks not flagged

---

### Test 5: Position Mismatch Detection

**Objective**: Verify detection of position size differences.

**Steps**:
1. Create a position locally
2. Modify remote position size (simulate fill)
3. Trigger sync cycle
4. Verify discrepancy and recovery

**Expected Log Output**:
```
[system] HIGH severity discrepancy detected {
  type: 'POSITION_MISMATCH',
  severity: 'HIGH',
  description: 'Position size mismatch for token token-123: local=100, remote=150',
  metadata: {
    tokenId: 'token-123',
    localSize: '100',
    remoteSize: '150',
    difference: '-50'
  }
}
[system] Recovery action {
  type: 'UPDATE_POSITION',
  executed: true,
  success: true,
  description: 'Updated position from remote data'
}
```

**Success Criteria**:
- ✅ Position mismatch detected
- ✅ Difference calculated correctly
- ✅ Severity appropriate (HIGH for position drift)
- ✅ Recovery updates local position

---

### Test 6: Missed Fill Detection

**Objective**: Verify detection of fills that occurred remotely during connection loss.

**Steps**:
1. Create and submit an order
2. Simulate WebSocket disconnect
3. Let order fill remotely (via test API)
4. Reconnect and trigger sync
5. Verify missed fill detection

**Expected Log Output**:
```
[system] HIGH severity discrepancy detected {
  type: 'MISSED_FILL',
  severity: 'HIGH',
  description: 'Fill fill-456 for order order-123 was missed locally',
  metadata: {
    fillId: 'fill-456',
    orderId: 'order-123',
    size: '50',
    price: '0.55'
  }
}
[system] Recovery action {
  type: 'FETCH_MISSED_FILLS',
  executed: true,
  success: true,
  description: 'Fetched and processed missed fill'
}
```

**Success Criteria**:
- ✅ Missed fill detected after reconnect
- ✅ Fill details captured in metadata
- ✅ Recovery fetches missing fill data
- ✅ Position updated after fill recovery

---

### Test 7: Recovery Attempt Limits

**Objective**: Verify max recovery attempts prevents infinite retry loops.

**Steps**:
1. Trigger a discrepancy that cannot be recovered
2. Let recovery attempt multiple times
3. Verify manual intervention flag after max attempts

**Expected Log Output**:
```
[system] Recovery action {
  type: 'MANUAL_INTERVENTION',
  executed: false,
  description: 'Max recovery attempts (3) exceeded for MISSING_ORDER'
}
[system] Max recovery attempts exceeded {
  discrepancyType: 'MISSING_ORDER',
  attempts: 3,
  maxAttempts: 3
}
```

**Success Criteria**:
- ✅ Recovery attempted up to max times
- ✅ Manual intervention flagged after limit
- ✅ No infinite retry loop
- ✅ Attempt counter resets after successful sync

---

### Test 8: Auto-Recovery Disabled

**Objective**: Verify behavior when auto-recovery is disabled via configuration.

**Steps**:
1. Set `AUTO_RECOVERY_ENABLED=false` in config
2. Trigger a discrepancy
3. Verify manual intervention required

**Expected Log Output**:
```
[system] Auto-recovery disabled, manual intervention required {
  discrepancyType: 'BALANCE_MISMATCH',
  severity: 'HIGH'
}
[system] Recovery action {
  type: 'MANUAL_INTERVENTION',
  executed: false,
  description: 'Auto-recovery disabled. Manual intervention required for BALANCE_MISMATCH'
}
```

**Success Criteria**:
- ✅ Discrepancies still detected
- ✅ No automated recovery executed
- ✅ Manual intervention flagged
- ✅ Discrepancies logged for review

---

### Test 9: State Snapshot Versioning

**Objective**: Verify state snapshots are created and maintained.

**Steps**:
1. Execute multiple sync cycles
2. Query sync manager for snapshots
3. Verify version numbers and timestamps

**API Query**:
```typescript
const snapshots = syncManager.getSnapshots(5);
console.log(snapshots.map(s => ({
  version: s.version,
  timestamp: s.timestamp,
  orders: s.orders.length,
  positions: s.positions.length
})));
```

**Expected Output**:
```json
[
  { "version": 1, "timestamp": 1708278900000, "orders": 2, "positions": 1 },
  { "version": 2, "timestamp": 1708278960000, "orders": 3, "positions": 1 },
  { "version": 3, "timestamp": 1708279020000, "orders": 3, "positions": 2 },
  { "version": 4, "timestamp": 1708279080000, "orders": 2, "positions": 2 },
  { "version": 5, "timestamp": 1708279140000, "orders": 2, "positions": 2 }
]
```

**Success Criteria**:
- ✅ Snapshots created each sync cycle
- ✅ Version numbers increment correctly
- ✅ Timestamps advance chronologically
- ✅ State data captured accurately
- ✅ Old snapshots pruned after limit (100 by default)

---

### Test 10: Sync Statistics Tracking

**Objective**: Verify statistics are tracked accurately.

**Steps**:
1. Execute multiple sync cycles (mix of success/failure)
2. Query sync statistics
3. Verify counts and averages

**API Query**:
```typescript
const stats = syncManager.getStats();
console.log(JSON.stringify(stats, null, 2));
```

**Expected Output**:
```json
{
  "totalSyncs": 10,
  "successfulSyncs": 9,
  "failedSyncs": 1,
  "totalDiscrepancies": 5,
  "discrepanciesByType": {
    "EXTRA_ORDER": 2,
    "BALANCE_MISMATCH": 2,
    "ORDERBOOK_STALE": 1
  },
  "totalRecoveryActions": 5,
  "successfulRecoveryActions": 5,
  "lastSyncTime": 1708279200000,
  "averageSyncDurationMs": 156.3
}
```

**Success Criteria**:
- ✅ Total syncs counted correctly
- ✅ Success/failure split accurate
- ✅ Discrepancies grouped by type
- ✅ Recovery actions tracked
- ✅ Average duration calculated
- ✅ Last sync timestamp updated

---

## Configuration Verification

### Test 11: Configuration Override

**Objective**: Verify configuration can be customized via environment variables.

**Steps**:
1. Set environment variables:
   ```bash
   export SYNC_INTERVAL_MS=60000
   export BALANCE_DRIFT_THRESHOLD_PERCENT=2.0
   export BALANCE_DRIFT_THRESHOLD_ABSOLUTE=20.0
   export ORDERBOOK_STALE_THRESHOLD_MS=60000
   export AUTO_RECOVERY_ENABLED=false
   export MAX_RECOVERY_ATTEMPTS=5
   ```
2. Start sync manager
3. Verify configuration loaded correctly

**Expected Log Output**:
```
[system] Starting SyncManager {
  syncIntervalMs: 60000,
  autoRecoveryEnabled: false
}
```

**Success Criteria**:
- ✅ Environment variables override defaults
- ✅ Sync interval respected
- ✅ Thresholds applied correctly
- ✅ Feature flags work as expected

---

## Performance Testing

### Test 12: Large State Sync

**Objective**: Verify sync performance with large state volumes.

**Steps**:
1. Create 100+ orders locally and remotely
2. Trigger sync cycle
3. Measure sync duration
4. Check memory usage

**Performance Targets**:
- Sync duration: < 2 seconds for 100 orders
- Memory increase: < 50MB per sync
- No memory leaks over 1000+ cycles

**Success Criteria**:
- ✅ Sync completes within target time
- ✅ Memory usage reasonable
- ✅ No degradation over time
- ✅ No crashes or exceptions

---

## Troubleshooting Guide

### Sync Not Running
- Check if `syncManager.isActive()` returns `true`
- Verify `start()` was called
- Check for timer initialization errors in logs

### No Discrepancies Detected
- Verify local and remote states actually differ
- Check if feature flags are enabled
- Confirm thresholds aren't too high

### Recovery Actions Failing
- Check if auto-recovery is enabled
- Verify not exceeding max attempts
- Review error messages in logs
- Check network connectivity to APIs

### High Memory Usage
- Verify snapshot pruning is working
- Check for memory leaks in recovery procedures
- Monitor snapshot count (should cap at 100)

---

## Sign-Off Checklist

After completing all tests, verify:

- [ ] All 12 test scenarios pass
- [ ] Logs are comprehensive and clear
- [ ] No errors or exceptions during normal operation
- [ ] Configuration overrides work correctly
- [ ] Performance targets met
- [ ] Memory usage stable over time
- [ ] Documentation accurately reflects behavior
- [ ] Recovery procedures work as designed
- [ ] Statistics tracking is accurate
- [ ] State snapshots maintained correctly

---

## Notes

**Test Environment**: Record environment details here (dev/staging/prod)  
**Tester**: Name and date  
**Issues Found**: Document any issues discovered during testing  
**Follow-up Actions**: List any required fixes or improvements

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-18 | System | Initial version |
