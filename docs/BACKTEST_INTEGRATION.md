# Backtest Integration Guide

This guide explains how the backtesting engine is integrated with the strategy framework, allowing you to test any strategy on historical market data.

## Overview

The backtest integration connects two key systems:

1. **BacktestEngine**: Replays historical market events and simulates trading
2. **Strategy Framework**: Pluggable trading strategies (Random, Arbitrage, Mean Reversion, Market Making)

### Key Features

- ✅ **Zero Strategy Changes**: All existing strategies work in backtest mode without modification
- ✅ **Historical Replay**: Chronological event replay from EventStore
- ✅ **Comprehensive Metrics**: PnL, Sharpe ratio, drawdown, win rate, trade count
- ✅ **Reproducibility**: Seeded random number generation for deterministic results
- ✅ **CLI Support**: Run backtests directly from command line
- ✅ **Multi-Market**: Test strategies across multiple markets simultaneously
- ✅ **Standard Format**: Results compatible with analytics pipeline

## Architecture

### Event Flow

```
EventStore (Historical Data)
    ↓
BacktestEngine
    ↓ (converts MarketEvent → MarketContext)
Strategy.evaluate()
    ↓ (returns TradingDecision)
Trade Execution Simulation
    ↓
Metrics Computation
    ↓
BacktestResult
```

### Key Components

**BacktestEngine** (`apps/backend/src/learning/backtestEngine.ts`):
- Fetches historical events from EventStore
- Creates strategy instances via StrategyFactory
- Converts MarketEvent to MarketContext
- Executes trades based on strategy decisions
- Tracks positions, PnL, and metrics
- Persists results to SQLite database

**Strategy Adapter**:
- `convertEventToContext()`: Transforms MarketEvent → MarketContext
- Position tracking for strategies that need current position info
- Slippage and fee application

## Usage

### CLI Command

```bash
npm run backtest -- \
  --strategy <type> \
  --start <ISO_date> \
  --end <ISO_date> \
  --markets <comma_separated_ids> \
  [options]
```

**Required Parameters:**
- `--strategy`: Strategy type (`random`, `arbitrage`, `mean-reversion`, `market-making`)
- `--start`: Start date (ISO 8601 format, e.g., `2026-02-01T00:00:00.000Z`)
- `--end`: End date (ISO 8601 format)
- `--markets`: Comma-separated market IDs (e.g., `market-1,market-2`)

**Optional Parameters:**
- `--balance <number>`: Initial balance (default: 10000)
- `--slippage <number>`: Slippage factor (default: 0.01 = 1%)
- `--feeRate <number>`: Fee rate (default: 0.002 = 0.2%)
- `--seed <number>`: Random seed for reproducibility
- `--config <json>`: Strategy-specific configuration as JSON string

### Examples

**Basic Backtest:**
```bash
npm run backtest -- \
  --strategy random \
  --start "2026-02-01T00:00:00.000Z" \
  --end "2026-02-10T00:00:00.000Z" \
  --markets "market-1"
```

**With Custom Configuration:**
```bash
npm run backtest -- \
  --strategy arbitrage \
  --start "2026-02-01T00:00:00.000Z" \
  --end "2026-02-10T00:00:00.000Z" \
  --markets "market-1,market-2" \
  --balance 50000 \
  --slippage 0.005 \
  --config '{"minProfitBps": 100, "maxOrderSize": 50}'
```

**Reproducible Backtest:**
```bash
npm run backtest -- \
  --strategy random \
  --start "2026-02-01T00:00:00.000Z" \
  --end "2026-02-10T00:00:00.000Z" \
  --markets "market-1" \
  --seed 42 \
  --config '{"buyProbability": 0.4, "sellProbability": 0.4, "seed": 42}'
```

### Programmatic Usage

```typescript
import { BacktestEngine } from './learning/backtestEngine';
import { EventStore } from './learning/eventStore';
import { registerStrategies } from './trading/strategies';

// Initialize
registerStrategies();
const eventStore = new EventStore();
const engine = new BacktestEngine({ eventStore });

// Run backtest
const backtestId = await engine.runBacktest({
  strategyId: 'random',
  strategyConfig: {
    buyProbability: 0.3,
    sellProbability: 0.3,
    seed: 42,
  },
  startDate: '2026-02-01T00:00:00.000Z',
  endDate: '2026-02-10T00:00:00.000Z',
  markets: ['market-1'],
  initialBalance: 10000,
  slippage: 0.01,
  feeRate: 0.002,
  seed: 42,
});

// Get results
const result = engine.getBacktest(backtestId);
console.log(`PnL: $${result.metrics.pnl}`);
console.log(`Sharpe: ${result.metrics.sharpe}`);
console.log(`Trades: ${result.metrics.totalTrades}`);

// Cleanup
engine.close();
eventStore.close();
```

## Strategy Configuration

Each strategy has specific configuration parameters:

### Random Strategy

```json
{
  "buyProbability": 0.3,    // Probability of buying (0-1)
  "sellProbability": 0.3,   // Probability of selling (0-1)
  "maxSize": 10,            // Maximum order size
  "minSpread": 0.01,        // Minimum spread to trade
  "seed": 42                // Random seed for reproducibility
}
```

### Arbitrage Strategy

```json
{
  "minProfitBps": 50,       // Minimum profit in basis points
  "feeRate": 0.02,          // Fee rate (2%)
  "maxOrderSize": 100,      // Maximum order size
  "minLiquidity": 50        // Minimum liquidity required
}
```

### Mean Reversion Strategy

```json
{
  "lookbackPeriod": 20,     // Price history window
  "minSpread": 0.01,        // Minimum spread
  "maxPositionSize": 50,    // Maximum position size
  "entryThreshold": 2.0,    // Entry signal threshold (std devs)
  "exitThreshold": 0.5,     // Exit signal threshold (std devs)
  "cooldownPeriod": 60000   // Cooldown between trades (ms)
}
```

### Market Making Strategy

```json
{
  "spreadBps": 100,         // Target spread in basis points
  "orderSize": 10,          // Size per order
  "maxInventory": 100,      // Maximum inventory
  "inventorySkew": true,    // Adjust quotes based on inventory
  "minSpread": 0.005        // Minimum spread
}
```

## Output Format

### BacktestResult Schema

```typescript
interface BacktestResult {
  backtestId: string;           // Unique identifier
  strategyId: string;           // Strategy type used
  config: BacktestConfig;       // Full configuration
  metrics: {
    pnl: number;                // Total profit/loss
    sharpe: number;             // Sharpe ratio
    maxDrawdown: number;        // Maximum drawdown (0-1)
    winRate: number;            // Win rate (0-1)
    totalTrades: number;        // Total trade count
    avgTradeSize: number;       // Average trade size
  };
  trades: Array<{
    timestamp: string;          // ISO timestamp
    marketId: string;           // Market identifier
    side: 'buy' | 'sell';      // Trade side
    price: number;              // Execution price
    size: number;               // Trade size
    pnl: number;                // Trade PnL
  }>;
  completedAt: string;          // Completion timestamp
}
```

### Example Output

```
🧪 Starting Backtest
==================

Strategy:        random
Markets:         market-1
Period:          2026-02-01T00:00:00.000Z to 2026-02-10T00:00:00.000Z
Initial Balance: $10000.00
Slippage:        1.00%
Fee Rate:        0.20%
Seed:            42

✓ Backtest Complete

Results
=======

Backtest ID:     a1b2c3d4-e5f6-7890-abcd-ef1234567890
Completed:       2/19/2026, 3:00:00 PM

Performance Metrics:
  Total PnL:      $125.50
  Return:         1.26%
  Sharpe Ratio:   1.234
  Max Drawdown:   5.23%
  Win Rate:       55.00%
  Total Trades:   42
  Avg Trade Size: 8.50

Recent Trades (last 5):
  2:59:45 PM | BUY  | Price: 0.5123 | Size:  10 | PnL: +$2.50
  2:58:30 PM | SELL | Price: 0.4876 | Size:   8 | PnL: -$1.20
  2:57:15 PM | BUY  | Price: 0.5234 | Size:  12 | PnL: +$3.40
  2:56:00 PM | SELL | Price: 0.4987 | Size:   9 | PnL: +$1.80
  2:54:45 PM | BUY  | Price: 0.5098 | Size:  11 | PnL: -$0.50

✓ Results saved to backtest database
```

## Testing

### Integration Tests

Comprehensive integration test suite validates all strategies:

```bash
# Run all backtest integration tests
npm run test:integration -- backtestStrategyIntegration

# Run specific test
npm run test:integration -- -t "Random Strategy Integration"
```

Test coverage includes:
- All 4 strategy types (Random, Arbitrage, Mean Reversion, Market Making)
- Reproducibility with seeded randomness
- Multiple market support
- Metrics computation accuracy
- Standard format output validation
- Error handling

### Unit Tests

Original backtest engine tests ensure core functionality:

```bash
npm run test:backtest
```

## Data Requirements

### EventStore Schema

Backtests require historical MarketEvent data in the EventStore:

```typescript
interface MarketEvent {
  marketStatus: 'open' | 'closed' | 'resolved';
  bestBid: number;           // Best bid price (0-1)
  bestAsk: number;           // Best ask price (0-1)
  mid: number;               // Mid price
  spread: number;            // Bid-ask spread
  liquidity: number;         // Aggregate liquidity
  tickSize: number;          // Minimum price increment
}
```

### Loading Historical Data

To populate EventStore with historical data:

```typescript
import { EventStore } from './learning/eventStore';

const eventStore = new EventStore();

// Write market event
eventStore.writeEvent(
  'MarketEvent',
  'market-1',
  'websocket',
  {
    marketStatus: 'open',
    bestBid: 0.48,
    bestAsk: 0.52,
    mid: 0.50,
    spread: 0.04,
    liquidity: 1000,
    tickSize: 0.01,
  },
  '2026-02-01T00:00:00.000Z'
);
```

## Limitations & Considerations

### Current Limitations

1. **Simplified Execution Model**: 
   - No partial fills
   - Slippage applied uniformly
   - No market impact modeling

2. **Position Tracking**:
   - Single position per market
   - No multiple concurrent positions
   - Simplified P&L calculation

3. **Market Data**:
   - Requires pre-populated EventStore
   - No live data fetching during backtest
   - Limited orderbook depth information

### Best Practices

1. **Use Realistic Parameters**:
   - Set slippage based on typical market conditions (1-2%)
   - Use actual fee rates from exchange (0.2%)
   - Consider market impact for large orders

2. **Validate Results**:
   - Compare multiple backtests with different seeds
   - Verify metrics against known benchmarks
   - Check trade distribution makes sense

3. **Data Quality**:
   - Ensure sufficient historical data coverage
   - Verify data quality before backtesting
   - Handle missing data appropriately

4. **Strategy Testing**:
   - Test across different market regimes
   - Validate with multiple time periods
   - Check edge cases and error handling

## Integration with Analytics Pipeline

Backtest results are stored in SQLite database (`data/backtests.db`) in a format compatible with analytics tools.

### Querying Results

```typescript
// List all backtests for a strategy
const backtests = engine.listBacktests('random');

// Get specific backtest
const result = engine.getBacktest(backtestId);

// Get engine statistics
const stats = engine.getStats();
```

### Database Schema

```sql
CREATE TABLE backtests (
  backtest_id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  config TEXT NOT NULL,          -- JSON
  result TEXT,                   -- JSON
  status TEXT NOT NULL,          -- 'running' | 'completed' | 'failed'
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT
);

CREATE INDEX idx_backtests_strategy ON backtests(strategy_id);
CREATE INDEX idx_backtests_status ON backtests(status);
CREATE INDEX idx_backtests_created ON backtests(created_at);
```

## Future Enhancements

Potential improvements for future iterations:

1. **Advanced Execution**:
   - Partial fill simulation
   - Market impact modeling
   - Order queue position tracking

2. **Enhanced Metrics**:
   - Information ratio
   - Sortino ratio
   - Calmar ratio
   - Maximum favorable/adverse excursion

3. **Optimization**:
   - Parameter sweep functionality
   - Walk-forward analysis
   - Strategy comparison tools

4. **Visualization**:
   - Equity curve plots
   - Trade distribution charts
   - Drawdown visualization
   - P&L heatmaps

5. **Risk Analysis**:
   - Value at Risk (VaR)
   - Conditional VaR
   - Stress testing scenarios

## References

- [Strategy Framework](../apps/backend/src/trading/strategies/README.md)
- [Learning System Design](../REPORTS/LEARNING_SYSTEM.md)
- [EventStore Documentation](../apps/backend/src/learning/README.md)
- [Integration Tests](../apps/backend/tests/integration/backtestStrategyIntegration.test.ts)

## Support

For issues or questions:
1. Check integration test examples
2. Review strategy-specific documentation
3. Examine BacktestEngine source code
4. Open an issue on GitHub with reproducible example
