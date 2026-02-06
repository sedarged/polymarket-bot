# Learning System Design Report

**Date:** 2026-02-01  
**Status:** Implemented (PR-008, PR-009)  
**Scope:** Evidence-based learning and experimentation system for the Polymarket trading bot (paper trading only)

**Implementation Status:**
- ✅ **PR-008:** Event store, signal catalog, backtest engine
- ✅ **PR-009:** Bandit allocation, metrics gating, promotion workflow

---

## Executive Summary

This report defines a safe, evidence-based learning and experimentation system that operates **exclusively in paper trading mode**. The system captures market events, strategy decisions, and execution outcomes in a dedicated event store, evaluates strategies offline, and enables controlled, observable experiments using bandit-based allocation. Promotion criteria are defined to gate strategies from experimental status to candidate status without ever enabling live trading.

Key outcomes:
- A unified **Data Event Store** schema for market events, signals, decisions, executions, and metrics.
- A **Feature/Signal Catalog** with standardized definitions and metadata.
- An **Offline Evaluation Framework** with reproducible backtesting and metrics.
- A **Bandit/Allocation** design for paper-only experimentation and A/B testing. ✅ **Implemented**
- **Promotion criteria** and governance for strategy advancement. ✅ **Implemented**
- Integration points with existing paper trading engine, data ingestion, and dashboard UI (#30).

**Documentation:**
- Implementation guide: [docs/learning-system-allocation.md](../docs/learning-system-allocation.md)
- Module README: [apps/backend/src/learning/README.md](../apps/backend/src/learning/README.md)

---

## 1. System Architecture Overview

### Goals
- Capture a complete, auditable record of strategy inputs, decisions, and outcomes.
- Enable reproducible offline evaluation against historical data.
- Support online experimentation through paper trading only.
- Provide observability for strategy performance and experimentation outcomes.
- Ensure safe operation with fail-closed gating (no live trading).

### Non-Goals
- No live trading execution.
- No automatic promotion to live trading.
- No external data acquisition beyond existing feeds (can be added later).

### High-Level Components
1. **Market Data Ingestion**
   - WebSocket + REST snapshots
   - Normalized into event store
2. **Feature/Signal Engine**
   - Transforms market data into standardized features
3. **Strategy Decision Engine**
   - Generates decisions with associated metadata
4. **Paper Trading Execution**
   - Simulated order placement and fills
5. **Experiment Orchestrator**
   - Allocation logic and A/B testing
6. **Evaluation & Metrics**
   - Offline and online performance scoring
7. **Observability & Dashboard**
   - Metrics export and visualization hooks

---

## 2. Data Event Store Design

The data event store is the system of record for learning, experimentation, and auditability. Every event is immutable and time-stamped.

### Storage Strategy
- **Append-only log** for events with partitioning by market_id and day.
- **Hot storage** for last 30–90 days (for online evaluation).
- **Cold storage** for older events, retained for offline research.
- **Schema evolution** via versioned event types.

### Event Envelope (Common Fields)
```ts
interface EventEnvelope<T> {
  eventId: string; // UUID
  eventType: string; // e.g. MarketEvent, SignalEvent
  eventVersion: number;
  occurredAt: string; // ISO timestamp
  receivedAt: string; // ISO timestamp
  marketId: string;
  source: 'websocket' | 'rest' | 'strategy' | 'simulation';
  payload: T;
}
```

### Core Event Schemas

#### Market Event
```ts
interface MarketEvent {
  marketStatus: 'open' | 'closed' | 'resolved';
  bestBid: number;
  bestAsk: number;
  mid: number;
  spread: number;
  liquidity: number; // aggregate depth in top N levels
  orderBookSnapshotId?: string;
  tickSize: number;
}
```

#### Order Book Update
```ts
interface OrderBookUpdateEvent {
  snapshotId: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  sequenceNumber: number;
}
```

#### Signal Event
```ts
interface SignalEvent {
  signalId: string;
  signalName: string;
  signalValue: number | string | boolean;
  signalVersion: string;
  featureSetId: string;
  metadata: Record<string, unknown>;
}
```

#### Strategy Decision
```ts
interface StrategyDecisionEvent {
  strategyId: string;
  strategyVersion: string;
  decisionId: string;
  action: 'place_order' | 'cancel_order' | 'hold';
  rationale: string;
  confidence: number; // 0..1
  inputs: Record<string, unknown>; // references signals/features
  constraints: Record<string, unknown>; // risk limits
}
```

#### Execution Outcome (Paper Trading Only)
```ts
interface ExecutionOutcomeEvent {
  decisionId: string;
  simulatedOrderId: string;
  status: 'accepted' | 'rejected' | 'partial_fill' | 'filled';
  requested: { side: 'buy' | 'sell'; price: number; size: number };
  executed: { price: number; size: number };
  fees: number; // paper-only simulated fees
  latencyMs: number;
  rejectionReason?: string;
}
```

#### Performance Metric Event
```ts
interface PerformanceMetricEvent {
  strategyId: string;
  window: '1h' | '4h' | '1d' | '7d' | '30d';
  pnl: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  turnover: number;
  inventoryUtilization: number;
}
```

#### Experiment Result Event
```ts
interface ExperimentResultEvent {
  experimentId: string;
  strategyId: string;
  cohort: 'control' | 'treatment';
  startAt: string;
  endAt: string;
  allocation: number; // fraction of paper capital
  metrics: {
    pnl: number;
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
  };
  notes?: string;
}
```

---

## 3. Feature/Signal Catalog

Signals are registered in a catalog to enforce consistent definitions and versioning.

### Signal Metadata Schema
```ts
interface SignalDefinition {
  signalName: string;
  description: string;
  featureGroup: 'market' | 'liquidity' | 'volatility' | 'strategy' | 'risk';
  inputFields: string[];
  outputType: 'number' | 'boolean' | 'string';
  defaultWindow?: string; // e.g. 5m, 1h
  version: string;
  owner: string;
}
```

### Example Signals
| Signal | Description | Output | Notes |
| --- | --- | --- | --- |
| `mid_price` | Midpoint of best bid/ask | number | Primary price reference |
| `spread_bps` | Spread in basis points | number | Liquidity indicator |
| `short_term_volatility` | Std dev of mid over 5m | number | Used for adaptive spreads |
| `order_imbalance` | (bid depth - ask depth) / total | number | Directional pressure |
| `inventory_ratio` | Position size / max allocation | number | Risk gating |
| `fill_rate` | Fills / orders over window | number | Strategy effectiveness |

---

## 4. Offline Evaluation Framework

### Objectives
- Reproducible backtesting on historical event logs.
- Comparable metrics across strategies.
- Scenario testing (market regimes, volatility spikes, illiquid markets).

### Evaluation Pipeline
1. **Data Selection**: Choose date range, markets, and regime filters.
2. **Replay Engine**: Deterministic replay of event store logs.
3. **Strategy Simulation**: Run strategies on replayed data.
4. **Outcome Measurement**: Compute metrics per strategy.
5. **Report Generation**: Standardized summary output.

### Core Metrics
- **PnL** (net profit/loss)
- **Sharpe Ratio** (risk-adjusted return)
- **Max Drawdown**
- **Win Rate**
- **Turnover**
- **Inventory Utilization** (capital efficiency)
- **Latency Sensitivity** (performance under lag simulation)

### Reproducibility Controls
- Fixed seeds for stochastic components.
- Version-locked feature definitions.
- Immutable data snapshots.

---

## 5. Experimentation Capabilities (Paper Trading Only)

### A/B Testing & Gradual Rollout
- **A/B testing** uses experiment cohorts (control vs treatment) logged in the event store.
- **Gradual rollout** is achieved via allocation weights (e.g., 10% → 25% → 50%).
- **Manual evaluation** is supported by experiment reports and review checklists.
- **Automated evaluation** is supported through scheduled metric aggregation jobs.

---

## 6. Bandit & Allocation Logic (Paper Trading Only)

### Objective
Allocate paper trading capital across competing strategies to explore and exploit promising candidates without risking real funds.

### Candidate Algorithms
- **Epsilon-Greedy**: Simple exploration vs exploitation.
- **UCB1**: Upper confidence bound for exploration.
- **Thompson Sampling**: Bayesian probability of optimality.

### Allocation Inputs
- Recent performance metrics (PnL, Sharpe, drawdown).
- Risk constraints (inventory limits, max exposure).
- Strategy reliability (error rate, stability).

### Allocation Outputs
- Per-strategy capital allocation (paper only).
- Per-strategy market selection.
- Experiment metadata for auditability.

### Example Allocation Rule
```
score = (sharpe * 0.5) + (pnl_norm * 0.3) - (drawdown_norm * 0.2)
allocation = softmax(score, explorationFactor)
```

---

## 7. Promotion Criteria & Governance

Promotion criteria are **paper-only**. Promotion means a strategy can move from experimental to candidate status, not to live trading.

### Required Metrics
- Positive PnL over 30-day window.
- Sharpe ratio > 1.0.
- Max drawdown < 10% of allocated paper capital.
- Error rate < 1% (execution rejections, data errors).
- Stable performance across at least two market regimes.

### Promotion Workflow
1. Strategy flagged as **candidate**.
2. Manual review of metrics and logs.
3. Approval recorded in report or issue.
4. Strategy added to “candidate pool” for continued paper trading.

---

## 8. Integration Plan

### Paper Trading Engine
- Strategy decisions flow into the existing paper trading simulator.
- Execution outcomes are logged to the event store.
- Risk manager validates decisions before simulation.

### Trading Engine & Strategy Interfaces
- Each strategy must implement:
  - `generateSignals()`
  - `decide()`
  - `onFill()`
- Decision and signal outputs are recorded with strict schemas.

### Dashboard UI (#30)
- Expose performance metrics via API endpoint or shared data store.
- Provide charts for PnL, drawdown, allocation, and signal impact.
- Visualize experiment allocation and strategy promotion status.

### Storage & Retrieval
- Event store abstracts into a queryable API for backtesting.
- Retention policies applied by storage tier.

### Data Flow & Storage Approach
1. WebSocket/REST ingestion writes `MarketEvent` and `OrderBookUpdateEvent`.
2. Feature engine writes `SignalEvent` and ties signals to `featureSetId`.
3. Strategies write `StrategyDecisionEvent` and reference input signals.
4. Paper trading simulator writes `ExecutionOutcomeEvent`.
5. Metric aggregation writes `PerformanceMetricEvent` and `ExperimentResultEvent`.
6. Offline evaluator reads immutable event logs for backtests.

---

## 9. Schema Definitions (Detailed)

### Market Event Schema
```ts
interface MarketEventRecord {
  eventId: string;
  marketId: string;
  timestamp: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  liquidity: number;
  tickSize: number;
  source: 'websocket' | 'rest';
}
```

### Trading Signal Schema
```ts
interface TradingSignalRecord {
  signalId: string;
  marketId: string;
  timestamp: string;
  signalName: string;
  signalValue: number | string | boolean;
  signalVersion: string;
  features: Record<string, unknown>;
}
```

### Strategy Decision Schema
```ts
interface StrategyDecisionRecord {
  decisionId: string;
  strategyId: string;
  strategyVersion: string;
  timestamp: string;
  action: 'place_order' | 'cancel_order' | 'hold';
  confidence: number;
  rationale: string;
  inputs: Record<string, unknown>;
}
```

### Execution Outcome Schema
```ts
interface ExecutionOutcomeRecord {
  decisionId: string;
  simulatedOrderId: string;
  status: 'accepted' | 'rejected' | 'partial_fill' | 'filled';
  requested: { side: 'buy' | 'sell'; price: number; size: number };
  executed: { price: number; size: number };
  fees: number; // paper-only simulated fees
  latencyMs: number;
  rejectionReason?: string;
}
```

### Performance Metrics Schema
```ts
interface PerformanceMetricsRecord {
  strategyId: string;
  timestamp: string;
  window: '1h' | '4h' | '1d' | '7d' | '30d';
  pnl: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  turnover: number;
  inventoryUtilization: number;
}
```

---

## 10. Compliance & Safety

- **Paper trading only**: All executions are simulated. No live trading APIs are invoked by the learning system.
- **Fail closed**: If required configuration is missing, strategy execution halts.
- **No secrets**: Event store contains no private keys or credentials.
- **Auditability**: All decisions and outcomes are logged for review.

---

## 11. Next Steps

1. Implement event store writer with versioned schema validation.
2. Add replay engine for offline evaluation.
3. Implement strategy catalog and signal registry.
4. Build dashboard hooks for experiment visualization.
5. Review promotion criteria with project owner.

---

## Appendix: Integration Checklist

- [ ] Event store interfaces defined in shared types
- [ ] Paper trading engine emits execution outcomes
- [ ] Strategy interface updated with signal + decision hooks
- [ ] Offline evaluation pipeline scaffolding
- [ ] Dashboard metrics endpoints
- [ ] Compliance review (paper-only)
