# Strategy Configuration Routing (GAP-002)

## Overview

The `STRATEGY_CONFIG_PATH` environment variable enables per-strategy configuration, allowing each trading strategy to be independently configured via external files. This feature supports both single global configuration (backward compatible) and per-strategy configuration arrays.

## Configuration Formats

### Format 1: Single Global Config (Backward Compatible)

**File:** `config/strategy.json`

```json
{
  "spread": 0.02,
  "maxPositionSize": 100,
  "inventorySkew": true
}
```

**Usage:**
```bash
STRATEGY_CONFIG_PATH=config/strategy.json
```

**Use Case:** Simple deployments with global strategy parameters.

### Format 2: Per-Strategy Configs (GAP-002)

**File:** `config/strategies.json`

```json
[
  {
    "strategyId": "arbitrage-main",
    "type": "arbitrage",
    "enabled": true,
    "params": {
      "minProfitBps": 50,
      "feeRate": 0.02,
      "maxOrderSize": 100,
      "minLiquidity": 50,
      "priceUpdateWindow": 5000
    }
  },
  {
    "strategyId": "mean-reversion-aggressive",
    "type": "mean-reversion",
    "enabled": true,
    "params": {
      "lookbackPeriod": 15,
      "entryThreshold": 2.5,
      "exitThreshold": 0.5,
      "maxPositionSize": 75,
      "cooldownPeriod": 60000
    }
  },
  {
    "strategyId": "market-maker-tight",
    "type": "market-making",
    "enabled": true,
    "params": {
      "spreadBps": 80,
      "orderSize": 20,
      "maxInventory": 150,
      "inventorySkew": true,
      "minSpread": 0.005
    }
  },
  {
    "strategyId": "random-test",
    "type": "random",
    "enabled": false,
    "params": {
      "buyProbability": 0.3,
      "sellProbability": 0.3,
      "maxSize": 5
    }
  }
]
```

**Usage:**
```bash
STRATEGY_CONFIG_PATH=config/strategies.json
```

**Use Case:** Production deployments with multiple strategies running concurrently, each with independent configuration.

## Per-Strategy Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `strategyId` | string | Yes | Unique identifier for the strategy instance |
| `type` | string | Yes | Strategy type (e.g., 'arbitrage', 'mean-reversion', 'market-making', 'random') |
| `enabled` | boolean | Yes | Whether this strategy is active |
| `params` | object | Yes | Strategy-specific parameters (varies by type) |

## Strategy Types and Parameters

### Arbitrage Strategy

**Type:** `arbitrage`

**Description:** Exploits YES + NO price discrepancies in Polymarket prediction markets.

**Parameters:**
- `minProfitBps` (number): Minimum profit in basis points (default: 50)
- `feeRate` (number): Fee rate as decimal (default: 0.02 = 2%)
- `maxOrderSize` (number): Maximum order size (default: 100)
- `minLiquidity` (number): Minimum liquidity required (default: 50)
- `priceUpdateWindow` (number): Price update window in ms (optional)

### Mean Reversion Strategy

**Type:** `mean-reversion`

**Description:** Fades overreactions and bets on price normalization.

**Parameters:**
- `lookbackPeriod` (number): Number of periods to look back (default: 20)
- `entryThreshold` (number): Z-score threshold for entry (default: 2.0)
- `exitThreshold` (number): Z-score threshold for exit (default: 0.5)
- `maxPositionSize` (number): Maximum position size (default: 50)
- `minSpread` (number): Minimum spread required (default: 0.01)
- `cooldownPeriod` (number): Cooldown in ms between trades (default: 60000)

### Market Making Strategy

**Type:** `market-making`

**Description:** Provides liquidity and captures spreads.

**Parameters:**
- `spreadBps` (number): Spread in basis points (default: 100)
- `orderSize` (number): Size per order (default: 10)
- `maxInventory` (number): Maximum inventory (default: 100)
- `inventorySkew` (boolean): Enable inventory skewing (default: true)
- `minSpread` (number): Minimum spread required (default: 0.005)

### Random Strategy

**Type:** `random`

**Description:** Random trading for testing framework only (NOT for production).

**Parameters:**
- `buyProbability` (number): Probability of buy (default: 0.3)
- `sellProbability` (number): Probability of sell (default: 0.3)
- `maxSize` (number): Maximum order size (default: 10)
- `minSpread` (number): Minimum spread required (default: 0.01)

## Using the Configuration API

### Load Strategy Configs

```typescript
import { ConfigManager } from './config/configManager';

const configManager = ConfigManager.getInstance();

// Get all strategy configs
const allConfigs = configManager.getAllStrategyConfigs();
console.log(`Loaded ${allConfigs.length} strategies`);

// Get specific strategy config
const config = configManager.getStrategyConfig('arbitrage-main');
if (config) {
  console.log(`Strategy: ${config.strategyId}`);
  console.log(`Type: ${config.type}`);
  console.log(`Enabled: ${config.enabled}`);
  console.log(`Params:`, config.params);
}
```

### Filter Enabled Strategies

```typescript
const enabledConfigs = configManager
  .getAllStrategyConfigs()
  .filter(c => c.enabled);

console.log(`${enabledConfigs.length} strategies enabled`);
```

### Create Strategy Instances

```typescript
import { StrategyFactory } from './trading/strategies';

const configs = configManager.getAllStrategyConfigs();
const strategies = await Promise.all(
  configs
    .filter(c => c.enabled)
    .map(config => StrategyFactory.create(config))
);

console.log(`Created ${strategies.length} strategy instances`);
```

## Hot-Reload Support

Configuration changes are automatically detected and reloaded:

```typescript
// Listen for config changes
configManager.on('configChanged', ({ type }) => {
  if (type === 'strategy') {
    console.log('Strategy config changed, reloading...');
    const newConfigs = configManager.getAllStrategyConfigs();
    // Reload strategies with new configs
  }
});

// Start watching for changes
await configManager.startWatching();
```

## Validation

Configuration validation is automatic:

- **Schema validation:** All configs are validated against Zod schemas
- **Required fields:** `strategyId`, `type`, `enabled`, `params` must be present
- **Type checking:** `enabled` must be boolean, `params` must be an object
- **Strategy type validation:** Strategy type must be registered in StrategyFactory

Invalid configurations are logged and ignored.

## Testing

### Unit Tests

Run strategy config routing tests:

```bash
npm test -- strategyConfigRouting.test.ts
```

### Integration Tests

Test hot-reload functionality:

```bash
npm test -- configHotReload.test.ts
```

### Example Test Cases

- Load array of strategy configs
- Load single global config (backward compatibility)
- Route config to correct strategy by ID
- Filter enabled strategies
- Validate required fields
- Handle empty strategy array
- Handle malformed JSON gracefully
- Support runtime config modification

## Migration Guide

### From Global Config to Per-Strategy Configs

**Before (global config):**

```json
{
  "spread": 0.02,
  "maxPositionSize": 100
}
```

**After (per-strategy configs):**

```json
[
  {
    "strategyId": "my-strategy-1",
    "type": "market-making",
    "enabled": true,
    "params": {
      "spreadBps": 200,
      "maxInventory": 100
    }
  }
]
```

**Steps:**

1. Copy `config/strategies.json.example` to `config/strategies.json`
2. Configure your strategies with unique IDs
3. Update `STRATEGY_CONFIG_PATH=config/strategies.json`
4. Restart the bot
5. Verify each strategy loads independently

## Best Practices

1. **Use descriptive strategy IDs:** `arbitrage-main`, `mean-reversion-aggressive`, etc.
2. **Enable strategies selectively:** Set `enabled: false` for testing/debugging
3. **Version your configs:** Keep configs in version control
4. **Test before deploying:** Validate configs in paper trading mode first
5. **Monitor per-strategy performance:** Use distinct IDs for clear metrics
6. **Document custom parameters:** Add comments in JSON (use `.jsonc` if supported)

## Troubleshooting

### Config not loading

**Check:**
- File path is correct (relative to `process.cwd()` or absolute)
- File has valid JSON syntax
- File permissions allow reading
- Environment variable `STRATEGY_CONFIG_PATH` is set

**Logs:**
```
[warn] Failed to load strategy config: { path: '...', error: '...' }
```

### Strategy not found

**Check:**
- Strategy ID matches exactly (case-sensitive)
- Strategy is in the configs array
- Config file was loaded successfully

**Code:**
```typescript
const config = configManager.getStrategyConfig('my-strategy-id');
if (!config) {
  console.error('Strategy not found in config');
}
```

### Invalid configuration

**Check:**
- All required fields are present
- Field types are correct (boolean, number, string, object)
- Strategy type is registered in StrategyFactory

**Validation errors are logged:**
```
[warn] Validation failed for strategy configuration: { errors: [...] }
```

## Architecture

### Components

- **ConfigManager:** Loads and manages configuration files
- **StrategyFactory:** Creates strategy instances from configs
- **StrategyOrchestrator:** Runs multiple strategies concurrently
- **StrategyManager:** Manages strategy lifecycle with hot-reload

### Data Flow

```
STRATEGY_CONFIG_PATH → ConfigManager → StrategyFactory → Strategy Instance
                              ↓
                       Hot-reload events
                              ↓
                       ConfigChanged event → Reload strategies
```

## Related Documentation

- [Configuration Layer](../architecture.md#configuration-layer)
- [Strategy Framework](../architecture.md#strategy-modules)
- [Multi-Strategy Orchestration](../apps/backend/src/trading/strategies/ORCHESTRATOR.md)

## References

- Issue: [GAP-002] Wire STRATEGY_CONFIG_PATH
- Implementation: `apps/backend/src/config/configManager.ts`
- Tests: `apps/backend/tests/unit/strategyConfigRouting.test.ts`
- Examples: `config/strategies.json.example`, `config/strategy.json.example`
