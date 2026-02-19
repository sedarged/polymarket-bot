# ADR 0010: Pre-Trade Liquidity Validation

## Status

Accepted

## Context

Trading bots need to validate that sufficient market liquidity exists before placing orders to prevent:
- Failed order executions due to insufficient liquidity
- Partial fills that may not meet strategy requirements
- Poor execution quality (large slippage from expected prices)
- Wasted gas fees on orders that cannot fill

The system previously placed orders without checking orderbook depth, which could lead to:
1. Orders sitting unfilled in the book
2. Strategies making decisions based on expected fills that never occur
3. Increased exposure to market risk during unfilled order periods
4. Poor capital efficiency

## Decision

We will implement pre-trade liquidity validation through a dedicated `LiquidityValidator` module that:

### Core Functionality

1. **Checks available liquidity** across multiple price levels in the orderbook
2. **Compares order size** against available liquidity using a configurable multiplier
3. **Validates data freshness** to ensure orderbook data is not stale
4. **Fails safely** when orderbook data is missing or unreliable

### Architecture

```
ExecutionService
    ↓ (optional dependency)
LiquidityValidator
    ↓ (uses)
MarketFeedService → OrderbookCache
```

### Configuration Options

- `minLiquidityMultiplier`: Minimum liquidity as a multiple of order size (default: 1.0)
  - 1.0 = order size must not exceed available liquidity
  - 1.5 = available liquidity must be at least 1.5x order size
  - 2.0 = available liquidity must be at least 2x order size

- `maxPriceLevels`: Maximum price levels to aggregate (default: 10)
  - Prevents excessive computation for deep orderbooks
  - Balances accuracy with performance

- `maxOrderbookAgeMs`: Maximum age of orderbook data (default: 5000ms)
  - Aligned with orderbook cache TTL
  - Prevents trading on stale market data

### Integration Points

1. **ExecutionService** - Calls `checkLiquidity()` before placing orders
2. **MarketFeedService** - Provides real-time orderbook data
3. **OrderbookCache** - Stores orderbook snapshots with timestamps

### Behavior

- **BUY orders**: Check ASK side liquidity (sellers)
- **SELL orders**: Check BID side liquidity (buyers)
- **Multi-level aggregation**: Sums liquidity across price levels
- **Safe defaults**: Rejects orders when data is missing or stale
- **Optional feature**: Disabled when validator not provided to ExecutionService

## Consequences

### Positive

1. **Prevents failed executions** - Orders only placed when sufficient liquidity exists
2. **Improves fill quality** - Better execution by ensuring adequate depth
3. **Reduces wasted resources** - Avoids gas fees and API calls for unfillable orders
4. **Strategy reliability** - Strategies can rely on orders being executable
5. **Configurable strictness** - Liquidity multiplier allows tuning risk tolerance
6. **Performance efficient** - Checks cached data, adds minimal latency (<1ms)
7. **Backward compatible** - Optional feature, existing code unaffected

### Negative

1. **May reject valid orders** - Conservative thresholds could reject some executable orders
2. **Requires real-time data** - Depends on WebSocket market feed being connected
3. **Additional complexity** - New validation layer in execution path
4. **Configuration overhead** - Operators need to tune thresholds appropriately

### Trade-offs

- **Strictness vs Opportunity**: Higher multipliers reduce execution risk but may miss opportunities
- **Speed vs Safety**: Real-time checks add latency but prevent bad executions
- **Simplicity vs Control**: More configuration options provide control but require tuning

## Implementation Notes

### Error Handling

- Throws `InsufficientLiquidityError` with detailed context
- Logs all validation decisions with GAP-014 tag
- Provides clear rejection reasons for debugging

### Testing

- 37 unit tests covering all edge cases
- 10 integration tests with ExecutionService
- Tests include: missing data, stale data, insufficient liquidity, edge cases

### Metrics & Observability

- Debug logs for all liquidity checks
- Warning logs for rejections with context
- Includes: available vs required liquidity, best price, levels checked

### Security Considerations

- Input validation prevents malicious parameters
- Safe handling of malformed orderbook data
- No risk of infinite loops or excessive memory usage

## Alternatives Considered

### 1. No Validation

**Pros**: Simplest implementation, no additional latency
**Cons**: Risk of failed executions and poor fill quality

**Decision**: Rejected - Production trading requires reliability

### 2. Post-Order Validation

**Pros**: Simpler integration, checks actual order status
**Cons**: Order already submitted, resources wasted, harder to recover

**Decision**: Rejected - Pre-trade validation is more efficient

### 3. Hard-Coded Thresholds

**Pros**: Simpler configuration
**Cons**: Not flexible enough for different market conditions and strategies

**Decision**: Rejected - Configurability is essential for production use

### 4. External Liquidity Service

**Pros**: Centralized liquidity analysis, shared across services
**Cons**: Network latency, additional failure point, more complexity

**Decision**: Rejected - Local validation using cached data is faster and more reliable

## References

- [GAP-014] No pre-trade liquidity validation - Gap Analysis
- [EE-004] Medium priority execution efficiency gap
- [A-015] Cache staleness handling
- `OrderbookCache` implementation
- `MarketFeedService` WebSocket integration
- `ExecutionService` order execution flow

## Related Decisions

- [ADR-0007] Order Execution Service - Provides integration point
- [ADR-0008] WebSocket Message Deduplication - Ensures reliable orderbook data
- [A-015] Cache staleness - Aligns TTL with orderbook cache

## Future Enhancements

1. **Dynamic thresholds** - Adjust based on market volatility
2. **Predictive liquidity** - Use order flow to predict future liquidity
3. **Multi-market checks** - Validate liquidity across related markets
4. **Liquidity scoring** - Provide quality score rather than binary pass/fail
5. **Historical analysis** - Learn optimal thresholds from execution data
