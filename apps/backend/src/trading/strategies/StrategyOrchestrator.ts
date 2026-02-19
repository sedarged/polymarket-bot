/**
 * Strategy Orchestrator - Coordinates multiple strategies running in parallel
 * 
 * Addresses GAP-013: Multi-Strategy Orchestration
 * 
 * Manages:
 * - Parallel execution of multiple strategies
 * - State isolation between strategies
 * - Cross-strategy conflict detection
 * - Per-strategy logging and tracing
 * 
 * Usage:
 * ```typescript
 * const orchestrator = new StrategyOrchestrator({ maxStrategies: 5 });
 * await orchestrator.addStrategy(strategy1);
 * await orchestrator.addStrategy(strategy2);
 * 
 * const decisions = await orchestrator.evaluateAll(marketContext);
 * ```
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import type { IStrategy, MarketContext, Position, TradingDecision, StrategyConfig } from './types';

export interface StrategyOrchestratorConfig {
  /** Maximum number of concurrent strategies */
  maxStrategies?: number;
  /** Enable conflict detection */
  enableConflictDetection?: boolean;
  /** Conflict resolution strategy */
  conflictResolution?: 'highest-confidence' | 'first-wins' | 'merge';
  /** Enable state isolation tracking */
  enableStateIsolation?: boolean;
}

export interface StrategyExecutionContext {
  /** Strategy instance */
  strategy: IStrategy;
  /** Isolated state for this strategy */
  isolatedState: StrategyState;
  /** When the strategy was added */
  addedAt: Date;
  /** Number of evaluations */
  evaluationCount: number;
  /** Execution statistics */
  stats: {
    totalEvaluations: number;
    successfulEvaluations: number;
    failedEvaluations: number;
    averageExecutionTime: number;
  };
}

export interface StrategyState {
  /** Strategy-specific data */
  data: Record<string, unknown>;
  /** Position tracking for this strategy */
  positions: Map<string, Position>;
  /** Pending orders for this strategy */
  pendingOrders: Set<string>;
  /** Last evaluation timestamp */
  lastEvaluation?: string;
  /** Last decision */
  lastDecision?: TradingDecision;
}

export interface EvaluationResult {
  /** Strategy ID */
  strategyId: string;
  /** Strategy name */
  strategyName: string;
  /** Trading decision */
  decision: TradingDecision;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Timestamp of evaluation */
  timestamp: string;
  /** Any errors encountered */
  error?: Error;
}

export interface ConflictDetectionResult {
  /** Are there conflicts? */
  hasConflicts: boolean;
  /** Conflicting strategies */
  conflicts: Array<{
    strategies: string[];
    marketId: string;
    reason: string;
  }>;
  /** Resolved decision (if applicable) */
  resolvedDecision?: EvaluationResult;
}

/**
 * Orchestrates multiple trading strategies running in parallel
 */
export class StrategyOrchestrator extends EventEmitter {
  private config: Required<StrategyOrchestratorConfig>;
  private strategies: Map<string, StrategyExecutionContext>;

  constructor(config: StrategyOrchestratorConfig = {}) {
    super();

    this.config = {
      maxStrategies: config.maxStrategies ?? 10,
      enableConflictDetection: config.enableConflictDetection ?? true,
      conflictResolution: config.conflictResolution ?? 'highest-confidence',
      enableStateIsolation: config.enableStateIsolation ?? true,
    };

    this.strategies = new Map();

    logger.info('StrategyOrchestrator initialized', {
      maxStrategies: this.config.maxStrategies,
      enableConflictDetection: this.config.enableConflictDetection,
      conflictResolution: this.config.conflictResolution,
      enableStateIsolation: this.config.enableStateIsolation,
    });
  }

  /**
   * Add a strategy to the orchestrator
   */
  async addStrategy(strategy: IStrategy): Promise<void> {
    if (this.strategies.size >= this.config.maxStrategies) {
      throw new Error(
        `Maximum number of strategies (${this.config.maxStrategies}) reached`
      );
    }

    if (this.strategies.has(strategy.id)) {
      throw new Error(`Strategy ${strategy.id} already exists`);
    }

    const context: StrategyExecutionContext = {
      strategy,
      isolatedState: this.createIsolatedState(),
      addedAt: new Date(),
      evaluationCount: 0,
      stats: {
        totalEvaluations: 0,
        successfulEvaluations: 0,
        failedEvaluations: 0,
        averageExecutionTime: 0,
      },
    };

    this.strategies.set(strategy.id, context);

    logger.info('[Orchestrator] Strategy added', {
      strategyId: strategy.id,
      strategyName: strategy.name,
      totalStrategies: this.strategies.size,
    });

    this.emit('strategyAdded', {
      strategyId: strategy.id,
      strategyName: strategy.name,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove a strategy from the orchestrator
   */
  async removeStrategy(strategyId: string): Promise<void> {
    const context = this.strategies.get(strategyId);
    if (!context) {
      logger.warn('[Orchestrator] Strategy not found for removal', { strategyId });
      return;
    }

    // Cleanup strategy
    if (context.strategy.cleanup) {
      await context.strategy.cleanup();
    }

    this.strategies.delete(strategyId);

    logger.info('[Orchestrator] Strategy removed', {
      strategyId,
      totalStrategies: this.strategies.size,
    });

    this.emit('strategyRemoved', {
      strategyId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Evaluate all strategies in parallel and return their decisions
   */
  async evaluateAll(
    context: MarketContext,
    positions?: Map<string, Position>
  ): Promise<EvaluationResult[]> {
    if (this.strategies.size === 0) {
      logger.debug('[Orchestrator] No strategies to evaluate');
      return [];
    }

    logger.debug('[Orchestrator] Evaluating all strategies', {
      marketId: context.marketId,
      strategyCount: this.strategies.size,
    });

    // Evaluate all strategies in parallel
    const evaluationPromises = Array.from(this.strategies.entries()).map(
      async ([strategyId, execContext]) => {
        return this.evaluateStrategy(strategyId, execContext, context, positions);
      }
    );

    const results = await Promise.all(evaluationPromises);

    // Log results summary
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    logger.info('[Orchestrator] Evaluation complete', {
      marketId: context.marketId,
      total: results.length,
      successful,
      failed,
      decisions: results
        .filter(r => !r.error)
        .map(r => ({
          strategyId: r.strategyId,
          action: r.decision.action,
          confidence: r.decision.confidence,
        })),
    });

    return results;
  }

  /**
   * Evaluate all strategies and detect/resolve conflicts
   */
  async evaluateWithConflictDetection(
    context: MarketContext,
    positions?: Map<string, Position>
  ): Promise<ConflictDetectionResult> {
    const results = await this.evaluateAll(context, positions);

    if (!this.config.enableConflictDetection) {
      return {
        hasConflicts: false,
        conflicts: [],
      };
    }

    // Detect conflicts - strategies wanting to trade on opposite sides
    const buyDecisions = results.filter(
      r => !r.error && (r.decision.action === 'buy' || r.decision.side === 'BUY')
    );
    const sellDecisions = results.filter(
      r => !r.error && (r.decision.action === 'sell' || r.decision.side === 'SELL')
    );

    const conflicts: ConflictDetectionResult['conflicts'] = [];

    // If we have both buy and sell signals, that's a conflict
    if (buyDecisions.length > 0 && sellDecisions.length > 0) {
      conflicts.push({
        strategies: [
          ...buyDecisions.map(d => d.strategyId),
          ...sellDecisions.map(d => d.strategyId),
        ],
        marketId: context.marketId,
        reason: 'Opposing trade directions',
      });
    }

    // If we have multiple strategies wanting to trade the same side, that's also a potential conflict
    if (buyDecisions.length > 1) {
      conflicts.push({
        strategies: buyDecisions.map(d => d.strategyId),
        marketId: context.marketId,
        reason: `Multiple buy signals (${buyDecisions.length} strategies)`,
      });
    }

    if (sellDecisions.length > 1) {
      conflicts.push({
        strategies: sellDecisions.map(d => d.strategyId),
        marketId: context.marketId,
        reason: `Multiple sell signals (${sellDecisions.length} strategies)`,
      });
    }

    const hasConflicts = conflicts.length > 0;

    if (hasConflicts) {
      logger.warn('[Orchestrator] Conflicts detected', {
        marketId: context.marketId,
        conflictCount: conflicts.length,
        conflicts,
      });

      this.emit('conflictDetected', {
        marketId: context.marketId,
        conflicts,
        timestamp: new Date().toISOString(),
      });
    }

    // Resolve conflicts if needed
    let resolvedDecision: EvaluationResult | undefined;

    if (hasConflicts) {
      resolvedDecision = this.resolveConflicts(results);
      
      logger.info('[Orchestrator] Conflict resolved', {
        marketId: context.marketId,
        resolution: this.config.conflictResolution,
        selectedStrategy: resolvedDecision?.strategyId,
        action: resolvedDecision?.decision.action,
      });
    }

    return {
      hasConflicts,
      conflicts,
      resolvedDecision,
    };
  }

  /**
   * Evaluate a single strategy with state isolation
   */
  private async evaluateStrategy(
    strategyId: string,
    execContext: StrategyExecutionContext,
    marketContext: MarketContext,
    positions?: Map<string, Position>
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    try {
      logger.debug('[Strategy] Evaluating', {
        strategyId,
        strategyName: execContext.strategy.name,
        marketId: marketContext.marketId,
        evaluationCount: execContext.evaluationCount,
      });

      // Get strategy-specific position (state isolation)
      const strategyPosition = this.config.enableStateIsolation
        ? execContext.isolatedState.positions.get(marketContext.tokenId)
        : positions?.get(marketContext.tokenId);

      // Evaluate strategy
      const decision = await execContext.strategy.evaluate(
        marketContext,
        strategyPosition
      );

      const executionTimeMs = Date.now() - startTime;

      // Update context stats
      execContext.evaluationCount++;
      execContext.stats.totalEvaluations++;
      execContext.stats.successfulEvaluations++;
      execContext.stats.averageExecutionTime =
        (execContext.stats.averageExecutionTime * (execContext.stats.successfulEvaluations - 1) +
          executionTimeMs) /
        execContext.stats.successfulEvaluations;

      // Update isolated state
      if (this.config.enableStateIsolation) {
        execContext.isolatedState.lastEvaluation = new Date().toISOString();
        execContext.isolatedState.lastDecision = decision;
      }

      logger.info('[Strategy] Decision made', {
        strategyId,
        strategyName: execContext.strategy.name,
        marketId: marketContext.marketId,
        action: decision.action,
        confidence: decision.confidence,
        rationale: decision.rationale,
        executionTimeMs,
      });

      return {
        strategyId,
        strategyName: execContext.strategy.name,
        decision,
        executionTimeMs,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      // Update stats for failure
      execContext.stats.totalEvaluations++;
      execContext.stats.failedEvaluations++;

      logger.error('[Strategy] Evaluation failed', {
        strategyId,
        strategyName: execContext.strategy.name,
        marketId: marketContext.marketId,
        error: err.message,
        executionTimeMs,
      });

      this.emit('strategyError', {
        strategyId,
        strategyName: execContext.strategy.name,
        error: err,
        context: 'evaluation',
        timestamp: new Date().toISOString(),
      });

      // Return a hold decision as fallback
      return {
        strategyId,
        strategyName: execContext.strategy.name,
        decision: {
          action: 'hold',
          confidence: 0,
          rationale: `Error during evaluation: ${err.message}`,
        },
        executionTimeMs,
        timestamp: new Date().toISOString(),
        error: err,
      };
    }
  }

  /**
   * Resolve conflicts between strategies
   */
  private resolveConflicts(results: EvaluationResult[]): EvaluationResult {
    const tradingResults = results.filter(
      r => !r.error && r.decision.action !== 'hold' && r.decision.action !== 'cancel'
    );

    if (tradingResults.length === 0) {
      // No trading decisions, return first result or create a hold
      return results[0] || this.createHoldDecision();
    }

    switch (this.config.conflictResolution) {
      case 'highest-confidence':
        return this.resolveByHighestConfidence(tradingResults);
      
      case 'first-wins':
        return tradingResults[0];
      
      case 'merge':
        return this.mergeDecisions(tradingResults);
      
      default:
        return tradingResults[0];
    }
  }

  /**
   * Resolve by selecting the decision with highest confidence
   */
  private resolveByHighestConfidence(results: EvaluationResult[]): EvaluationResult {
    return results.reduce((best, current) => {
      return current.decision.confidence > best.decision.confidence ? current : best;
    });
  }

  /**
   * Merge multiple decisions into a single decision
   * Uses weighted average based on confidence
   */
  private mergeDecisions(results: EvaluationResult[]): EvaluationResult {
    const totalConfidence = results.reduce((sum, r) => sum + r.decision.confidence, 0);

    // Count votes for buy vs sell
    const buyVotes = results.filter(
      r => r.decision.action === 'buy' || r.decision.side === 'BUY'
    );
    const sellVotes = results.filter(
      r => r.decision.action === 'sell' || r.decision.side === 'SELL'
    );

    const buyConfidence = buyVotes.reduce((sum, r) => sum + r.decision.confidence, 0);
    const sellConfidence = sellVotes.reduce((sum, r) => sum + r.decision.confidence, 0);

    // Select action based on weighted votes
    const action = buyConfidence > sellConfidence ? 'buy' : 'sell';
    const side = action === 'buy' ? 'BUY' : 'SELL';

    // Calculate merged confidence (weighted average)
    const mergedConfidence = totalConfidence > 0 ? 
      (action === 'buy' ? buyConfidence : sellConfidence) / totalConfidence : 0;

    // Calculate average price and size
    const relevantResults = action === 'buy' ? buyVotes : sellVotes;
    const avgPrice = relevantResults.length > 0
      ? relevantResults.reduce((sum, r) => sum + (r.decision.price || 0), 0) / relevantResults.length
      : undefined;
    const avgSize = relevantResults.length > 0
      ? relevantResults.reduce((sum, r) => sum + (r.decision.size || 0), 0) / relevantResults.length
      : undefined;

    return {
      strategyId: 'merged',
      strategyName: 'Merged Decision',
      decision: {
        action,
        side,
        price: avgPrice,
        size: avgSize,
        confidence: mergedConfidence,
        rationale: `Merged from ${results.length} strategies (${buyVotes.length} buy, ${sellVotes.length} sell)`,
        metadata: {
          mergedFrom: results.map(r => r.strategyId),
          buyConfidence,
          sellConfidence,
        },
      },
      executionTimeMs: Math.max(...results.map(r => r.executionTimeMs)),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create a default hold decision
   */
  private createHoldDecision(): EvaluationResult {
    return {
      strategyId: 'default',
      strategyName: 'Default',
      decision: {
        action: 'hold',
        confidence: 0,
        rationale: 'No trading decisions available',
      },
      executionTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create an isolated state for a strategy
   */
  private createIsolatedState(): StrategyState {
    return {
      data: {},
      positions: new Map(),
      pendingOrders: new Set(),
    };
  }

  /**
   * Get a strategy's isolated state
   */
  getStrategyState(strategyId: string): StrategyState | undefined {
    const context = this.strategies.get(strategyId);
    return context?.isolatedState;
  }

  /**
   * Update a strategy's position (for state isolation)
   */
  updateStrategyPosition(strategyId: string, tokenId: string, position: Position): void {
    const context = this.strategies.get(strategyId);
    if (!context) {
      logger.warn('[Orchestrator] Strategy not found for position update', { strategyId });
      return;
    }

    context.isolatedState.positions.set(tokenId, position);
    
    logger.debug('[Orchestrator] Position updated', {
      strategyId,
      tokenId,
      size: position.size,
      avgPrice: position.avgPrice,
    });
  }

  /**
   * Get all active strategies
   */
  getStrategies(): IStrategy[] {
    return Array.from(this.strategies.values()).map(ctx => ctx.strategy);
  }

  /**
   * Get strategy execution stats
   */
  getStrategyStats(strategyId: string): StrategyExecutionContext['stats'] | undefined {
    const context = this.strategies.get(strategyId);
    return context?.stats;
  }

  /**
   * Get all strategy stats
   */
  getAllStats(): Record<string, StrategyExecutionContext['stats']> {
    const stats: Record<string, StrategyExecutionContext['stats']> = {};
    for (const [id, context] of this.strategies.entries()) {
      stats[id] = context.stats;
    }
    return stats;
  }

  /**
   * Get the number of active strategies
   */
  getStrategyCount(): number {
    return this.strategies.size;
  }

  /**
   * Cleanup all strategies
   */
  async cleanup(): Promise<void> {
    logger.info('[Orchestrator] Cleaning up all strategies');

    const cleanupPromises: Promise<void>[] = [];
    
    for (const [strategyId, context] of this.strategies.entries()) {
      if (context.strategy.cleanup) {
        cleanupPromises.push(
          context.strategy.cleanup().catch(error => {
            logger.error('[Orchestrator] Error cleaning up strategy', {
              strategyId,
              error: error instanceof Error ? error.message : String(error),
            });
          })
        );
      }
    }

    await Promise.all(cleanupPromises);

    this.strategies.clear();
    this.removeAllListeners();

    logger.info('[Orchestrator] Cleanup complete');
  }
}
