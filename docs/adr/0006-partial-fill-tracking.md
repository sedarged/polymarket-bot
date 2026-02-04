# ADR-0006: Partial Fill Tracking and Order State Management

**Status:** Accepted

**Date:** 2026-02-04

**Context:** EE-001 Gap Analysis

## Problem Statement

The trading system needs robust partial fill tracking to handle real-world CLOB trading where orders are frequently filled incrementally rather than all at once. Without proper partial fill tracking:

- Positions may be calculated incorrectly
- Orders that are partially filled may be lost or mismanaged
- Reconciliation cannot detect missed fills
- Financial accounting becomes unreliable
- Risk management operates on stale data

This addresses audit gap **EE-001** from REPORTS/GAP_ANALYSIS.md.

## Decision

We implement comprehensive partial fill tracking with the following components:

### 1. Order State Model Enhancement

**Order Status States:**
- `OPEN`: Order placed but no fills yet
- `PARTIALLY_FILLED`: Order has received at least one partial fill but not fully filled
- `MATCHED`: Order is fully filled
- `CANCELLED`: Order was cancelled (may have partial fills)

**Order Fields:**
```typescript
interface Order {
  orderId: string;
  clientOrderId?: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'MATCHED' | 'CANCELLED';
  createdAt: number;
  filledSize?: string;      // Total filled so far
  remainingSize?: string;   // Size - filledSize
}
```

### 2. Fill Event Tracking

**Fill Interface:**
```typescript
interface Fill {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  timestamp: number;
  fee?: string;
  fillId?: string;          // Unique fill identifier
}
```

**Fill Event Handler:**
- `handleFill(fillEvent)`: Processes fill events from WebSocket or polling
- Updates order's `filledSize` and `remainingSize`
- Transitions order status based on fill amount
- Records fill in fills array
- Triggers position recalculation

### 3. Position Calculation

**Algorithm:**
- Process all orders with `status === 'MATCHED' || status === 'PARTIALLY_FILLED'`
- For each order, use `filledSize` to calculate position
- Track weighted average cost basis
- Handle partial position closes correctly
- Support multi-token positions

**Trade-off:**
- Uses order price for position calculation (not individual fill prices)
- Simpler implementation with acceptable accuracy
- Fill-level price tracking can be added later if needed

### 4. Reconciliation and Recovery

**Startup Reconciliation:**
- Fetch all open/matched orders from CLOB API
- Map to internal Order format with fill status
- Calculate positions from reconciled state

**Missed Fill Detection:**
- `updateOrderState(clobOrder)`: Compare local vs CLOB filled sizes
- If CLOB reports more filled: create synthetic fill for missed amount
- Log warning for investigation
- Update order state and recalculate positions

**Cross-Session Recovery:**
- Orders persist in CLOB even if bot restarts
- Reconciliation discovers orders from previous sessions
- Fills that occurred while offline are detected and recovered

### 5. State Transitions

```
        OPEN
         |
         | (first partial fill)
         v
   PARTIALLY_FILLED
         |
         | (more partial fills)
         v
   PARTIALLY_FILLED
         |
         | (final fill)
         v
      MATCHED

Any state can transition to CANCELLED
```

## Consequences

### Positive

1. **Accurate Position Tracking**: Positions reflect actual filled amounts, not just placed orders
2. **Robust Reconciliation**: System can detect and recover from missed fills
3. **Correct Accounting**: Financial calculations use actual filled sizes
4. **Better Risk Management**: Risk limits apply to actual positions, not pending orders
5. **Audit Trail**: Complete history of fills for compliance and debugging
6. **Multi-Step Fill Support**: Handles complex fill patterns correctly

### Negative

1. **Complexity**: More state to manage and more edge cases to handle
2. **Testing Burden**: Requires comprehensive tests for all fill scenarios
3. **Simplification Trade-off**: Uses order price instead of individual fill prices for position calculation
4. **State Synchronization**: Need to ensure local state stays in sync with CLOB

### Trade-offs

**Order Price vs Fill Price:**
- **Decision**: Use order price for position calculation
- **Rationale**: Simpler, good enough for limit orders at specific price
- **Limitation**: Not accurate for market orders or price-improved fills
- **Future**: Can be enhanced to track fill-level prices if needed

**Reconciliation Frequency:**
- **Decision**: Startup reconciliation + missed fill detection
- **Future**: Add periodic background reconciliation (EE-002)

## Implementation Notes

### Testing Strategy

Created comprehensive test suite (`partialFills.test.ts`) covering:
- Single and multi-step partial fills
- Position calculation with partials
- Cancellation of partially filled orders
- Missed fill detection during reconciliation
- Edge cases (zero fills, decreasing fills)

### Integration Points

1. **Paper Trading Engine**: Already supports partial fills via `partialFillRate` config
2. **Live Trading Client**: Now has `handleFill` and `updateOrderState` methods
3. **WebSocket**: Message types defined for user fill events (ready for implementation)
4. **Risk Manager**: Works with actual positions from filled amounts

### Performance Considerations

- Position recalculation runs on every fill (O(n) where n = orders)
- For high-frequency trading, may need to optimize
- Current implementation suitable for retail trading speeds

## Related Decisions

- **ADR-0001**: Initial architecture decisions
- **ADR-0004**: Kill switch persistence (interacts with order state)
- **Gap EE-001**: Partial fill tracking (REPORTS/GAP_ANALYSIS.md)
- **Gap EE-002**: Order status polling (future work)
- **Gap EE-003**: Order timeout handling (future work)

## References

- REPORTS/GAP_ANALYSIS.md (lines 236-271)
- Issue sedarged/polymarket-bot#132
- apps/backend/src/clients/tradingClient.ts
- apps/backend/src/trading/paperTradingEngine.ts
- apps/backend/tests/partialFills.test.ts
- packages/shared/src/index.ts (Order and Fill interfaces)
