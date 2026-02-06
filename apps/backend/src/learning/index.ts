/**
 * Learning System Module
 * 
 * Exports core learning system components:
 * - EventStore: Append-only event storage for market data, signals, decisions
 * - SignalCatalog: Versioned signal/feature definitions
 * - BacktestEngine: Historical replay and strategy evaluation
 * 
 * Design follows REPORTS/LEARNING_SYSTEM.md specification.
 * Paper trading only - no live trading integration.
 */

export { EventStore } from './eventStore';
export type { EventStoreConfig, QueryOptions } from './eventStore';

export { SignalCatalog } from './signalCatalog';
export type { SignalCatalogConfig, SignalQueryOptions } from './signalCatalog';

export { BacktestEngine } from './backtestEngine';
export type { BacktestEngineConfig, BacktestMetrics } from './backtestEngine';

export type {
  EventEnvelope,
  EventType,
  EventSource,
  MarketEvent,
  OrderBookUpdateEvent,
  SignalEvent,
  StrategyDecisionEvent,
  ExecutionOutcomeEvent,
  PerformanceMetricEvent,
  ExperimentResultEvent,
  SignalDefinition,
  BacktestConfig,
  BacktestResult,
} from './types';
