# Learning System Allocation & Governance

This document describes the bandit allocation algorithms and strategy promotion governance workflow implemented for the Polymarket trading bot's learning system.

## Overview

The learning system provides automated capital allocation across competing trading strategies and a structured governance process for promoting strategies from experimental to candidate status. All operations are **paper trading only** - no live trading is enabled by this system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Learning System                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐      ┌─────────────────┐             │
│  │ StrategyPerformance│──>──│ BanditAllocator │             │
│  │   (PnL, Sharpe,   │      │                 │             │
│  │   Drawdown, etc)  │      │  - Epsilon-Greedy│            │
│  └──────────────────┘      │  - UCB1         │             │
│                             │  - Thompson     │             │
│                             │    Sampling     │             │
│                             └─────────────────┘             │
│                                      │                       │
│                                      ▼                       │
│                            ┌────────────────┐                │
│                            │  AllocationResult│               │
│                            │  (Capital %)   │                │
│                            └────────────────┘                │
│                                                               │
│  ┌──────────────────┐      ┌─────────────────┐             │
│  │ StrategyPerformance│──>──│ MetricsGating  │             │
│  └──────────────────┘      │                 │             │
│                             │  - Sharpe ≥ 1.0│             │
│                             │  - Drawdown ≤ 10%│            │
│                             │  - Sample Size │             │
│                             └─────────────────┘             │
│                                      │                       │
│                                      ▼                       │
│                            ┌────────────────┐                │
│                            │  GatingResult  │                │
│                            │  (Pass/Fail)   │                │
│                            └────────────────┘                │
│                                      │                       │
│                                      ▼                       │
│                            ┌──────────────────┐              │
│                            │ PromotionWorkflow│              │
│                            │                  │              │
│                            │  Experimental    │              │
│                            │       ↓          │              │
│                            │  Under Review    │              │
│                            │       ↓          │              │
│                            │  Candidate       │              │
│                            └──────────────────┘              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Bandit Allocator

Allocates paper trading capital across strategies using multi-armed bandit algorithms.

#### Algorithms

**Epsilon-Greedy**
- Explores with probability ε (default: 0.1)
- Exploits best performers with probability 1-ε
- Simple and effective
- Good for stable environments

**UCB1 (Upper Confidence Bound)**
- Balances exploitation and exploration using confidence intervals
- Exploration bonus: c × √(ln(total_pulls) / strategy_pulls)
- Prioritizes uncertain strategies
- Good for systematic exploration

**Thompson Sampling**
- Bayesian approach using probability distributions
- Samples from each strategy's reward distribution
- Naturally balances exploration/exploitation
- Good for dynamic environments

#### Configuration

```typescript
const allocator = new BanditAllocator({
  algorithm: 'epsilon-greedy', // or 'ucb1', 'thompson-sampling'
  totalCapital: 10000, // Total paper capital
  explorationFactor: 0.1, // epsilon for epsilon-greedy, c for UCB1
  minAllocation: 0.05, // Min 5% per strategy
  maxAllocation: 0.5, // Max 50% per strategy
  minTradeCount: 10, // Min trades before allocation
});
```

#### Usage

```typescript
import { BanditAllocator } from './learning';

// Define strategy performance
const strategies: StrategyPerformance[] = [
  {
    strategyId: 'market-making-1',
    pnl: 500,
    sharpe: 1.5,
    maxDrawdown: 0.08,
    winRate: 0.6,
    errorRate: 0.01,
    tradeCount: 50,
    lastUpdated: new Date().toISOString(),
  },
  // ... more strategies
];

// Allocate capital
const allocations = allocator.allocate(strategies);

for (const alloc of allocations) {
  console.log(`${alloc.strategyId}: $${alloc.capitalAmount} (${(alloc.allocation * 100).toFixed(1)}%)`);
  console.log(`  Reason: ${alloc.reason}`);
}
```

#### Performance Score

Strategies are scored using a weighted combination:
```
score = (sharpe × 0.5) + (pnl_norm × 0.3) - (drawdown × 0.2)
```

### 2. Metrics Gating

Enforces performance thresholds before strategy promotion.

#### Default Thresholds

- **Sharpe Ratio:** ≥ 1.0
- **Max Drawdown:** ≤ 10%
- **Sample Size:** ≥ 30 trades
- **Time Period:** ≥ 30 days
- **Error Rate:** ≤ 1%

#### Configuration

```typescript
const gating = new MetricsGating({
  thresholds: {
    minSharpe: 1.5, // Stricter Sharpe requirement
    maxDrawdown: 0.08, // Lower drawdown tolerance
    minSampleSize: 50, // More trades required
    minDays: 60, // Longer observation period
    maxErrorRate: 0.005, // Lower error tolerance
  },
});
```

#### Usage

```typescript
import { MetricsGating } from './learning';

const gating = new MetricsGating();

const performance: StrategyPerformance = {
  strategyId: 'strategy-1',
  pnl: 500,
  sharpe: 1.5,
  maxDrawdown: 0.08,
  winRate: 0.6,
  errorRate: 0.005,
  tradeCount: 50,
  lastUpdated: new Date().toISOString(),
};

const result = gating.check(performance, 45); // 45 days since start

if (result.passed) {
  console.log('✓ All gates passed');
} else {
  console.log('✗ Failed checks:', result.failedChecks);
  for (const [name, check] of Object.entries(result.checks)) {
    if (!check.passed) {
      console.log(`  ${name}: ${check.value} (threshold: ${check.threshold})`);
    }
  }
}
```

### 3. Promotion Workflow

Manages strategy lifecycle from experimental to candidate status.

#### Status Flow

```
┌──────────────┐
│ Experimental │ ← Initial state
└──────┬───────┘
       │ Auto-flag when criteria met
       ▼
┌──────────────┐
│ Under Review │ ← Awaiting manual approval
└──────┬───────┘
       │ Manual approval/rejection
       ▼
┌──────────────┐    ┌──────────┐
│  Candidate   │    │ Rejected │
└──────────────┘    └──────────┘
   (Final states)
```

#### Configuration

```typescript
const workflow = new PromotionWorkflow({
  dbPath: './data/promotions.db',
  config: {
    autoFlag: true, // Auto-flag strategies for review
    requireManualApproval: true, // Require human approval
    criteria: {
      minPnl: 0, // Positive PnL
      minSharpe: 1.0,
      maxDrawdown: 0.1,
      maxErrorRate: 0.01,
      minTradeCount: 30,
      minDays: 30,
      requireMultipleRegimes: true, // Stable across market conditions
    },
  },
});
```

#### Usage

**Evaluate Strategy**
```typescript
import { PromotionWorkflow } from './learning';

const workflow = new PromotionWorkflow();

// Evaluate performance
const record = workflow.evaluate(
  'strategy-1',
  performance,
  daysSinceStart
);

console.log(`Status: ${record.status}`);
console.log(`Criteria passed: ${record.criteriaCheck.overallPass}`);
```

**Approve Strategy**
```typescript
// After manual review
const approved = workflow.approve(
  'strategy-1',
  'admin@example.com',
  'Excellent performance across all metrics'
);

console.log(`Promoted to: ${approved.status}`);
```

**Reject Strategy**
```typescript
const rejected = workflow.reject(
  'strategy-2',
  'admin@example.com',
  'Does not align with risk appetite'
);
```

**List Strategies**
```typescript
// All under review
const underReview = workflow.listPromotions('under-review');

// All candidates
const candidates = workflow.listPromotions('candidate');

// All promotions
const all = workflow.listPromotions();
```

**View History**
```typescript
const history = workflow.getHistory('strategy-1');

for (const event of history) {
  console.log(`${event.timestamp}: ${event.oldStatus} → ${event.newStatus}`);
  console.log(`  By: ${event.changedBy}`);
  console.log(`  Reason: ${event.reason}`);
}
```

## Governance Policies

### Promotion Criteria

A strategy must meet ALL of the following to be promoted:

1. **Performance Metrics**
   - Positive PnL over evaluation period
   - Sharpe ratio ≥ 1.0
   - Max drawdown ≤ 10% of allocated capital
   
2. **Reliability**
   - Error rate ≤ 1%
   - Min 30 trades executed
   - Min 30 days of operation
   
3. **Stability**
   - Consistent performance across market regimes
   - Win rate ≥ 45% with 50+ trades

### Manual Review

Before promotion to candidate, a human reviewer must:

1. **Verify Metrics**
   - Confirm all thresholds met
   - Check for anomalies or irregularities
   
2. **Review Strategy Logic**
   - Understand trading rationale
   - Assess risk management
   - Evaluate market fit
   
3. **Consider Context**
   - Recent market conditions
   - Competition with other strategies
   - Overall portfolio risk

4. **Document Decision**
   - Record approval/rejection reason
   - Include reviewer identity
   - Timestamp decision

### Approval Process

1. Strategy meets criteria → Auto-flagged as "Under Review"
2. Notification sent to review team
3. Manual review conducted (metrics + logic + context)
4. Decision recorded:
   - **Approve** → Promoted to "Candidate"
   - **Reject** → Marked as "Rejected" (final)
5. History logged for audit trail

## Integration with Paper Trading

The allocation and governance system integrates with the paper trading engine:

### Capital Allocation

```typescript
// 1. Get strategy performance from paper trading
const performance = paperTradingEngine.getPerformance('strategy-1');

// 2. Allocate capital across strategies
const allocations = banditAllocator.allocate([performance]);

// 3. Update strategy capital limits
for (const alloc of allocations) {
  paperTradingEngine.setCapital(alloc.strategyId, alloc.capitalAmount);
}
```

### Promotion Integration

```typescript
// 1. Evaluate strategy periodically
const record = promotionWorkflow.evaluate(
  strategyId,
  performance,
  daysSinceStart
);

// 2. If under review, send notification
if (record.status === 'under-review') {
  notificationService.send({
    to: 'admin@example.com',
    subject: `Strategy ${strategyId} ready for review`,
    body: formatPromotionRecord(record),
  });
}

// 3. After approval, maintain candidate status
// Candidate strategies continue paper trading
// NO automatic promotion to live trading
```

## Compliance & Safety

### Paper Trading Only

- **All operations are simulated**
- No live trading APIs invoked
- No real capital at risk
- Promotion to "candidate" does NOT enable live trading

### Audit Trail

- All evaluations logged to database
- Status changes tracked with timestamps
- Manual decisions recorded with reviewer identity
- Complete history available for compliance review

### Fail-Closed Design

- Missing configuration → Safe defaults applied, strategies remain experimental (no automatic promotion)
- Failing or invalid metrics → Promotion blocked, strategy kept in experimental status pending manual review
- Database errors during evaluation/promotion → No status change is applied; promotions are not persisted and must be retried or handled manually
- Manual override/review required for edge cases and to promote strategies that are blocked by safeguards

## Examples

### Example 1: Epsilon-Greedy Allocation

```typescript
import { BanditAllocator } from './learning';

const allocator = new BanditAllocator({
  algorithm: 'epsilon-greedy',
  totalCapital: 10000,
  explorationFactor: 0.1, // 10% exploration
});

const strategies: StrategyPerformance[] = [
  { strategyId: 's1', pnl: 500, sharpe: 1.5, maxDrawdown: 0.05, winRate: 0.6, errorRate: 0.01, tradeCount: 100, lastUpdated: '2026-02-06' },
  { strategyId: 's2', pnl: 200, sharpe: 1.2, maxDrawdown: 0.08, winRate: 0.55, errorRate: 0.02, tradeCount: 80, lastUpdated: '2026-02-06' },
  { strategyId: 's3', pnl: 50, sharpe: 0.8, maxDrawdown: 0.12, winRate: 0.5, errorRate: 0.01, tradeCount: 50, lastUpdated: '2026-02-06' },
];

const allocations = allocator.allocate(strategies);

// Output:
// s1: $6000 (60%) - Exploitation (best performer)
// s2: $2500 (25%) - Exploitation (second best)
// s3: $1500 (15%) - Exploration (worst, but gets some allocation)
```

### Example 2: Complete Promotion Workflow

```typescript
import { PromotionWorkflow, MetricsGating } from './learning';

const workflow = new PromotionWorkflow();

// Day 1: New strategy
let perf = { strategyId: 'mm-1', pnl: 10, sharpe: 0.5, maxDrawdown: 0.15, winRate: 0.5, errorRate: 0.02, tradeCount: 5, lastUpdated: '2026-01-01' };
let record = workflow.evaluate('mm-1', perf, 1);
console.log(record.status); // 'experimental' - not enough data

// Day 30: Meets criteria
perf = { strategyId: 'mm-1', pnl: 500, sharpe: 1.5, maxDrawdown: 0.08, winRate: 0.6, errorRate: 0.005, tradeCount: 50, lastUpdated: '2026-01-30' };
record = workflow.evaluate('mm-1', perf, 30);
console.log(record.status); // 'under-review' - auto-flagged!

// Manual review and approval
const approved = workflow.approve('mm-1', 'trader@example.com', 'Strong performance, approved for candidate pool');
console.log(approved.status); // 'candidate'

// View history
const history = workflow.getHistory('mm-1');
// Shows: experimental → under-review → candidate
```

## API Reference

See type definitions in `apps/backend/src/learning/types.ts` (re-exported from `apps/backend/src/learning/index.ts`) for complete API documentation.

## Related Documentation

- [Learning System Design](../REPORTS/LEARNING_SYSTEM.md) - Overall design specification
- [Learning System Module](../apps/backend/src/learning/README.md) - Implementation details
- [Paper Trading Guide](./paper-trading.md) - Paper trading mode

## Testing

Run tests:
```bash
npm test -- banditAllocator.test.ts metricsGating.test.ts promotionWorkflow.test.ts
```

61 comprehensive tests cover:
- All bandit algorithms
- Metrics gating thresholds
- Promotion workflow states
- Database persistence
- Edge cases and error handling
