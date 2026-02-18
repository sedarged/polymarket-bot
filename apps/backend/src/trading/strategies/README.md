# Trading Strategies Framework

This module provides a flexible, extensible framework for implementing and managing trading strategies in the Polymarket bot.

## Overview

The strategies framework follows the **Strategy Pattern** and **Factory Pattern** for clean separation of concerns and easy extensibility.

### Key Components

1. **Strategy Interface** (`IStrategy`) - Defines the contract all strategies must implement
2. **Base Strategy Class** (`BaseStrategy`) - Abstract base class providing common functionality
3. **Strategy Factory** (`StrategyFactory`) - Factory for creating and managing strategy instances
4. **Built-in Strategies** - Example implementations for testing and learning

## Architecture

```
┌─────────────────────────────────────────────┐
│           Strategy Factory                   │
│  - Registration system                       │
│  - Instance creation                         │
│  - Configuration management                  │
└─────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌───────────────┐       ┌───────────────┐
│  IStrategy    │       │ BaseStrategy  │
│  (Interface)  │←──────│ (Abstract)    │
└───────────────┘       └───────────────┘
                              ↑
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
│   Random     │   │ TrendFollowing   │   │ MarketMaking │
│  Strategy    │   │    Strategy      │   │   Strategy   │
└──────────────┘   └──────────────────┘   └──────────────┘
```

## Quick Start

### 1. Register Strategies

```typescript
import { registerStrategies } from './trading/strategies';

// Register all built-in strategies
registerStrategies();
```

### 2. Create Strategy from Config

```typescript
import { StrategyFactory } from './trading/strategies';

const config = {
  strategyId: 'my-strategy-1',
  type: 'random',
  enabled: true,
  params: {
    buyProbability: 0.3,
    sellProbability: 0.3,
    maxSize: 10,
  },
};

const strategy = await StrategyFactory.create(config);
```

### 3. Evaluate Market Conditions

```typescript
const marketContext = {
  marketId: 'market-123',
  tokenId: 'token-abc',
  bestBid: 0.49,
  bestAsk: 0.51,
  mid: 0.50,
  spread: 0.02,
  liquidity: { bidSize: 100, askSize: 100 },
  timestamp: new Date().toISOString(),
};

const decision = await strategy.evaluate(marketContext);

console.log(decision);
// {
//   action: 'buy',
//   side: 'BUY',
//   price: 0.50,
//   size: 10,
//   confidence: 0.7,
//   rationale: 'Random buy decision (probability: 0.3)',
// }
```

## Built-in Strategies

### ArbitrageStrategy ⭐ MOST IMPORTANT

**The core Polymarket strategy.** Exploits price discrepancies where YES + NO ≠ $1.00.

**Key Concept:**
- On Polymarket, YES and NO shares must sum to exactly $1.00 at settlement
- If YES + NO < $1.00 (minus fees), buy both sides for guaranteed profit
- If YES + NO > $1.00 (plus fees), sell both sides (requires inventory)

**Parameters:**
- `minProfitBps` (number): Minimum profit in basis points after fees (default: 50 = 0.5%)
- `feeRate` (number): Trading fee rate (default: 0.02 = 2%)
- `maxOrderSize` (number): Maximum order size (default: 100)
- `minLiquidity` (number): Minimum liquidity required on both sides (default: 50)
- `priceUpdateWindow` (number): Time window for stale price detection in ms (default: 5000)

**Use Case:** 
- Primary profit generator for Polymarket bots
- Risk-free returns when opportunities exist
- Works in all market conditions

**✅ Production-Ready:** This strategy is ready for live trading on Polymarket.

**Example:**
```typescript
{
  strategyId: 'arbitrage-main',
  type: 'arbitrage',
  enabled: true,
  params: {
    minProfitBps: 50,  // 0.5% minimum profit
    feeRate: 0.02,     // 2% Polymarket fee
    maxOrderSize: 100
  }
}
```

### MeanReversionStrategy

**Statistical strategy for prediction markets.** Markets often overreact to breaking news, creating mean-reversion opportunities.

**Key Concept:**
- Calculates mean price over lookback period
- Identifies when current price deviates beyond statistical norms (z-score)
- Bets on return to equilibrium
- Includes cooldown periods to avoid overtrading

**Parameters:**
- `lookbackPeriod` (number): Price updates for mean calculation (default: 20)
- `stdDevThreshold` (number): Standard deviations from mean (default: 2.0)
- `minSpread` (number): Minimum spread to trade (default: 0.01)
- `maxPositionSize` (number): Maximum position size (default: 50)
- `entryThreshold` (number): Z-score threshold for entry (default: 2.0)
- `exitThreshold` (number): Z-score threshold for exit (default: 0.5)
- `cooldownPeriod` (number): Minimum time between trades in ms (default: 60000 = 1 min)

**Use Case:** 
- News-driven markets (elections, sports, politics)
- High volatility events
- Markets with frequent overreactions

**⚠️ Note:** Works well for prediction markets but requires careful parameter tuning.

**Example:**
```typescript
{
  strategyId: 'mean-reversion-1',
  type: 'mean-reversion',
  enabled: true,
  params: {
    lookbackPeriod: 20,
    entryThreshold: 2.5,   // Enter when 2.5 std devs from mean
    exitThreshold: 0.5,     // Exit when within 0.5 std devs
    cooldownPeriod: 60000   // Wait 1 minute between trades
  }
}
```

### MarketMakingStrategy

Simple market making with inventory management. Provides liquidity while capturing spreads.

**Parameters:**
- `spreadBps` (number): Target spread in basis points (default: 100 = 1%)
- `orderSize` (number): Size per order (default: 10)
- `maxInventory` (number): Maximum inventory (default: 100)
- `inventorySkew` (boolean): Adjust quotes by inventory (default: true)
- `minSpread` (number): Minimum market spread (default: 0.005)

**Use Case:** 
- Steady income from spreads
- Works in stable markets
- Requires active inventory management

**⚠️ WARNING:** Simplified for testing. Production market making requires:
- Proper risk management
- Latency optimization
- Adverse selection protection
- Dynamic spread adjustment

**Example:**
```typescript
{
  strategyId: 'mm-stable',
  type: 'market-making',
  enabled: true,
  params: {
    spreadBps: 100,        // 1% spread
    orderSize: 20,
    inventorySkew: true    // Skew prices based on inventory
  }
}
```

### RandomStrategy

**FOR TESTING ONLY.** Random trading for framework validation.

**Parameters:**
- `buyProbability` (0-1): Probability of buying (default: 0.3)
- `sellProbability` (0-1): Probability of selling (default: 0.3)
- `maxSize` (number): Maximum order size (default: 10)
- `minSpread` (number): Minimum spread to trade (default: 0.01)
- `seed` (number): Optional seed for reproducible randomness

**Use Case:** 
- Testing strategy framework
- Backtesting infrastructure
- Development and debugging

**❌ DO NOT USE IN LIVE TRADING**

## Configuration

### Example Configuration File

Create `config/strategies.json`:

```json
[
  {
    "strategyId": "arbitrage-main",
    "type": "arbitrage",
    "enabled": true,
    "params": {
      "minProfitBps": 50,
      "feeRate": 0.02,
      "maxOrderSize": 100
    }
  },
  {
    "strategyId": "mean-reversion-1",
    "type": "mean-reversion",
    "enabled": true,
    "params": {
      "lookbackPeriod": 20,
      "entryThreshold": 2.5,
      "exitThreshold": 0.5
    }
  },
  {
    "strategyId": "market-maker-1",
    "type": "market-making",
    "enabled": true,
    "params": {
      "spreadBps": 100,
      "orderSize": 20,
      "inventorySkew": true
    }
  }
]
```

### Loading from Configuration

```typescript
import fs from 'fs';
import { StrategyFactory } from './trading/strategies';

const configs = JSON.parse(
  fs.readFileSync('config/strategies.json', 'utf-8')
);

const strategies = await StrategyFactory.createAll(configs);
```

## Creating Custom Strategies

### 1. Extend BaseStrategy

```typescript
import { BaseStrategy } from './trading/strategies/BaseStrategy';
import type {
  MarketContext,
  Position,
  TradingDecision,
  StrategyConfig,
} from './trading/strategies/types';

export class MyCustomStrategy extends BaseStrategy {
  constructor() {
    super(
      'my-custom-strategy',
      'MyCustom',
      '1.0.0',
      'My custom trading strategy',
    );
  }

  protected async onInitialize(config: StrategyConfig): Promise<void> {
    // Validate and store configuration
    // Initialize any resources
  }

  protected async onEvaluate(
    context: MarketContext,
    position?: Position,
  ): Promise<TradingDecision> {
    // Implement your trading logic
    return {
      action: 'hold',
      confidence: 0.5,
      rationale: 'Custom logic',
    };
  }
}
```

### 2. Register Your Strategy

```typescript
import { StrategyFactory } from './trading/strategies';
import { MyCustomStrategy } from './MyCustomStrategy';

StrategyFactory.register({
  type: 'my-custom',
  factory: () => new MyCustomStrategy(),
  description: 'My custom trading strategy',
  defaultConfig: {
    strategyId: '',
    type: 'my-custom',
    enabled: true,
    params: {
      // Your default parameters
    },
  },
});
```

### 3. Use Your Strategy

```typescript
const strategy = await StrategyFactory.create({
  strategyId: 'custom-1',
  type: 'my-custom',
  enabled: true,
  params: {
    // Your parameters
  },
});
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyFactory } from './trading/strategies';
import { MyCustomStrategy } from './MyCustomStrategy';

describe('MyCustomStrategy', () => {
  beforeEach(() => {
    StrategyFactory.clear();
    StrategyFactory.register({
      type: 'my-custom',
      factory: () => new MyCustomStrategy(),
      description: 'Test',
      defaultConfig: { /* ... */ },
    });
  });

  it('should create strategy', async () => {
    const strategy = await StrategyFactory.create({
      strategyId: 'test-1',
      type: 'my-custom',
      enabled: true,
      params: {},
    });

    expect(strategy).toBeDefined();
  });
});
```

### Integration Tests

See `tests/integration/strategyFramework.test.ts` for complete examples.

## Best Practices

### Strategy Design

1. **Keep strategies stateless** - Store state in external systems
2. **Make decisions deterministic** - Same inputs → same outputs
3. **Handle errors gracefully** - Never throw from `evaluate()`
4. **Log all decisions** - Include rationale and confidence
5. **Validate inputs** - Check market context validity
6. **Test thoroughly** - Unit tests + integration tests + backtests

### Configuration

1. **Use sensible defaults** - Strategy should work out-of-the-box
2. **Validate parameters** - Fail fast on invalid config
3. **Document parameters** - Clear descriptions and ranges
4. **Version your strategies** - Track changes over time

### Performance

1. **Avoid blocking operations** - Use async/await properly
2. **Cache expensive calculations** - Don't recompute unnecessarily
3. **Limit memory usage** - Clean up old data
4. **Monitor performance** - Track evaluation time

### Security

1. **Never commit secrets** - Use environment variables
2. **Validate all inputs** - Prevent injection attacks
3. **Rate limit external calls** - Respect API limits
4. **Log security events** - Track suspicious activity

## API Reference

### IStrategy Interface

```typescript
interface IStrategy {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  
  initialize(config: StrategyConfig): Promise<void>;
  evaluate(context: MarketContext, position?: Position): Promise<TradingDecision>;
  cleanup?(): Promise<void>;
  getConfig(): StrategyConfig;
  getMetrics?(): { trades: number; winRate: number; pnl: number };
}
```

### StrategyFactory Methods

```typescript
class StrategyFactory {
  static register(registration: StrategyRegistration): void;
  static unregister(type: string): boolean;
  static create(config: StrategyConfig): Promise<IStrategy>;
  static createAll(configs: StrategyConfig[]): Promise<IStrategy[]>;
  static getRegisteredTypes(): string[];
  static listStrategies(): Array<{...}>;
  static clear(): void;
}
```

## Troubleshooting

### Strategy Not Registered

```typescript
Error: Unknown strategy type: my-strategy
```

**Solution:** Register the strategy before creating:

```typescript
import { registerStrategies } from './trading/strategies';
registerStrategies();
```

### Invalid Configuration

```typescript
Error: buyProbability must be between 0 and 1
```

**Solution:** Check parameter values in your config file.

### Evaluation Errors

Strategies should never throw during evaluation. If you see errors, check:
1. Strategy initialization completed successfully
2. Market context is valid
3. Position data (if provided) is correct

## Future Enhancements

Planned improvements:

1. **Dynamic parameter tuning** - Auto-adjust based on performance
2. **Multi-market strategies** - Trade across multiple markets
3. **Composite strategies** - Combine multiple strategies
4. **Strategy versioning** - A/B test strategy variants
5. **Real-time metrics** - Live performance dashboard
6. **Strategy marketplace** - Share and download strategies

## Related Documentation

- [Trading Module](../README.md) - Overview of trading system
- [Paper Trading Engine](../paperTradingEngine.ts) - Execution simulator
- [Risk Manager](../riskManager.ts) - Risk limits and controls
- [Learning System](../../learning/README.md) - Backtest and optimization

## License

See repository LICENSE file.
