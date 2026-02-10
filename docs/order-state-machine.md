# Order State Machine

This document describes the order lifecycle and state transitions in the Polymarket trading bot.

## Order States

| State | Description | Characteristics |
|-------|-------------|-----------------|
| `OPEN` | Order placed but not filled | `filledSize = 0`, `remainingSize = size` |
| `PARTIALLY_FILLED` | Order has at least one partial fill | `0 < filledSize < size`, `remainingSize > 0` |
| `MATCHED` | Order fully filled | `filledSize >= size`, `remainingSize = 0` |
| `CANCELLED` | Order cancelled (may have partial fills) | Can have any `filledSize` value |

## State Transition Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         Order Lifecycle                        │
└────────────────────────────────────────────────────────────────┘

                           createOrder()
                                 │
                                 ▼
                        ┌─────────────┐
              ┌─────────│    OPEN     │◄─────────┐
              │         │ (no fills)  │          │
              │         └─────────────┘          │
              │                │                 │
              │                │ handleFill()    │
              │                │ (partial)       │
              │                ▼                 │
              │         ┌─────────────┐          │
              │         │  PARTIALLY  │          │
              │    ┌───►│   FILLED    │◄────┐    │
              │    │    │ (0 < filled │     │    │
              │    │    │    < size)  │     │    │
              │    │    └─────────────┘     │    │
              │    │           │            │    │
              │    │           │ handleFill()    │
              │    │           │ (more partial)  │
              │    │           ▼            │    │
              │    └───────────┘            │    │
              │                             │    │
              │           handleFill()      │    │
              │           (final fill)      │    │
              │                │            │    │
              │                ▼            │    │
              │         ┌─────────────┐    │    │
              │         │   MATCHED   │    │    │
              │         │ (fully      │    │    │
              │         │  filled)    │    │    │
              │         └─────────────┘    │    │
              │                             │    │
              │  cancelOrder()              │    │
              └────────────────────────┬────┘    │
                                       │         │
                                       ▼         │
                                ┌─────────────┐ │
                                │  CANCELLED  │─┘
                                │ (can have   │
                                │  any fills) │
                                └─────────────┘
```

## State Transition Rules

### OPEN → PARTIALLY_FILLED
**Trigger:** `handleFill()` with `0 < fillSize < remainingSize`

**Updates:**
```typescript
order.filledSize += fillSize;
order.remainingSize -= fillSize;
order.status = 'PARTIALLY_FILLED';
```

### OPEN → MATCHED (direct full fill)
**Trigger:** `handleFill()` with `fillSize >= remainingSize`

**Updates:**
```typescript
order.filledSize = order.size;
order.remainingSize = '0';
order.status = 'MATCHED';
```

### PARTIALLY_FILLED → PARTIALLY_FILLED (more partials)
**Trigger:** `handleFill()` with `0 < fillSize < remainingSize`

**Updates:**
```typescript
order.filledSize += fillSize;
order.remainingSize -= fillSize;
// status stays PARTIALLY_FILLED
```

### PARTIALLY_FILLED → MATCHED
**Trigger:** `handleFill()` with `fillSize >= remainingSize`

**Updates:**
```typescript
order.filledSize = order.size;
order.remainingSize = '0';
order.status = 'MATCHED';
```

### Any State → CANCELLED
**Trigger:** `cancelOrder()` or `updateOrderState()` with CLOB status = CANCELLED

**Updates:**
```typescript
order.status = 'CANCELLED';
// filledSize and remainingSize preserved
```

## Fill Event Processing

### handleFill() Algorithm

```typescript
handleFill(fillEvent: {
  orderId: string;
  fillId?: string;
  price: string;
  size: string;
  fee?: string;
  timestamp?: number;
}): void {
  // 1. Find order
  const order = findOrder(fillEvent.orderId);
  if (!order) {
    log.warn('Unknown order');
    return;
  }

  // 2. Calculate new filled size
  const currentFilled = Number(order.filledSize || 0);
  const fillSize = Number(fillEvent.size);
  const newFilledSize = currentFilled + fillSize;
  const originalSize = Number(order.size);

  // 3. Update order state
  order.filledSize = String(newFilledSize);
  order.remainingSize = String(originalSize - newFilledSize);

  // 4. Update order status
  if (newFilledSize >= originalSize) {
    order.status = 'MATCHED';
  } else if (newFilledSize > 0) {
    order.status = 'PARTIALLY_FILLED';
  }

  // 5. Record fill
  fills.push({
    orderId: fillEvent.orderId,
    fillId: fillEvent.fillId,
    tokenId: order.tokenId,
    side: order.side,
    price: fillEvent.price,
    size: fillEvent.size,
    fee: fillEvent.fee,
    timestamp: fillEvent.timestamp || Date.now(),
  });

  // 6. Recalculate positions
  recalculatePositions();
}
```

## Reconciliation State Updates

### updateOrderState() - Missed Fill Detection

When reconciling with CLOB API:

```typescript
updateOrderState(clobOrder: ClobOrder): void {
  const localOrder = findOrder(clobOrder.id);
  const previousFilled = Number(localOrder?.filledSize || 0);
  const currentFilled = Number(clobOrder.sizeMatched || 0);

  if (currentFilled > previousFilled) {
    // Missed fill detected!
    const missedSize = currentFilled - previousFilled;
    
    // Create synthetic fill for missed amount
    handleFill({
      orderId: clobOrder.id,
      price: String(clobOrder.price),
      size: String(missedSize),
      timestamp: Date.now(),
    });
    
    log.warn('Detected missed fill', {
      orderId: clobOrder.id,
      previousFilled,
      currentFilled,
      missedSize,
    });
  } else {
    // Just update the state without creating fill
    localOrder.filledSize = String(currentFilled);
    localOrder.remainingSize = String(originalSize - currentFilled);
    localOrder.status = determineStatus(clobOrder);
  }
}
```

## Position Calculation

Positions are recalculated after every fill event:

```typescript
recalculatePositions(): void {
  // Process orders with fills in chronological order
  const ordersWithFills = orders
    .filter(o => 
      (o.status === 'MATCHED' || o.status === 'PARTIALLY_FILLED') &&
      Number(o.filledSize) > 0
    )
    .sort((a, b) => a.createdAt - b.createdAt);

  // Calculate net position per token
  for (const order of ordersWithFills) {
    const filledSize = Number(order.filledSize);
    const price = Number(order.price);
    const isBuy = order.side === 'BUY';

    // Update position with weighted average cost
    updatePosition(order.tokenId, filledSize, price, isBuy);
  }
}
```

## Edge Cases

### Cancel Partially Filled Order
- Order keeps its `filledSize` and `remainingSize`
- Position is calculated from `filledSize`
- `remainingSize` amount is not traded

### Multiple Fills in Quick Succession
- Each fill is processed sequentially
- State updates are atomic per fill
- Position recalculation after each fill

### Fill Size Exceeds Remaining
- Should not happen in practice
- If it does: cap at `originalSize`
- Log error for investigation

### Zero-Size Orders
- Edge case but handled gracefully
- `filledSize = 0` → `status = MATCHED` (0 >= 0)
- No position impact

### Decreasing Fill Size (Anomaly)
- Should never happen (fills are additive)
- If detected during reconciliation: don't create fill
- Update state but investigate anomaly

## Integration Points

### Paper Trading Engine
- Uses same state transitions
- Simulates partial fills based on `partialFillRate` config
- Fully compatible with state machine

### Live Trading Client
- Implements full state machine
- Handles real CLOB fill events
- Reconciliation detects missed transitions

### WebSocket Events (Future)
- Subscribe to user channel fill events
- Process fills in real-time
- Reduces need for polling reconciliation

### Risk Manager
- Reads positions calculated from filled amounts
- Position limits apply to actual (filled) positions
- Not affected by unfilled order amounts

## Testing

Comprehensive test coverage in `apps/backend/tests/unit/partialFills.test.ts`:

1. **Basic Transitions**: OPEN → PARTIALLY_FILLED → MATCHED
2. **Multi-Step Fills**: Multiple partial fills per order
3. **Position Calculation**: Correct positions with partial fills
4. **Cancellation**: Cancel partially filled orders
5. **Reconciliation**: Missed fill detection and recovery
6. **Edge Cases**: Zero fills, anomalies, cross-token positions

## Future Enhancements

1. **WebSocket Fill Subscription** (EE-002)
   - Real-time fill events
   - Reduce reconciliation latency

2. **Periodic Reconciliation** (EE-002)
   - Background job polling order status
   - Catch any missed events

3. **Order Timeouts** (EE-003)
   - Automatic cancellation of stale orders
   - Prevent stuck orders

4. **Fill-Level Price Tracking**
   - Track individual fill prices
   - More accurate position cost basis
   - Useful for market orders

## References

- `apps/backend/src/clients/tradingClient.ts` - Live implementation
- `apps/backend/src/trading/paperTradingEngine.ts` - Paper implementation
- `apps/backend/tests/unit/partialFills.test.ts` - Comprehensive tests
- `docs/adr/0006-partial-fill-tracking.md` - Architecture decision
- `REPORTS/GAP_ANALYSIS.md` - EE-001 gap description
