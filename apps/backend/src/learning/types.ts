/**
 * Learning System Type Definitions
 * 
 * Defines core schemas for the learning system including:
 * - Event envelopes and schemas
 * - Signal catalog definitions
 * - Performance metrics
 * - Experiment tracking
 * 
 * Design follows REPORTS/LEARNING_SYSTEM.md specification.
 */

/**
 * Event envelope - common fields for all events
 */
export interface EventEnvelope<T = unknown> {
  eventId: string; // UUID
  eventType: EventType;
  eventVersion: number;
  occurredAt: string; // ISO timestamp
  receivedAt: string; // ISO timestamp
  marketId: string;
  source: EventSource;
  payload: T;
}

export type EventType =
  | 'MarketEvent'
  | 'OrderBookUpdateEvent'
  | 'SignalEvent'
  | 'StrategyDecisionEvent'
  | 'ExecutionOutcomeEvent'
  | 'PerformanceMetricEvent'
  | 'ExperimentResultEvent';

export type EventSource = 'websocket' | 'rest' | 'strategy' | 'simulation';

/**
 * Market Event - price and liquidity snapshot
 */
export interface MarketEvent {
  marketStatus: 'open' | 'closed' | 'resolved';
  bestBid: number;
  bestAsk: number;
  mid: number;
  spread: number;
  liquidity: number; // aggregate depth in top N levels
  orderBookSnapshotId?: string;
  tickSize: number;
}

/**
 * Order Book Update Event - full orderbook snapshot
 */
export interface OrderBookUpdateEvent {
  snapshotId: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  sequenceNumber: number;
}

/**
 * Signal Event - computed feature or indicator
 */
export interface SignalEvent {
  signalId: string;
  signalName: string;
  signalValue: number | string | boolean;
  signalVersion: string;
  featureSetId: string;
  metadata: Record<string, unknown>;
}

/**
 * Strategy Decision Event - trading decision with rationale
 */
export interface StrategyDecisionEvent {
  strategyId: string;
  strategyVersion: string;
  decisionId: string;
  action: 'place_order' | 'cancel_order' | 'hold';
  rationale: string;
  confidence: number; // 0..1
  inputs: Record<string, unknown>; // references signals/features
  constraints: Record<string, unknown>; // risk limits
}

/**
 * Execution Outcome Event - paper trading execution result
 */
export interface ExecutionOutcomeEvent {
  decisionId: string;
  simulatedOrderId: string;
  status: 'accepted' | 'rejected' | 'partial_fill' | 'filled';
  requested: { side: 'buy' | 'sell'; price: number; size: number };
  executed: { price: number; size: number };
  fees: number; // paper-only simulated fees
  latencyMs: number;
  rejectionReason?: string;
}

/**
 * Performance Metric Event - strategy performance over time window
 */
export interface PerformanceMetricEvent {
  strategyId: string;
  window: '1h' | '4h' | '1d' | '7d' | '30d';
  pnl: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  turnover: number;
  inventoryUtilization: number;
}

/**
 * Experiment Result Event - A/B test or allocation experiment outcome
 */
export interface ExperimentResultEvent {
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

/**
 * Signal Definition - catalog entry for a signal/feature
 */
export interface SignalDefinition {
  signalName: string;
  description: string;
  featureGroup: 'market' | 'liquidity' | 'volatility' | 'strategy' | 'risk';
  inputFields: string[];
  outputType: 'number' | 'boolean' | 'string';
  defaultWindow?: string; // e.g. 5m, 1h
  version: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Backtest Configuration - parameters for historical replay
 */
export interface BacktestConfig {
  backtestId: string;
  strategyId: string;
  startDate: string; // ISO timestamp
  endDate: string; // ISO timestamp
  markets: string[]; // market IDs
  initialBalance: number;
  slippage: number;
  feeRate: number;
  seed?: number; // for reproducibility
}

/**
 * Backtest Result - output of backtest run
 */
export interface BacktestResult {
  backtestId: string;
  strategyId: string;
  config: BacktestConfig;
  metrics: {
    pnl: number;
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    avgTradeSize: number;
  };
  trades: Array<{
    timestamp: string;
    marketId: string;
    side: 'buy' | 'sell';
    price: number;
    size: number;
    pnl: number;
  }>;
  completedAt: string;
}

/**
 * Database row types for event store
 */

export interface EventRow {
  id: number;
  event_id: string;
  event_type: string;
  event_version: number;
  occurred_at: string;
  received_at: string;
  market_id: string;
  source: string;
  payload: string; // JSON serialized
  partition_key: string; // market_id + date for partitioning
  dedupe_key?: string | null; // Optional idempotency key (GAP-021)
}

export interface SignalDefinitionRow {
  signal_name: string;
  description: string;
  feature_group: string;
  input_fields: string; // JSON array
  output_type: string;
  default_window: string | null;
  version: string;
  owner: string;
  created_at: string;
  updated_at: string;
}

export interface BacktestRow {
  backtest_id: string;
  strategy_id: string;
  config: string; // JSON serialized
  result: string | null; // JSON serialized
  status: 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

/**
 * Bandit Allocation Types
 */

export type BanditAlgorithm = 'epsilon-greedy' | 'ucb1' | 'thompson-sampling';

export interface StrategyPerformance {
  strategyId: string;
  pnl: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  errorRate: number;
  tradeCount: number;
  lastUpdated: string;
}

export interface AllocationConfig {
  algorithm: BanditAlgorithm;
  totalCapital: number; // Total paper capital to allocate (denominated in currency units)
  explorationFactor: number; // epsilon for epsilon-greedy, c for UCB1
  minAllocation: number; // Minimum allocation fraction of totalCapital per strategy (0 to 1, e.g. 0.05 = 5%)
  maxAllocation: number; // Maximum allocation fraction of totalCapital per strategy (0 to 1, e.g. 0.5 = 50%)
  minTradeCount: number; // Minimum trades before considering allocation
}

export interface AllocationResult {
  strategyId: string;
  allocation: number; // Fraction of total capital (0 to 1)
  capitalAmount: number; // Actual capital amount
  score: number; // Algorithm-specific score
  reason: string; // Explanation for allocation
  timestamp: string;
}

export interface BanditState {
  strategyId: string;
  pulls: number; // Number of times strategy was allocated
  totalReward: number; // Cumulative reward (PnL)
  meanReward: number; // Average reward
  variance: number; // Reward variance (for Thompson Sampling)
  lastPull: string; // ISO timestamp
}

/**
 * Promotion Workflow Types
 */

export type PromotionStatus = 
  | 'experimental' // Initial state, testing phase
  | 'under-review' // Passed metrics, awaiting manual review
  | 'candidate' // Approved for continued paper trading
  | 'rejected'; // Failed criteria or review

export interface PromotionCriteria {
  minPnl: number; // Minimum PnL (default: 0 for positive)
  minSharpe: number; // Minimum Sharpe ratio (default: 1.0)
  maxDrawdown: number; // Maximum drawdown % (default: 0.1 = 10%)
  maxErrorRate: number; // Maximum error rate (default: 0.01 = 1%)
  minTradeCount: number; // Minimum number of trades (default: 30)
  minDays: number; // Minimum days of data (default: 30)
  requireMultipleRegimes: boolean; // Require performance across regimes (default: true)
}

export interface PromotionRecord {
  strategyId: string;
  status: PromotionStatus;
  metrics: StrategyPerformance;
  criteriaCheck: {
    pnlPass: boolean;
    sharpePass: boolean;
    drawdownPass: boolean;
    errorRatePass: boolean;
    tradeCountPass: boolean;
    daysPass: boolean;
    regimesPass: boolean;
    overallPass: boolean;
  };
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionWorkflowConfig {
  criteria: PromotionCriteria;
  autoFlag: boolean; // Automatically flag strategies for review when criteria met
  requireManualApproval: boolean; // If false, auto-promote to candidate when criteria met (skips under-review)
}

/**
 * Metrics Gating Types
 */

export interface MetricsThresholds {
  minSharpe: number;
  maxDrawdown: number;
  minSampleSize: number; // Minimum number of trades
  minDays: number; // Minimum days of data
  maxErrorRate: number;
}

export interface GatingResult {
  passed: boolean;
  checks: {
    sharpe: { passed: boolean; value: number; threshold: number };
    drawdown: { passed: boolean; value: number; threshold: number };
    sampleSize: { passed: boolean; value: number; threshold: number };
    days: { passed: boolean; value: number; threshold: number };
    errorRate: { passed: boolean; value: number; threshold: number };
  };
  failedChecks: string[];
  message: string;
}
