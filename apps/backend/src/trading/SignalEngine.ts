/**
 * Signal Engine - Central signal processing and coordination
 * 
 * Implements GAP-010: Signal Generation Framework
 * 
 * Responsibilities:
 * - Collect signals from multiple strategies
 * - Prioritize and filter signals by confidence
 * - Resolve conflicts between competing signals
 * - Apply risk checks before execution
 * - Track signal performance and history
 * 
 * Architecture:
 * StrategyOrchestrator → SignalEngine → ExecutionService
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { RiskManager } from './riskManager';
import type { TradingDecision } from './strategies/types';

/**
 * Enhanced signal with metadata for processing
 */
export interface Signal {
  /** Original trading decision from strategy */
  decision: TradingDecision;
  /** Strategy that generated this signal */
  strategyId: string;
  /** Strategy name */
  strategyName: string;
  /** Market/token identifier */
  tokenId: string;
  /** When this signal was generated */
  timestamp: string;
  /** Signal quality score (0-1) */
  qualityScore: number;
  /** Additional processing metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of signal processing
 */
export interface SignalResult {
  /** The processed signal */
  signal: Signal;
  /** Was the signal approved for execution? */
  approved: boolean;
  /** Reason for approval/rejection */
  reason: string;
  /** Order ID if executed */
  orderId?: string;
}

/**
 * Configuration for SignalEngine
 */
export interface SignalEngineConfig {
  /** Enable signal processing */
  enabled: boolean;
  /** Maximum concurrent signals per token */
  maxSignalsPerToken: number;
  /** Minimum confidence threshold (0-1) */
  minConfidence: number;
  /** Conflict resolution strategy */
  conflictResolution: 'highest-confidence' | 'first-wins' | 'aggregate';
  /** Maximum signal history to retain */
  maxHistorySize?: number;
}

/**
 * Signal aggregation result
 */
interface AggregatedSignal {
  action: 'buy' | 'sell' | 'hold';
  price: number;
  size: number;
  confidence: number;
  count: number;
  strategies: string[];
}

/**
 * Signal Engine - processes and coordinates trading signals
 */
export class SignalEngine extends EventEmitter {
  private config: Required<SignalEngineConfig>;
  private riskManager: RiskManager;
  private activeSignals: Map<string, Signal[]> = new Map();
  private signalHistory: SignalResult[] = [];
  
  constructor(config: SignalEngineConfig, riskManager: RiskManager) {
    super();
    
    this.config = {
      ...config,
      maxHistorySize: config.maxHistorySize ?? 1000,
    };
    
    this.riskManager = riskManager;
    
    logger.info('SignalEngine initialized', {
      enabled: this.config.enabled,
      minConfidence: this.config.minConfidence,
      conflictResolution: this.config.conflictResolution,
      maxSignalsPerToken: this.config.maxSignalsPerToken,
    });
  }

  /**
   * Process incoming signals from strategies
   * 
   * @param signals - Array of signals to process
   * @param currentOrders - Current open orders (for risk checks)
   * @param currentPositions - Current positions (for risk checks)
   * @returns Array of processed signal results
   */
  async processSignals(
    signals: Signal[],
    currentOrders: any[] = [],
    currentPositions: any[] = []
  ): Promise<SignalResult[]> {
    if (!this.config.enabled) {
      logger.debug('SignalEngine is disabled, skipping processing');
      return [];
    }

    if (signals.length === 0) {
      return [];
    }

    logger.debug('Processing signals', { count: signals.length });

    const results: SignalResult[] = [];

    // Group signals by token
    const signalsByToken = this.groupSignalsByToken(signals);

    // Process each token's signals
    for (const [tokenId, tokenSignals] of signalsByToken) {
      // Filter by confidence threshold
      const qualifiedSignals = tokenSignals.filter(
        s => s.decision.confidence >= this.config.minConfidence
      );

      if (qualifiedSignals.length === 0) {
        logger.debug('No qualified signals for token', { tokenId });
        continue;
      }

      logger.debug('Processing qualified signals', {
        tokenId,
        count: qualifiedSignals.length,
      });

      // Resolve conflicts
      const resolvedSignals = this.resolveConflicts(qualifiedSignals);

      // Apply risk checks to each resolved signal
      for (const signal of resolvedSignals) {
        const result = await this.evaluateSignal(
          signal,
          currentOrders,
          currentPositions
        );

        results.push(result);
        this.addToHistory(result);
        
        // Emit event for monitoring
        this.emit('signalProcessed', result);
      }
    }

    return results;
  }

  /**
   * Group signals by token ID
   */
  private groupSignalsByToken(signals: Signal[]): Map<string, Signal[]> {
    const groups = new Map<string, Signal[]>();

    for (const signal of signals) {
      const existing = groups.get(signal.tokenId) || [];
      existing.push(signal);
      groups.set(signal.tokenId, existing);
    }

    return groups;
  }

  /**
   * Resolve conflicting signals for the same token
   */
  private resolveConflicts(signals: Signal[]): Signal[] {
    if (signals.length <= 1) {
      return signals;
    }

    logger.debug('Resolving signal conflicts', {
      count: signals.length,
      strategy: this.config.conflictResolution,
    });

    switch (this.config.conflictResolution) {
      case 'highest-confidence':
        return this.resolveByHighestConfidence(signals);
      
      case 'first-wins':
        return this.resolveByFirstWins(signals);
      
      case 'aggregate':
        return this.resolveByAggregation(signals);
      
      default:
        logger.warn('Unknown conflict resolution strategy, using first-wins', {
          strategy: this.config.conflictResolution,
        });
        return this.resolveByFirstWins(signals);
    }
  }

  /**
   * Resolve by selecting the signal with highest confidence
   */
  private resolveByHighestConfidence(signals: Signal[]): Signal[] {
    const highest = signals.reduce((prev, curr) =>
      curr.decision.confidence > prev.decision.confidence ? curr : prev
    );

    logger.debug('Resolved by highest confidence', {
      strategyId: highest.strategyId,
      confidence: highest.decision.confidence,
    });

    return [highest];
  }

  /**
   * Resolve by taking the first signal (FIFO)
   */
  private resolveByFirstWins(signals: Signal[]): Signal[] {
    logger.debug('Resolved by first-wins', {
      strategyId: signals[0].strategyId,
    });
    
    return [signals[0]];
  }

  /**
   * Resolve by aggregating signals into a composite signal
   */
  private resolveByAggregation(signals: Signal[]): Signal[] {
    // Separate by action
    const buySignals = signals.filter(s => s.decision.action === 'buy');
    const sellSignals = signals.filter(s => s.decision.action === 'sell');
    const holdSignals = signals.filter(s => s.decision.action === 'hold');

    // If hold signals dominate, return empty (no action)
    if (holdSignals.length > buySignals.length + sellSignals.length) {
      logger.debug('Hold signals dominate, no action', {
        holdCount: holdSignals.length,
        buyCount: buySignals.length,
        sellCount: sellSignals.length,
      });
      return [];
    }

    // Aggregate buy signals
    if (buySignals.length > sellSignals.length) {
      const aggregated = this.aggregateBuySignals(buySignals);
      logger.debug('Aggregated buy signals', {
        count: buySignals.length,
        avgConfidence: aggregated.confidence,
      });
      return [this.createAggregatedSignal(signals[0].tokenId, aggregated, buySignals)];
    }

    // Aggregate sell signals
    if (sellSignals.length > buySignals.length) {
      const aggregated = this.aggregateSellSignals(sellSignals);
      logger.debug('Aggregated sell signals', {
        count: sellSignals.length,
        avgConfidence: aggregated.confidence,
      });
      return [this.createAggregatedSignal(signals[0].tokenId, aggregated, sellSignals)];
    }

    // Conflicting signals (equal buy and sell) - cancel out
    logger.debug('Conflicting signals cancel out', {
      buyCount: buySignals.length,
      sellCount: sellSignals.length,
    });
    return [];
  }

  /**
   * Aggregate multiple buy signals
   */
  private aggregateBuySignals(signals: Signal[]): AggregatedSignal {
    const prices = signals
      .map(s => s.decision.price)
      .filter((p): p is number => p !== undefined);
    
    const sizes = signals
      .map(s => s.decision.size)
      .filter((s): s is number => s !== undefined);

    const avgPrice = prices.length > 0
      ? prices.reduce((sum, p) => sum + p, 0) / prices.length
      : 0;

    const totalSize = sizes.length > 0
      ? sizes.reduce((sum, s) => sum + s, 0)
      : 0;

    const avgConfidence = signals.reduce((sum, s) => sum + s.decision.confidence, 0) / signals.length;

    return {
      action: 'buy',
      price: avgPrice,
      size: totalSize,
      confidence: avgConfidence,
      count: signals.length,
      strategies: signals.map(s => s.strategyId),
    };
  }

  /**
   * Aggregate multiple sell signals
   */
  private aggregateSellSignals(signals: Signal[]): AggregatedSignal {
    const prices = signals
      .map(s => s.decision.price)
      .filter((p): p is number => p !== undefined);
    
    const sizes = signals
      .map(s => s.decision.size)
      .filter((s): s is number => s !== undefined);

    const avgPrice = prices.length > 0
      ? prices.reduce((sum, p) => sum + p, 0) / prices.length
      : 0;

    const totalSize = sizes.length > 0
      ? sizes.reduce((sum, s) => sum + s, 0)
      : 0;

    const avgConfidence = signals.reduce((sum, s) => sum + s.decision.confidence, 0) / signals.length;

    return {
      action: 'sell',
      price: avgPrice,
      size: totalSize,
      confidence: avgConfidence,
      count: signals.length,
      strategies: signals.map(s => s.strategyId),
    };
  }

  /**
   * Create an aggregated signal from multiple signals
   */
  private createAggregatedSignal(
    tokenId: string,
    aggregated: AggregatedSignal,
    originalSignals: Signal[]
  ): Signal {
    return {
      decision: {
        action: aggregated.action,
        price: aggregated.price,
        size: aggregated.size,
        side: aggregated.action === 'buy' ? 'BUY' : 'SELL',
        confidence: aggregated.confidence,
        rationale: `Aggregated ${aggregated.count} ${aggregated.action} signals`,
        metadata: {
          aggregated: true,
          count: aggregated.count,
          strategies: aggregated.strategies,
        },
      },
      strategyId: 'signal-engine',
      strategyName: 'SignalEngine (Aggregated)',
      tokenId,
      timestamp: new Date().toISOString(),
      qualityScore: aggregated.confidence,
      metadata: {
        aggregated: true,
        originalSignals: originalSignals.map(s => ({
          strategyId: s.strategyId,
          confidence: s.decision.confidence,
        })),
      },
    };
  }

  /**
   * Evaluate a signal against risk limits
   */
  private async evaluateSignal(
    signal: Signal,
    currentOrders: any[],
    currentPositions: any[]
  ): Promise<SignalResult> {
    // Check active signals limit per token
    const activeForToken = this.activeSignals.get(signal.tokenId) || [];
    if (activeForToken.length >= this.config.maxSignalsPerToken) {
      logger.warn('Max signals per token reached', {
        tokenId: signal.tokenId,
        limit: this.config.maxSignalsPerToken,
        strategyId: signal.strategyId,
      });
      
      return {
        signal,
        approved: false,
        reason: `Max signals per token (${this.config.maxSignalsPerToken}) reached`,
      };
    }

    // Apply risk manager checks (skip for hold/cancel actions)
    if (signal.decision.action === 'buy' || signal.decision.action === 'sell') {
      const side = signal.decision.action === 'buy' ? 'BUY' : 'SELL';
      const size = String(signal.decision.size || 0);
      
      const riskCheck = this.riskManager.checkOrder(
        signal.tokenId,
        side,
        size,
        currentOrders,
        currentPositions
      );

      if (!riskCheck.allowed) {
        logger.warn('Signal rejected by risk manager', {
          tokenId: signal.tokenId,
          strategyId: signal.strategyId,
          reason: riskCheck.reason,
        });

        return {
          signal,
          approved: false,
          reason: riskCheck.reason || 'Risk check failed',
        };
      }
    }

    // Signal approved
    activeForToken.push(signal);
    this.activeSignals.set(signal.tokenId, activeForToken);

    logger.info('Signal approved', {
      strategyId: signal.strategyId,
      tokenId: signal.tokenId,
      action: signal.decision.action,
      confidence: signal.decision.confidence,
      qualityScore: signal.qualityScore,
    });

    return {
      signal,
      approved: true,
      reason: 'Passed all checks',
    };
  }

  /**
   * Mark a signal as executed (remove from active)
   */
  markExecuted(signal: Signal, orderId?: string): void {
    const activeForToken = this.activeSignals.get(signal.tokenId) || [];
    const index = activeForToken.findIndex(
      s => s.strategyId === signal.strategyId && s.timestamp === signal.timestamp
    );

    if (index !== -1) {
      activeForToken.splice(index, 1);
      this.activeSignals.set(signal.tokenId, activeForToken);
    }

    logger.info('Signal marked as executed', {
      strategyId: signal.strategyId,
      tokenId: signal.tokenId,
      orderId,
    });

    this.emit('signalExecuted', { signal, orderId });
  }

  /**
   * Mark a signal as failed (remove from active)
   */
  markFailed(signal: Signal, error: Error): void {
    const activeForToken = this.activeSignals.get(signal.tokenId) || [];
    const index = activeForToken.findIndex(
      s => s.strategyId === signal.strategyId && s.timestamp === signal.timestamp
    );

    if (index !== -1) {
      activeForToken.splice(index, 1);
      this.activeSignals.set(signal.tokenId, activeForToken);
    }

    logger.error('Signal execution failed', {
      strategyId: signal.strategyId,
      tokenId: signal.tokenId,
      error: error.message,
    });

    this.emit('signalFailed', { signal, error });
  }

  /**
   * Add result to history
   */
  private addToHistory(result: SignalResult): void {
    this.signalHistory.push(result);

    // Trim history if needed
    if (this.signalHistory.length > this.config.maxHistorySize) {
      this.signalHistory = this.signalHistory.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Get signal performance metrics
   */
  getMetrics(): {
    total: number;
    approved: number;
    rejected: number;
    approvalRate: number;
    activeSignals: number;
    byStrategy: Record<string, { approved: number; rejected: number }>;
  } {
    const total = this.signalHistory.length;
    const approved = this.signalHistory.filter(r => r.approved).length;
    const rejected = total - approved;

    // Calculate per-strategy metrics
    const byStrategy: Record<string, { approved: number; rejected: number }> = {};
    
    for (const result of this.signalHistory) {
      const strategyId = result.signal.strategyId;
      if (!byStrategy[strategyId]) {
        byStrategy[strategyId] = { approved: 0, rejected: 0 };
      }
      
      if (result.approved) {
        byStrategy[strategyId].approved++;
      } else {
        byStrategy[strategyId].rejected++;
      }
    }

    return {
      total,
      approved,
      rejected,
      approvalRate: total > 0 ? approved / total : 0,
      activeSignals: Array.from(this.activeSignals.values()).flat().length,
      byStrategy,
    };
  }

  /**
   * Get recent signal history
   */
  getHistory(limit: number = 100): SignalResult[] {
    return this.signalHistory.slice(-limit);
  }

  /**
   * Clear all active signals (e.g., on system reset)
   */
  clearActiveSignals(): void {
    this.activeSignals.clear();
    logger.info('Cleared all active signals');
  }

  /**
   * Get configuration
   */
  getConfig(): SignalEngineConfig {
    return { ...this.config };
  }
}
