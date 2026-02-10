# Learning System Usage Guide

## Overview

The Learning System provides infrastructure for strategy experimentation, ML model training, and systematic improvement through:

1. **Event Store** - Append-only storage for market data, signals, and execution events
2. **Signal Catalog** - Versioned feature/signal definitions
3. **Backtest Engine** - Historical replay and strategy evaluation

All components operate in **paper trading only** mode with no live trading integration.

## Event Store

### Purpose

Captures immutable, timestamped events for:
- Market data (prices, orderbook snapshots)
- Strategy signals and decisions
- Execution outcomes (paper trading)
- Performance metrics
- Experiment results

### Usage

```typescript
import { EventStore, type MarketEvent } from './learning';

// Initialize event store
const eventStore = new EventStore({
  path: './data/events.db', // optional, defaults to data/events.db
});

// Write a market event
const marketEvent: MarketEvent = {
  marketStatus: 'open',
  bestBid: 0.48,
  bestAsk: 0.52,
  mid: 0.50,
  spread: 0.04,
  liquidity: 1000,
  tickSize: 0.01,
};

const eventId = eventStore.writeEvent(
  'MarketEvent',
  'market-123',        // market ID
  'websocket',         // source
  marketEvent,
  '2026-02-06T12:00:00.000Z' // optional timestamp
);

// Query events
const events = eventStore.queryEvents({
  startDate: '2026-02-06T00:00:00.000Z',
  endDate: '2026-02-06T23:59:59.000Z',
  marketId: 'market-123',
  eventType: 'MarketEvent',
  limit: 100,
});

// Get statistics
const stats = eventStore.getStats();
console.log(`Total events: ${stats.totalEvents}`);
console.log(`Events by type:`, stats.eventsByType);

// Close when done
eventStore.close();
```

### Event Types

**MarketEvent** - Price and liquidity snapshot
```typescript
{
  marketStatus: 'open' | 'closed' | 'resolved',
  bestBid: number,
  bestAsk: number,
  mid: number,
  spread: number,
  liquidity: number,
  orderBookSnapshotId?: string,
  tickSize: number
}
```

**SignalEvent** - Computed feature or indicator
```typescript
{
  signalId: string,
  signalName: string,
  signalValue: number | string | boolean,
  signalVersion: string,
  featureSetId: string,
  metadata: Record<string, unknown>
}
```

**StrategyDecisionEvent** - Trading decision with rationale
```typescript
{
  strategyId: string,
  strategyVersion: string,
  decisionId: string,
  action: 'place_order' | 'cancel_order' | 'hold',
  rationale: string,
  confidence: number, // 0..1
  inputs: Record<string, unknown>,
  constraints: Record<string, unknown>
}
```

**ExecutionOutcomeEvent** - Paper trading result
```typescript
{
  decisionId: string,
  simulatedOrderId: string,
  status: 'accepted' | 'rejected' | 'partial_fill' | 'filled',
  requested: { side, price, size },
  executed: { price, size },
  fees: number,
  latencyMs: number,
  rejectionReason?: string
}
```

### Partitioning

Events are automatically partitioned by `{marketId}_{date}` for efficient queries:
- Enables fast lookups by market and time range
- Supports retention policies (hot/cold storage)
- Optimizes historical replay performance

## Signal Catalog

### Purpose

Manages versioned signal/feature definitions for reproducible ML workflows:
- Enforces consistent signal definitions
- Tracks signal metadata (inputs, outputs, owner)
- Supports signal versioning (immutable once created)
- Enables feature lineage tracking

### Usage

```typescript
import { SignalCatalog } from './learning';

// Initialize catalog
const catalog = new SignalCatalog({
  path: './data/signals.db', // optional
});

// Register a signal definition
catalog.registerSignal({
  signalName: 'mid_price',
  description: 'Midpoint between best bid and ask',
  featureGroup: 'market',
  inputFields: ['bestBid', 'bestAsk'],
  outputType: 'number',
  version: '1.0.0',
  owner: 'system',
});

// Get specific version
const signal = catalog.getSignal('mid_price', '1.0.0');

// Get latest version
const latest = catalog.getLatestSignal('mid_price');

// List all versions
const versions = catalog.listSignalVersions('mid_price');

// Query signals
const marketSignals = catalog.querySignals({
  featureGroup: 'market',
});

// Get statistics
const stats = catalog.getStats();
console.log(`Total signals: ${stats.totalSignals}`);
console.log(`Total versions: ${stats.totalVersions}`);

// Close when done
catalog.close();
```

### Feature Groups

Signals are organized into feature groups:
- **market** - Price and market data (mid, spread, last trade)
- **liquidity** - Orderbook depth and liquidity indicators
- **volatility** - Price movement and variance metrics
- **strategy** - Strategy-specific features
- **risk** - Risk and position metrics

### Versioning

Signals are immutable once registered. To update a signal:
1. Register a new version with same `signalName`
2. Reference the new version in strategies
3. Old versions remain available for reproducibility

## Backtest Engine

### Purpose

Evaluates trading strategies using historical event replay:
- Deterministic replay of market events
- Configurable time ranges and markets
- Metrics computation (PnL, Sharpe, drawdown, win rate)
- Reproducible results with seeded randomness
- Backtest persistence for comparison

### Usage

```typescript
import { BacktestEngine, EventStore } from './learning';

// Initialize (requires event store)
const eventStore = new EventStore();
const engine = new BacktestEngine({
  path: './data/backtests.db', // optional
  eventStore,
});

// Run a backtest
const backtestId = await engine.runBacktest({
  strategyId: 'strategy-1',
  startDate: '2026-02-01T00:00:00.000Z',
  endDate: '2026-02-07T23:59:59.000Z',
  markets: ['market-1', 'market-2'],
  initialBalance: 10000,
  slippage: 0.01,
  feeRate: 0.002,
  seed: 12345, // optional, for reproducibility
});

// Get backtest result
const result = engine.getBacktest(backtestId);
console.log('Metrics:', result.metrics);
console.log('Total trades:', result.trades.length);

// List backtests for a strategy
const backtests = engine.listBacktests('strategy-1');

// Get statistics
const stats = engine.getStats();
console.log(`Total backtests: ${stats.totalBacktests}`);
console.log(`Completed: ${stats.completedBacktests}`);

// Close when done
engine.close();
eventStore.close();
```

### Metrics

Backtests compute standard performance metrics:

- **PnL** - Net profit/loss
- **Sharpe Ratio** - Risk-adjusted return
- **Max Drawdown** - Maximum peak-to-trough decline
- **Win Rate** - Percentage of profitable trades
- **Total Trades** - Number of completed trades
- **Avg Trade Size** - Average position size

### Reproducibility

For reproducible backtests:
1. Use the `seed` parameter for deterministic randomness
2. Reference specific signal versions (not "latest")
3. Store backtest config with results
4. Lock feature definitions in signal catalog

## Integration Patterns

### Capturing Market Data

```typescript
// In WebSocket handler
marketFeed.on('price_update', (update) => {
  const marketEvent: MarketEvent = {
    marketStatus: 'open',
    bestBid: update.bestBid,
    bestAsk: update.bestAsk,
    mid: (update.bestBid + update.bestAsk) / 2,
    spread: update.bestAsk - update.bestBid,
    liquidity: calculateLiquidity(update.orderbook),
    tickSize: 0.01,
  };

  eventStore.writeEvent(
    'MarketEvent',
    update.marketId,
    'websocket',
    marketEvent
  );
});
```

### Strategy Integration

```typescript
// Strategy generates signal
const signal: SignalEvent = {
  signalId: uuidv4(),
  signalName: 'mean_reversion_signal',
  signalValue: -0.75, // sell signal
  signalVersion: '2.1.0',
  featureSetId: 'feature-set-alpha',
  metadata: {
    confidence: 0.82,
    lookbackPeriod: '5m',
  },
};

eventStore.writeEvent('SignalEvent', marketId, 'strategy', signal);

// Strategy makes decision
const decision: StrategyDecisionEvent = {
  strategyId: 'mean-reversion-v1',
  strategyVersion: '1.0.0',
  decisionId: uuidv4(),
  action: 'place_order',
  rationale: 'Mean reversion signal triggered',
  confidence: 0.82,
  inputs: { signalValue: -0.75, volatility: 0.03 },
  constraints: { maxPositionSize: 100, riskLimit: 0.05 },
};

eventStore.writeEvent('StrategyDecisionEvent', marketId, 'strategy', decision);
```

### Paper Trading Integration

```typescript
// After paper trading execution
const outcome: ExecutionOutcomeEvent = {
  decisionId: decision.decisionId,
  simulatedOrderId: 'paper-order-123',
  status: 'filled',
  requested: { side: 'sell', price: 0.50, size: 50 },
  executed: { price: 0.498, size: 50 },
  fees: 0.0498, // 0.2% fee
  latencyMs: 150,
};

eventStore.writeEvent('ExecutionOutcomeEvent', marketId, 'simulation', outcome);
```

## Best Practices

### Event Store

1. **Write frequently** - Don't batch events, write as they occur
2. **Include context** - Use metadata fields for debugging
3. **Partition wisely** - Events auto-partition by market+date
4. **Query efficiently** - Use filters to limit result sets
5. **Monitor size** - Implement retention policies for old data

### Signal Catalog

1. **Version everything** - Always specify explicit versions
2. **Document signals** - Write clear descriptions
3. **Track ownership** - Set the `owner` field
4. **Test new versions** - Backtest before promoting
5. **Deprecate gracefully** - Keep old versions for reproducibility

### Backtesting

1. **Start small** - Test with short time ranges first
2. **Use seeds** - Enable reproducibility with deterministic randomness
3. **Compare results** - Run multiple backtests to validate
4. **Check data quality** - Ensure event store has sufficient data
5. **Validate metrics** - Sanity check PnL and trade counts

## Compliance & Safety

- **Paper trading only** - No live trading integration
- **No secrets** - Event store contains no credentials
- **Audit trail** - All events immutable and timestamped
- **Fail closed** - Missing configuration prevents execution

## Performance Considerations

### Event Store

- Uses SQLite with WAL mode for concurrent reads
- Partitioned by market+date for fast queries
- Indexes on time, market, and event type
- Typical write: < 1ms
- Typical query (1 day, 1 market): < 10ms

### Signal Catalog

- Lightweight in-memory cache possible
- Read-heavy workload
- Typical lookup: < 1ms

### Backtest Engine

- Performance depends on event count
- ~1000 events/second replay rate
- Parallel backtests supported (separate processes)
- Database stores results, not intermediate state

## Troubleshooting

### Event Store

**Issue:** Slow queries
- Check date range (narrow it down)
- Add indexes if needed
- Use pagination for large result sets

**Issue:** Disk space growing
- Implement retention policies
- Archive old partitions to cold storage
- Compress historical data

### Signal Catalog

**Issue:** Duplicate signal errors
- Check if signal+version already exists
- Increment version number
- Use `getLatestSignal()` to check current version

### Backtest Engine

**Issue:** Backtest takes too long
- Reduce time range
- Limit markets
- Check event density in date range

**Issue:** No trades in backtest
- Verify strategy logic
- Check market event availability
- Confirm slippage/fee parameters

## Examples

See `apps/backend/tests/unit/` and `apps/backend/tests/backtest/` for comprehensive examples:
- `eventStore.test.ts` - Event storage and querying
- `signalCatalog.test.ts` - Signal management
- `backtestEngine.test.ts` - Backtest execution

## Related Documentation

- [REPORTS/LEARNING_SYSTEM.md](../REPORTS/LEARNING_SYSTEM.md) - Complete design specification
- [docs/architecture.md](../docs/architecture.md) - System architecture
- [docs/paper-trading.md](../docs/paper-trading.md) - Paper trading guide
