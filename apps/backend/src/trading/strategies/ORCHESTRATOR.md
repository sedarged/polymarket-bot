# Multi-Strategy Orchestration

The `StrategyOrchestrator` coordinates multiple trading strategies running in parallel with state isolation and conflict detection.

## Features

- **Parallel Execution**: Run multiple strategies simultaneously
- **State Isolation**: Each strategy maintains its own position and state
- **Conflict Detection**: Automatically detect when strategies disagree
- **Conflict Resolution**: Three resolution modes (highest-confidence, first-wins, merge)
- **Per-Strategy Metrics**: Track performance and execution stats independently
- **Strategy Boundaries**: Clear logging showing which strategy made which decision

## Usage

### Basic Setup

```typescript
import { StrategyOrchestrator, StrategyFactory, registerStrategies } from './trading/strategies';

// Register all built-in strategies
registerStrategies();

// Create orchestrator
const orchestrator = new StrategyOrchestrator({
  maxStrategies: 10,
  enableConflictDetection: true,
  conflictResolution: 'highest-confidence',
  enableStateIsolation: true,
});

// Create strategies
const strategies = await StrategyFactory.createAll([
  {
    strategyId: 'arb-1',
    type: 'arbitrage',
    enabled: true,
    params: { minProfitBps: 50 },
  },
  {
    strategyId: 'mr-1',
    type: 'mean-reversion',
    enabled: true,
    params: { lookbackPeriod: 20 },
  },
]);

// Add strategies to orchestrator
for (const strategy of strategies) {
  await orchestrator.addStrategy(strategy);
}
```

### Evaluating Strategies

```typescript
// Simple evaluation - get all decisions
const results = await orchestrator.evaluateAll(marketContext);

results.forEach(result => {
  console.log(`${result.strategyName}: ${result.decision.action} (confidence: ${result.decision.confidence})`);
});

// Evaluation with conflict detection and resolution
const result = await orchestrator.evaluateWithConflictDetection(marketContext);

if (result.hasConflicts) {
  console.log('Conflicts detected:', result.conflicts);
  console.log('Resolved decision:', result.resolvedDecision);
}
```

### State Isolation

```typescript
// Update positions independently for each strategy
orchestrator.updateStrategyPosition('arb-1', tokenId, {
  tokenId,
  size: 100,
  avgPrice: 0.50,
  unrealizedPnl: 10,
  realizedPnl: 5,
});

orchestrator.updateStrategyPosition('mr-1', tokenId, {
  tokenId,
  size: -50,
  avgPrice: 0.52,
  unrealizedPnl: -5,
  realizedPnl: 2,
});

// Get isolated state
const arbState = orchestrator.getStrategyState('arb-1');
const mrState = orchestrator.getStrategyState('mr-1');

// States are completely independent
console.log('Arb position:', arbState?.positions.get(tokenId));
console.log('MR position:', mrState?.positions.get(tokenId));
```

### Metrics Tracking

```typescript
// Get stats for a specific strategy
const stats = orchestrator.getStrategyStats('arb-1');
console.log('Total evaluations:', stats?.totalEvaluations);
console.log('Success rate:', stats?.successfulEvaluations / stats?.totalEvaluations);
console.log('Average execution time:', stats?.averageExecutionTime, 'ms');

// Get all strategy stats
const allStats = orchestrator.getAllStats();
Object.entries(allStats).forEach(([strategyId, stats]) => {
  console.log(`${strategyId}: ${stats.successfulEvaluations}/${stats.totalEvaluations} successful`);
});
```

## Configuration

### StrategyOrchestratorConfig

```typescript
interface StrategyOrchestratorConfig {
  /** Maximum number of concurrent strategies (default: 10) */
  maxStrategies?: number;

  /** Enable conflict detection (default: true) */
  enableConflictDetection?: boolean;

  /** Conflict resolution strategy (default: 'highest-confidence') */
  conflictResolution?: 'highest-confidence' | 'first-wins' | 'merge';

  /** Enable state isolation tracking (default: true) */
  enableStateIsolation?: boolean;
}
```

### Conflict Resolution Modes

1. **highest-confidence**: Select the decision with the highest confidence score
2. **first-wins**: Use the first strategy's decision (useful for priority-based orchestration)
3. **merge**: Combine decisions using confidence-weighted averaging (each strategy's contribution is weighted by its confidence)

## Events

The orchestrator emits the following events:

```typescript
// Strategy lifecycle events
orchestrator.on('strategyAdded', ({ strategyId, strategyName }) => {
  console.log(`Strategy added: ${strategyName}`);
});

orchestrator.on('strategyRemoved', ({ strategyId }) => {
  console.log(`Strategy removed: ${strategyId}`);
});

// Strategy execution events
orchestrator.on('strategyError', ({ strategyId, error, context }) => {
  console.error(`Strategy ${strategyId} error in ${context}:`, error.message);
});

// Conflict detection events
orchestrator.on('conflictDetected', ({ marketId, conflicts }) => {
  console.warn(`Conflicts detected in ${marketId}:`, conflicts);
});
```

## Example: Running Multiple Strategy Types

```typescript
import { StrategyOrchestrator, StrategyFactory, registerStrategies } from './trading/strategies';

async function runMultiStrategyTrading() {
  // Setup
  registerStrategies();
  const orchestrator = new StrategyOrchestrator({
    maxStrategies: 5,
    enableConflictDetection: true,
    conflictResolution: 'highest-confidence',
  });

  // Create diverse portfolio of strategies
  const strategies = await StrategyFactory.createAll([
    {
      strategyId: 'arb-primary',
      type: 'arbitrage',
      enabled: true,
      params: { minProfitBps: 50, maxOrderSize: 100 },
    },
    {
      strategyId: 'arb-secondary',
      type: 'arbitrage',
      enabled: true,
      params: { minProfitBps: 30, maxOrderSize: 50 },
    },
    {
      strategyId: 'mr-conservative',
      type: 'mean-reversion',
      enabled: true,
      params: { lookbackPeriod: 30, entryThreshold: 2.5 },
    },
    {
      strategyId: 'mr-aggressive',
      type: 'mean-reversion',
      enabled: true,
      params: { lookbackPeriod: 10, entryThreshold: 1.5 },
    },
  ]);

  // Add all strategies
  for (const strategy of strategies) {
    await orchestrator.addStrategy(strategy);
  }

  // Market update handler
  marketFeed.on('orderbook', async (market) => {
    const marketContext = {
      marketId: market.id,
      tokenId: market.tokenId,
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      mid: (market.bestBid + market.bestAsk) / 2,
      spread: market.bestAsk - market.bestBid,
      liquidity: {
        bidSize: market.bidSize,
        askSize: market.askSize,
      },
      timestamp: new Date().toISOString(),
    };

    // Evaluate all strategies with conflict detection
    const result = await orchestrator.evaluateWithConflictDetection(marketContext);

    if (result.hasConflicts && result.resolvedDecision) {
      // Execute resolved decision
      console.log('Executing:', result.resolvedDecision.decision);
      await executeOrder(result.resolvedDecision.decision);
    }
  });

  // Cleanup on shutdown
  process.on('SIGINT', async () => {
    await orchestrator.cleanup();
    process.exit(0);
  });
}

runMultiStrategyTrading().catch(console.error);
```

## Testing

The orchestrator includes comprehensive test coverage:

- **Unit tests**: 21 tests covering all core functionality
- **Integration tests**: 7 tests with real strategy instances

Run tests:
```bash
npm test -- strategyOrchestrator.test.ts
```

## Architecture

The orchestrator maintains:

- **Strategy Registry**: Maps `config.strategyId` → `StrategyExecutionContext`
- **Isolated State**: Each strategy has its own positions, pending orders, and custom data
- **Execution Stats**: Per-strategy metrics for performance monitoring
- **Event System**: EventEmitter for lifecycle and error handling

## Best Practices

1. **Use unique strategyIds**: Even when using the same strategy type multiple times
2. **Enable conflict detection**: Catch strategy disagreements early
3. **Monitor metrics**: Track success rates and execution times
4. **Handle errors**: Listen to `strategyError` events
5. **Clean up**: Call `orchestrator.cleanup()` on shutdown
6. **State isolation**: Update positions after each trade execution
7. **Test thoroughly**: Verify strategies work independently and together

## Related Documentation

- [Strategy Framework](./README.md)
- [Strategy Factory](./StrategyFactory.ts)
- [Strategy Manager](./StrategyManager.ts) - Hot-reload support
- [Bandit Allocator](../../learning/banditAllocator.ts) - Capital allocation
- [Common Pitfalls](../../../docs/ai/common-pitfalls.md)
