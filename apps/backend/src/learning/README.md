# Learning System Module

Core infrastructure for strategy experimentation, ML model training, and systematic improvement.

## Components

### EventStore
Append-only, timestamped, partitioned storage for all learning system events:
- Market events (prices, orderbook snapshots)
- Strategy signals and decisions
- Execution outcomes (paper trading)
- Performance metrics
- Experiment results

**Key Features:**
- Immutable events
- Automatic partitioning by market + date
- Flexible querying with filters
- SQLite with WAL mode for concurrency

### SignalCatalog
Versioned registry for feature/signal definitions:
- Immutable signal schemas
- Metadata tracking (inputs, outputs, owner)
- Version management
- Feature group organization

**Key Features:**
- Reproducible feature definitions
- Signal lineage tracking
- Query by name, version, or feature group
- Statistics and monitoring

### BacktestEngine
Historical replay and strategy evaluation:
- Deterministic event replay
- Configurable time ranges and markets
- Metrics computation (PnL, Sharpe, drawdown, win rate)
- Reproducible results with seeds
- Backtest persistence

**Key Features:**
- Historical strategy evaluation
- Comparative analysis
- Metrics tracking
- Database-backed results

## Usage

See [docs/learning-system.md](/docs/learning-system.md) for comprehensive usage guide.

Quick example:

```typescript
import { EventStore, SignalCatalog, BacktestEngine } from './learning';

// Initialize components
const eventStore = new EventStore();
const signalCatalog = new SignalCatalog();
const backtestEngine = new BacktestEngine({ eventStore });

// Register a signal
signalCatalog.registerSignal({
  signalName: 'mid_price',
  description: 'Midpoint between bid/ask',
  featureGroup: 'market',
  inputFields: ['bestBid', 'bestAsk'],
  outputType: 'number',
  version: '1.0.0',
  owner: 'system',
});

// Write market event
eventStore.writeEvent('MarketEvent', 'market-1', 'websocket', {
  marketStatus: 'open',
  bestBid: 0.48,
  bestAsk: 0.52,
  mid: 0.50,
  spread: 0.04,
  liquidity: 1000,
  tickSize: 0.01,
});

// Run backtest
const backtestId = await backtestEngine.runBacktest({
  strategyId: 'my-strategy',
  startDate: '2026-02-01T00:00:00.000Z',
  endDate: '2026-02-07T23:59:59.000Z',
  markets: ['market-1'],
  initialBalance: 10000,
  slippage: 0.01,
  feeRate: 0.002,
});

const result = backtestEngine.getBacktest(backtestId);
console.log('PnL:', result.metrics.pnl);
```

## Tests

42 comprehensive tests covering:
- Event storage and querying (13 tests)
- Signal catalog management (16 tests)
- Backtest execution (13 tests)

Run tests:
```bash
npm test -- eventStore.test.ts signalCatalog.test.ts backtestEngine.test.ts
```

## Examples

- [examples/learning-system-example.ts](../examples/learning-system-example.ts) - Complete workflow demonstration

## Design

Based on [REPORTS/LEARNING_SYSTEM.md](/REPORTS/LEARNING_SYSTEM.md) specification.

### Key Principles

1. **Paper trading only** - No live execution
2. **Immutable events** - Append-only storage
3. **Versioned schemas** - Reproducible definitions
4. **Audit trail** - Complete event history
5. **Fail closed** - Safe by default

### Architecture

```
Learning System
├── EventStore
│   ├── Events table (SQLite)
│   ├── Partition by market + date
│   └── Query API
├── SignalCatalog
│   ├── Signal definitions table
│   ├── Version management
│   └── Feature groups
└── BacktestEngine
    ├── Historical replay
    ├── Metrics computation
    └── Backtest persistence
```

## Integration

### With Paper Trading
```typescript
// After paper trade execution
eventStore.writeEvent('ExecutionOutcomeEvent', marketId, 'simulation', {
  decisionId,
  simulatedOrderId,
  status: 'filled',
  requested: { side: 'buy', price: 0.50, size: 50 },
  executed: { price: 0.498, size: 50 },
  fees: 0.0498,
  latencyMs: 150,
});
```

### With Strategy Engine
```typescript
// Strategy generates signal
eventStore.writeEvent('SignalEvent', marketId, 'strategy', {
  signalId,
  signalName: 'mean_reversion_signal',
  signalValue: -0.75,
  signalVersion: '1.0.0',
  featureSetId: 'feature-set-1',
  metadata: { confidence: 0.82 },
});
```

### With Market Feed
```typescript
// Market data arrives
eventStore.writeEvent('MarketEvent', marketId, 'websocket', {
  marketStatus: 'open',
  bestBid,
  bestAsk,
  mid,
  spread,
  liquidity,
  tickSize,
});
```

## Performance

- **Event writes:** <1ms typical
- **Event queries:** <10ms for 1 day, 1 market
- **Backtest replay:** ~1000 events/second
- **Signal lookups:** <1ms

## Storage

- **Event store:** SQLite with WAL mode
- **Signal catalog:** SQLite (lightweight)
- **Backtest results:** SQLite (persistent)

Default paths:
- `data/events.db` - Event store
- `data/signals.db` - Signal catalog
- `data/backtests.db` - Backtest results

## Compliance

- Paper trading only (no live execution)
- No secrets in event store
- Complete audit trail
- Fail-closed safety

## Related Documentation

- [Learning System Guide](/docs/learning-system.md) - Usage guide
- [Learning System Design](/REPORTS/LEARNING_SYSTEM.md) - Design specification
- [Paper Trading Guide](/docs/paper-trading.md) - Paper trading mode
- [Architecture](/docs/architecture.md) - System architecture
