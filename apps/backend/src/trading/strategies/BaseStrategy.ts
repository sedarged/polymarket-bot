/**
 * Base Strategy Class
 * 
 * Abstract base class providing common functionality for all trading strategies.
 * Implements basic lifecycle management, configuration handling, and metrics tracking.
 */

import { logger } from '../../utils/logger';
import type {
  IStrategy,
  StrategyConfig,
  MarketContext,
  Position,
  TradingDecision,
} from './types';

/**
 * Abstract base strategy class
 * Extend this class to implement custom trading strategies
 */
export abstract class BaseStrategy implements IStrategy {
  protected config!: StrategyConfig;
  protected initialized: boolean = false;
  protected metrics = {
    trades: 0,
    wins: 0,
    losses: 0,
    totalPnl: 0,
  };

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly version: string,
    public readonly description: string,
  ) {}

  /**
   * Initialize the strategy with configuration
   */
  async initialize(config: StrategyConfig): Promise<void> {
    if (this.initialized) {
      logger.warn('Strategy already initialized', { strategyId: this.id });
      return;
    }

    this.config = config;
    
    // Validate configuration
    this.validateConfig(config);
    
    // Run custom initialization
    await this.onInitialize(config);
    
    this.initialized = true;
    
    logger.info('Strategy initialized', {
      strategyId: this.id,
      strategyName: this.name,
      version: this.version,
      config: this.sanitizeConfigForLogging(config),
    });
  }

  /**
   * Evaluate market and make trading decision
   */
  async evaluate(context: MarketContext, position?: Position): Promise<TradingDecision> {
    if (!this.initialized) {
      throw new Error(`Strategy ${this.id} not initialized`);
    }

    try {
      const decision = await this.onEvaluate(context, position);
      
      // Validate decision
      this.validateDecision(decision);
      
      // Track metrics
      if (decision.action !== 'hold') {
        this.metrics.trades++;
      }
      
      logger.debug('Strategy decision', {
        strategyId: this.id,
        marketId: context.marketId,
        action: decision.action,
        confidence: decision.confidence,
        rationale: decision.rationale,
      });
      
      return decision;
    } catch (error) {
      logger.error('Strategy evaluation error', {
        strategyId: this.id,
        marketId: context.marketId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return safe default decision on error
      return {
        action: 'hold',
        confidence: 0,
        rationale: `Error during evaluation: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): StrategyConfig {
    return { ...this.config };
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const winRate = this.metrics.trades > 0
      ? this.metrics.wins / this.metrics.trades
      : 0;
    
    return {
      trades: this.metrics.trades,
      winRate,
      pnl: this.metrics.totalPnl,
    };
  }

  /**
   * Update metrics when a trade completes
   */
  protected updateTradeMetrics(pnl: number): void {
    if (pnl > 0) {
      this.metrics.wins++;
    } else if (pnl < 0) {
      this.metrics.losses++;
    }
    this.metrics.totalPnl += pnl;
  }

  /**
   * Validate strategy configuration
   * Override to add custom validation
   */
  protected validateConfig(config: StrategyConfig): void {
    if (!config.strategyId) {
      throw new Error('Strategy ID is required');
    }
    if (!config.type) {
      throw new Error('Strategy type is required');
    }
    if (typeof config.enabled !== 'boolean') {
      throw new Error('Strategy enabled flag must be boolean');
    }
  }

  /**
   * Validate trading decision
   */
  protected validateDecision(decision: TradingDecision): void {
    if (!['buy', 'sell', 'hold', 'cancel'].includes(decision.action)) {
      throw new Error(`Invalid action: ${decision.action}`);
    }
    
    if (decision.action !== 'hold' && decision.action !== 'cancel') {
      if (typeof decision.price !== 'number' || decision.price < 0 || decision.price > 1) {
        throw new Error(`Invalid price: ${decision.price}`);
      }
      if (typeof decision.size !== 'number' || decision.size <= 0) {
        throw new Error(`Invalid size: ${decision.size}`);
      }
    }
    
    if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
      throw new Error(`Invalid confidence: ${decision.confidence}`);
    }
    
    if (!decision.rationale) {
      throw new Error('Decision rationale is required');
    }
  }

  /**
   * Sanitize config for logging (remove sensitive data)
   */
  protected sanitizeConfigForLogging(config: StrategyConfig): Partial<StrategyConfig> {
    return {
      strategyId: config.strategyId,
      type: config.type,
      enabled: config.enabled,
      // Don't log full params in case they contain sensitive data
      params: { keys: Object.keys(config.params) },
    };
  }

  /**
   * Custom initialization hook
   * Override to implement strategy-specific initialization
   */
  protected abstract onInitialize(config: StrategyConfig): Promise<void>;

  /**
   * Custom evaluation hook
   * Override to implement strategy-specific trading logic
   */
  protected abstract onEvaluate(
    context: MarketContext,
    position?: Position,
  ): Promise<TradingDecision>;

  /**
   * Optional cleanup hook
   */
  async cleanup(): Promise<void> {
    logger.info('Strategy cleanup', { strategyId: this.id });
    this.initialized = false;
  }
}
