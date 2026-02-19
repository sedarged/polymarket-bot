# Strategy Hot-Reload

The Polymarket bot supports hot-reloading of trading strategies, allowing you to update strategy code or configuration without restarting the bot.

## Overview

The **StrategyManager** provides:
- **Hot-reload**: Automatically detect and reload strategy changes
- **State preservation**: Maintain strategy state across reloads
- **Safe reload**: Validate new strategies before applying changes
- **File watching**: Monitor strategy source files for changes
- **Multi-strategy**: Manage multiple strategies independently

**Note on Rollback**: If a reload fails, the previous strategy instance remains active. The new strategy is only applied after successful creation and validation.

## Quick Start

### Using the Demo

The easiest way to see hot-reload in action:

```bash
cd apps/backend
npm run example:hotreload
```

This interactive demo:
1. Loads multiple strategies
2. Enables file watching
3. Shows hot-reload events in real-time
4. Provides commands to manually reload strategies

### Basic Usage

```typescript
import { StrategyManager } from './trading/strategies/StrategyManager';
import { registerStrategies } from './trading/strategies';

// Register all built-in strategies
registerStrategies();

// Create manager with hot-reload enabled
const manager = new StrategyManager({
  watchEnabled: true,
  autoReload: true,
  debounceDelayMs: 500,
});

// Load strategies
const configs = [
  {
    strategyId: 'arbitrage-1',
    type: 'arbitrage',
    enabled: true,
    params: { minProfitBps: 50 },
  },
];

await manager.loadStrategies(configs);

// Listen for events
manager.on('strategyReloaded', (event) => {
  console.log('Strategy reloaded:', event.strategyId);
});
```

## Configuration

### StrategyManagerConfig

```typescript
interface StrategyManagerConfig {
  /** Enable file watching for hot-reload */
  watchEnabled?: boolean;
  
  /** Debounce delay for file changes (ms) */
  debounceDelayMs?: number;
  
  /** Automatically reload on config changes */
  autoReload?: boolean;
  
  /** Directory to watch for strategy source files */
  watchDirectory?: string;
}
```

**Default values:**
- `watchEnabled`: `false`
- `debounceDelayMs`: `500`
- `autoReload`: `true`
- `watchDirectory`: `apps/backend/src/trading/strategies`

## API Methods

### Loading Strategies

```typescript
// Load a single strategy
const strategy = await manager.loadStrategy(config);

// Load multiple strategies
const strategies = await manager.loadStrategies(configs);
```

### Retrieving Strategies

```typescript
// Get strategy by ID
const strategy = manager.getStrategy('arbitrage-1');

// Get strategy with metadata
const instance = manager.getStrategyInstance('arbitrage-1');

// Get all strategies
const allStrategies = manager.getAllStrategies();
const allInstances = manager.getAllStrategyInstances();
```

### Reloading Strategies

```typescript
// Reload with existing config
await manager.reloadStrategy('arbitrage-1');

// Reload with new config
await manager.reloadStrategy('arbitrage-1', newConfig);

// Reload all strategies
const instances = manager.getAllStrategyInstances();
for (const [id] of instances) {
  await manager.reloadStrategy(id);
}
```

### File Watching

```typescript
// Start watching (if watchEnabled is true)
await manager.startWatching();

// Stop watching
await manager.stopWatching();

// Check if watching
const isWatching = manager.isWatchingActive();
```

### Cleanup

```typescript
// Cleanup all resources
await manager.cleanup();
```

## Events

The StrategyManager emits events for monitoring:

### strategyLoaded

Emitted when a strategy is loaded.

```typescript
manager.on('strategyLoaded', (event) => {
  console.log(event.strategyId);
  console.log(event.version);
  console.log(event.timestamp);
});
```

### strategyReloaded

Emitted when a strategy is reloaded.

```typescript
manager.on('strategyReloaded', (event) => {
  console.log(event.strategyId);
  console.log(event.oldVersion);
  console.log(event.newVersion);
  console.log(event.reloadCount);
  console.log(event.timestamp);
});
```

### strategyUnloaded

Emitted when a strategy is unloaded.

```typescript
manager.on('strategyUnloaded', (event) => {
  console.log(event.strategyId);
  console.log(event.timestamp);
});
```

### strategyError

Emitted when a strategy operation fails.

```typescript
manager.on('strategyError', (event) => {
  console.error(event.strategyId);
  console.error(event.error);
  console.error(event.context); // 'load' or 'reload'
  console.error(event.timestamp);
});
```

### fileChanged

Emitted when a strategy source file changes.

```typescript
manager.on('fileChanged', (event) => {
  console.log(event.filename);
  console.log(event.path);
  console.log(event.timestamp);
});
```

### reloadRecommended

Emitted when file changes suggest a reload (when `autoReload` is false).

```typescript
manager.on('reloadRecommended', (event) => {
  console.log(event.strategyId);
  console.log(event.filename);
  console.log(event.reason);
  console.log(event.timestamp);
});
```

### watchingStarted / watchingStopped

Emitted when file watching starts or stops.

```typescript
manager.on('watchingStarted', () => {
  console.log('File watching started');
});

manager.on('watchingStopped', () => {
  console.log('File watching stopped');
});
```

## REST API Endpoints

### GET /api/strategies

List all loaded strategies.

**Response:**
```json
{
  "success": true,
  "count": 3,
  "strategies": [
    {
      "strategyId": "arbitrage-1",
      "type": "arbitrage",
      "name": "Arbitrage",
      "version": "1.0.0",
      "enabled": true,
      "loadedAt": "2026-02-19T17:00:00.000Z",
      "reloadCount": 0,
      "metrics": {
        "trades": 0,
        "winRate": 0,
        "pnl": 0
      }
    }
  ]
}
```

### GET /api/strategies/:id

Get details for a specific strategy.

**Response:**
```json
{
  "success": true,
  "strategy": {
    "strategyId": "arbitrage-1",
    "type": "arbitrage",
    "name": "Arbitrage",
    "version": "1.0.0",
    "description": "Intra-market arbitrage strategy",
    "enabled": true,
    "config": { /* full config */ },
    "loadedAt": "2026-02-19T17:00:00.000Z",
    "reloadCount": 2,
    "metrics": { /* metrics */ },
    "hasPreviousVersion": true
  }
}
```

### POST /api/strategies/reload/:id

Reload a specific strategy.

**Request Body (optional):**
```json
{
  "strategyId": "arbitrage-1",
  "type": "arbitrage",
  "enabled": true,
  "params": { /* updated params */ }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Strategy arbitrage-1 reloaded successfully",
  "strategy": {
    "strategyId": "arbitrage-1",
    "name": "Arbitrage",
    "version": "1.0.0",
    "reloadCount": 3
  }
}
```

### POST /api/strategies/reload-all

Reload all strategies.

**Response:**
```json
{
  "success": true,
  "message": "Reloaded 3 of 3 strategies",
  "successCount": 3,
  "failureCount": 0,
  "results": [
    { "strategyId": "arbitrage-1", "success": true },
    { "strategyId": "mean-reversion-1", "success": true },
    { "strategyId": "market-making-1", "success": true }
  ]
}
```

### DELETE /api/strategies/:id

Unload a strategy.

**Response:**
```json
{
  "success": true,
  "message": "Strategy arbitrage-1 unloaded successfully"
}
```

### GET /api/strategies/watching

Get file watching status.

**Response:**
```json
{
  "success": true,
  "watching": true
}
```

### POST /api/strategies/watching/start

Start file watching.

**Response:**
```json
{
  "success": true,
  "message": "Strategy file watching started"
}
```

### POST /api/strategies/watching/stop

Stop file watching.

**Response:**
```json
{
  "success": true,
  "message": "Strategy file watching stopped"
}
```

## How It Works

### File Watching

The StrategyManager uses Node.js's `fs.watch()` to monitor the strategies directory:

1. **File changes detected**: When a `.ts` file changes (excluding `.test.ts`)
2. **Debouncing**: Changes are debounced to avoid multiple rapid reloads
3. **Auto-reload**: If `autoReload` is true, matching strategies are flagged for reload
4. **Event emission**: Events are emitted for external handling

### State Preservation

When a strategy is reloaded:

1. **Previous instance saved**: The old instance is stored in `previousInstance`
2. **New instance created**: StrategyFactory creates a new instance
3. **Rollback on error**: If reload fails, the old instance remains active
4. **Reload counter**: Tracks how many times a strategy has been reloaded

### Rollback Mechanism

If a reload fails:

1. The error is logged
2. The previous instance continues to run
3. A `strategyError` event is emitted
4. The reload attempt is recorded

## Limitations

### Dynamic Module Reloading

Currently, the hot-reload system can:
- ✅ Reload strategy **configuration**
- ✅ Preserve strategy **state** (reload counter, history)
- ✅ Watch for **file changes**
- ❌ Dynamically **re-import** changed TypeScript files

To reload actual code changes:
1. The file watcher detects changes and emits events
2. You must manually restart the process or use a process manager
3. Or: Implement dynamic module reloading (requires `import()` and module cache clearing)

### Workaround

For now, to reload code changes:

**Option 1: Process Manager (Recommended)**
Use PM2 or similar with watch mode:
```bash
pm2 start npm --name "polymarket-bot" -- run dev --watch
```

**Option 2: Manual Restart**
When the `reloadRecommended` event fires, restart the process.

**Option 3: Strategy Factory Re-registration**
Manually re-register strategy types after code changes:
```typescript
// After code change
StrategyFactory.unregister('arbitrage');
StrategyFactory.register({ /* new registration */ });
```

## Best Practices

### 1. Use Configuration-Based Changes

Prefer changing strategy **parameters** over **code** when possible:

```typescript
// Good: Update params
await manager.reloadStrategy('arbitrage-1', {
  ...config,
  params: { minProfitBps: 75 }, // Changed from 50
});

// Requires restart: Code changes
// Edit ArbitrageStrategy.ts
```

### 2. Handle Reload Errors

Always listen for errors and handle gracefully:

```typescript
manager.on('strategyError', (event) => {
  alerting.send(`Strategy ${event.strategyId} failed: ${event.error}`);
  // Optionally: disable strategy, retry later, etc.
});
```

### 3. Test in Paper Mode

Test hot-reload with paper trading before live:

```typescript
// Paper mode - safe to experiment
const manager = new StrategyManager({ watchEnabled: true });

// After testing, deploy to production
```

### 4. Monitor Reload Count

Track reload frequency to detect issues:

```typescript
const instance = manager.getStrategyInstance('arbitrage-1');
if (instance.reloadCount > 10) {
  console.warn('Strategy has been reloaded many times, check for issues');
}
```

### 5. Use Version Control

Keep strategy configurations in version control:

```json
// config/strategies.json
[
  {
    "strategyId": "arbitrage-1",
    "type": "arbitrage",
    "enabled": true,
    "params": {
      "minProfitBps": 50,
      "feeRate": 0.02
    }
  }
]
```

## Troubleshooting

### File changes not detected

**Cause**: File watching not enabled or directory incorrect

**Solution**:
```typescript
const manager = new StrategyManager({
  watchEnabled: true,
  watchDirectory: path.resolve(__dirname, '../strategies'),
});
await manager.startWatching();
```

### Reload fails silently

**Cause**: No error listener configured

**Solution**:
```typescript
manager.on('strategyError', (event) => {
  console.error('Reload failed:', event);
});
```

### Strategies not updating

**Cause**: Code changes require process restart

**Solution**: Use process manager with watch mode or manually restart.

### Multiple reloads triggering

**Cause**: Debounce delay too short

**Solution**:
```typescript
const manager = new StrategyManager({
  debounceDelayMs: 1000, // Increase to 1 second
});
```

## Examples

See:
- `apps/backend/examples/strategyHotReload.ts` - Interactive demo
- `apps/backend/tests/unit/strategyManager.test.ts` - Unit tests
- `apps/backend/tests/integration/strategyManagerIntegration.test.ts` - Integration tests

## Next Steps

- Review the [Strategy Framework](./ARCHITECTURE.md#strategy-framework) documentation
- See [Multi-Strategy Orchestration](../STATUS.md) for coordinating multiple strategies
- Check [Common Pitfalls](./ai/common-pitfalls.md) for trading bot gotchas
