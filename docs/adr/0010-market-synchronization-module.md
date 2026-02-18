# ADR-0010: Market Synchronization Module

**Status**: Accepted  
**Date**: 2026-02-18  
**Deciders**: Development Team  
**Related Issues**: GAP-004

## Context

The Polymarket trading bot maintains local state (orders, fills, positions, balances, orderbooks) that must stay synchronized with remote on-chain and off-chain data sources. State drift can occur due to:

1. **WebSocket Connection Loss**: Missed market updates during disconnections
2. **Network Failures**: API calls failing silently or timing out
3. **Race Conditions**: Concurrent updates from multiple data sources
4. **Clock Skew**: Timestamp mismatches between local and remote systems
5. **Partial Fill Handling**: Complex order lifecycle with multiple fill events
6. **External Actions**: Orders placed via web UI or other clients

Without proper synchronization, the bot risks:
- Trading on stale data
- Position miscalculation leading to over-leverage
- Balance discrepancies blocking order placement
- Missing fills and incorrect PnL calculations
- Orphaned orders that never complete

We need a dedicated module to detect and recover from state inconsistencies while maintaining comprehensive audit logs.

## Decision

We will implement a **Market Synchronization Module** with three core components:

### 1. SyncManager (Orchestrator)

**Responsibilities**:
- Schedule and execute periodic sync cycles (default: 5 minutes)
- Coordinate discrepancy detection across all data types
- Execute recovery procedures for detected issues
- Maintain state snapshots for audit trail (versioned, prunable)
- Track sync statistics and performance metrics

**Design Choices**:
- **Event-driven**: Can be triggered manually, on schedule, or on reconnection
- **Stateful**: Maintains sync history and attempt counters
- **Configurable**: All intervals and thresholds tunable via environment variables
- **Non-blocking**: Sync failures don't block trading (graceful degradation)

### 2. DiscrepancyDetector (Analysis)

**Responsibilities**:
- Compare local vs remote state across multiple dimensions
- Classify discrepancies by type (missing/extra orders, position drift, etc.)
- Assign severity levels (LOW, MEDIUM, HIGH, CRITICAL)
- Provide detailed metadata for debugging

**Discrepancy Types**:
- `MISSING_ORDER`: Exists locally but not remotely (orphan)
- `EXTRA_ORDER`: Exists remotely but not locally (missed sync)
- `ORDER_STATUS_MISMATCH`: Status differs between local and remote
- `POSITION_MISMATCH`: Position size/value discrepancy
- `BALANCE_MISMATCH`: Balance drift beyond configured thresholds
- `ORDERBOOK_STALE`: Orderbook not updated recently
- `MISSED_FILL`: Fill occurred remotely but not recorded locally

**Severity Logic**:
- **CRITICAL**: Balance drift >10% or >$1000, open order status mismatch
- **HIGH**: Position mismatch, missed fills, extra orders
- **MEDIUM**: Balance drift >1%, orderbook stale >2 minutes
- **LOW**: Closed order status mismatch, orderbook stale <2 minutes

### 3. RecoveryProcedures (Resolution)

**Responsibilities**:
- Determine appropriate recovery action for each discrepancy type
- Execute automated recovery procedures (when enabled)
- Track recovery attempts and enforce attempt limits
- Flag issues requiring manual intervention

**Recovery Actions**:
- `SYNC_ORDER`: Add/update order from remote source
- `CANCEL_ORPHAN_ORDER`: Remove local order not on remote
- `UPDATE_POSITION`: Recalculate position from fills
- `UPDATE_BALANCE`: Refresh balance from CLOB API
- `RESYNC_ORDERBOOK`: Re-fetch orderbook via REST
- `FETCH_MISSED_FILLS`: Query Data API for missing fills
- `MANUAL_INTERVENTION`: Flag for human review

**Safety Mechanisms**:
- Max recovery attempts (default: 3) per discrepancy
- Circuit breaker for repeated failures
- Auto-recovery can be disabled globally
- All actions logged with full context

## Rationale

### Why Not Just Rely on WebSocket Reconnection?

WebSocket reconnection handles connection loss but doesn't verify data consistency. The sync module provides:
- **Defense in depth**: Catches issues reconnection misses
- **Proactive detection**: Finds drift before it causes problems
- **Comprehensive coverage**: Checks all state dimensions, not just active subscriptions
- **Audit trail**: Documents what went wrong and how it was fixed

### Why Periodic Instead of Real-time?

Periodic sync (5 minutes) balances:
- **Cost**: API calls, database queries, computation
- **Latency**: State drift acceptable for 5 minutes in most cases
- **Complexity**: Real-time sync requires event sourcing and CQRS
- **Reliability**: Simpler design is more robust

For time-critical data (orderbooks), WebSocket handles real-time updates.

### Why Automated Recovery?

Manual recovery for every discrepancy doesn't scale:
- **Developer time**: Would require constant monitoring
- **Response time**: Hours or days vs. seconds
- **Consistency**: Automated logic is deterministic

Safety measures prevent runaway automation:
- Attempt limits
- Manual intervention escalation
- Global disable switch
- Comprehensive logging

### Why State Snapshots?

Versioned snapshots enable:
- **Debugging**: "What did the state look like at 10:15?"
- **Audit compliance**: Regulatory requirements for trade reconstruction
- **Rollback**: Manual recovery to known-good state
- **Trending**: Detect patterns in state drift over time

Pruning (keep last 100) prevents unbounded growth.

### Why Severity Levels?

Severity guides response urgency:
- **CRITICAL**: Halt trading, alert operators immediately
- **HIGH**: Automated recovery with aggressive retry
- **MEDIUM**: Standard recovery, log for review
- **LOW**: Best-effort recovery, don't block trading

## Alternatives Considered

### 1. Event Sourcing with CQRS

**Pros**: Perfect consistency, full audit trail, time travel debugging  
**Cons**: High complexity, requires architectural overhaul, overkill for current scale  
**Decision**: Too complex for current needs, revisit if consistency issues persist

### 2. Real-time Stream Processing (Kafka/Redis Streams)

**Pros**: Immediate consistency, handles high throughput  
**Cons**: Additional infrastructure, operational overhead, cost  
**Decision**: Not justified by current data volumes (<100 orders/day)

### 3. Distributed Consensus (Raft/Paxos)

**Pros**: Strong consistency guarantees  
**Cons**: Single bot doesn't need distributed consensus, massive overkill  
**Decision**: Not applicable to single-instance architecture

### 4. Manual Reconciliation Only

**Pros**: Simple, no automation risks  
**Cons**: Doesn't scale, slow response, human error prone  
**Decision**: Unacceptable for production system

## Implementation Details

### Configuration

```typescript
interface SyncConfig {
  syncIntervalMs: number;                  // Default: 300000 (5 min)
  balanceDriftThresholdPercent: number;    // Default: 1.0 (1%)
  balanceDriftThresholdAbsolute: number;   // Default: 10.0 ($10)
  orderbookStaleThresholdMs: number;       // Default: 30000 (30s)
  autoRecoveryEnabled: boolean;            // Default: true
  maxRecoveryAttempts: number;             // Default: 3
  syncOrdersEnabled: boolean;              // Default: true
  syncPositionsEnabled: boolean;           // Default: true
  syncBalancesEnabled: boolean;            // Default: true
  syncOrderbooksEnabled: boolean;          // Default: true
}
```

### Integration Points

1. **TradingClient**: Source of local orders, fills, positions, balances
2. **MarketFeedClient**: Source of orderbook data
3. **DataApiClient**: Source of remote positions, trades, activity
4. **ClobClient**: Source of remote open orders, balances
5. **Logger**: Comprehensive logging to system category
6. **Metrics** (Future): Prometheus metrics for monitoring

### Startup Sequence

```
1. TradingClient initializes
2. TradingClient performs startup reconciliation (existing)
3. SyncManager created with configuration
4. SyncManager.start() begins periodic sync
5. Initial sync verifies startup reconciliation
```

### Sync Cycle Flow

```
1. Fetch remote state from all sources (parallel)
2. Create state snapshot (versioned)
3. Detect discrepancies across all dimensions
4. Log all discrepancies with severity
5. Execute recovery procedures for each discrepancy
6. Update statistics and metrics
7. Log sync completion with summary
```

## Consequences

### Positive

- **Reliability**: Catches state drift that reconnection misses
- **Auditability**: Complete log of what changed and why
- **Observability**: Clear metrics on sync health
- **Safety**: Automated recovery with human oversight fallback
- **Maintainability**: Modular design, easy to extend
- **Testability**: Each component independently testable

### Negative

- **Complexity**: Additional code to maintain
- **API Load**: Periodic fetching increases API call count
- **Latency**: 5-minute drift window acceptable but not immediate
- **Storage**: State snapshots consume memory/disk
- **False Positives**: May flag legitimate temporary inconsistencies

### Mitigation

- **API Load**: Configurable sync interval, can increase if needed
- **Latency**: Critical updates handled by WebSocket real-time
- **Storage**: Snapshot pruning, configurable retention
- **False Positives**: Severity levels prevent overreaction

## Monitoring

Key metrics to track:
- Sync success rate (target: >99%)
- Average sync duration (target: <2s)
- Discrepancy rate by type (trend over time)
- Recovery success rate (target: >95%)
- Manual intervention rate (target: <1%)

Alerts:
- Consecutive sync failures (>3)
- CRITICAL discrepancies detected
- Recovery failure rate >10%
- Sync duration >10s

## Future Enhancements

1. **Prometheus Metrics**: Expose sync stats for Grafana dashboards
2. **Webhook Notifications**: Alert external systems on CRITICAL discrepancies
3. **Smart Intervals**: Adjust sync frequency based on trading activity
4. **Conflict Resolution**: Sophisticated logic for ambiguous cases
5. **State Replication**: Multi-instance sync coordination
6. **Machine Learning**: Predict and prevent discrepancies

## References

- [GAP-004 Issue](../../REPORTS/GAP_ANALYSIS.md) - Original gap analysis
- [Manual Test Procedure](../SYNC_MODULE_TEST_PROCEDURE.md) - Testing guide
- [Trading Client Reconciliation](../../apps/backend/src/clients/tradingClient.ts) - Existing reconciliation logic
- [WebSocket Resync](./0007-websocket-resync-race-fix.md) - Related resync logic

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-18 | System | Initial ADR |
