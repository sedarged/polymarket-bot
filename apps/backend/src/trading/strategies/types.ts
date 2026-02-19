/**
 * Trading Strategy Types and Interfaces
 * 
 * Defines the core abstractions for trading strategies:
 * - Strategy interface for implementing trading logic
 * - Strategy configuration types
 * - Market context and signal inputs
 * - Trading decision outputs
 * 
 * Follows the Strategy pattern for extensibility.
 */

/**
 * Market context provided to strategies for decision making
 */
export interface MarketContext {
  /** Market identifier */
  marketId: string;
  /** Token ID for the outcome */
  tokenId: string;
  /** Current best bid price (0-1) */
  bestBid: number;
  /** Current best ask price (0-1) */
  bestAsk: number;
  /** Mid price ((bid + ask) / 2) */
  mid: number;
  /** Spread (ask - bid) */
  spread: number;
  /** Available liquidity at best prices */
  liquidity: {
    bidSize: number;
    askSize: number;
  };
  /** Current timestamp */
  timestamp: string;
  /** Optional orderbook snapshot */
  orderBook?: {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  };
}

/**
 * Current position information
 */
export interface Position {
  /** Token ID */
  tokenId: string;
  /** Current position size (positive = long, negative = short) */
  size: number;
  /** Average entry price */
  avgPrice: number;
  /** Unrealized PnL */
  unrealizedPnl: number;
  /** Realized PnL */
  realizedPnl: number;
}

/**
 * Trading decision output from strategy
 */
export interface TradingDecision {
  /** Action to take */
  action: 'buy' | 'sell' | 'hold' | 'cancel';
  /** Price for the order (if placing) */
  price?: number;
  /** Size for the order (if placing) */
  size?: number;
  /** Side for the order */
  side?: 'BUY' | 'SELL';
  /** Confidence level (0-1) */
  confidence: number;
  /** Human-readable rationale */
  rationale: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Strategy configuration base
 */
export interface StrategyConfig {
  /** Unique strategy identifier */
  strategyId: string;
  /** Strategy type/name */
  type: string;
  /** Strategy-specific parameters */
  params: Record<string, unknown>;
  /** Enabled flag */
  enabled: boolean;
}

/**
 * Core strategy interface
 * All trading strategies must implement this interface
 */
export interface IStrategy {
  /** Unique strategy identifier */
  readonly id: string;
  
  /** Strategy name/type */
  readonly name: string;
  
  /** Strategy version */
  readonly version: string;
  
  /** Strategy description */
  readonly description: string;
  
  /**
   * Initialize the strategy with configuration
   * Called once when strategy is instantiated
   */
  initialize(config: StrategyConfig): Promise<void>;
  
  /**
   * Evaluate market conditions and make a trading decision
   * Called on each market update
   * 
   * @param context - Current market state
   * @param position - Current position (if any)
   * @returns Trading decision
   */
  evaluate(context: MarketContext, position?: Position): Promise<TradingDecision>;
  
  /**
   * Update strategy with new signals/data
   * Optional hook for strategies that use external signals
   * 
   * @param signals - Signal data
   */
  updateSignals?(signals: Record<string, unknown>): void;
  
  /**
   * Cleanup resources when strategy is stopped
   */
  cleanup?(): Promise<void>;
  
  /**
   * Get current strategy configuration
   */
  getConfig(): StrategyConfig;
  
  /**
   * Get strategy performance metrics
   */
  getMetrics?(): {
    trades: number;
    winRate: number;
    pnl: number;
    sharpe?: number;
  };
}

/**
 * Strategy factory registration entry
 */
export interface StrategyRegistration {
  /** Strategy type identifier */
  type: string;
  /** Strategy class constructor */
  factory: () => IStrategy;
  /** Strategy description */
  description: string;
  /** Default configuration */
  defaultConfig: Partial<StrategyConfig>;
}
