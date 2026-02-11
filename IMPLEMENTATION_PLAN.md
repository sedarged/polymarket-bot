# Complete Implementation Plan
## Detailed Action Steps for All 47 Identified Gaps

**Generated:** 2026-02-11  
**Based on:** COMPREHENSIVE_GAPS_REPORT.md + Deep Code Analysis  
**Total Gaps:** 47 across 8 categories  
**Estimated Total Effort:** 12-16 weeks for complete implementation

---

## Table of Contents

1. [Critical Priority (P0) - 3 gaps - 1-2 weeks](#phase-1-critical-p0)
2. [High Priority (P1) - 12 gaps - 3-4 weeks](#phase-2-high-priority-p1)
3. [Medium Priority (P2) - 18 gaps - 4-5 weeks](#phase-3-medium-priority-p2)
4. [Low Priority (P3) - 14 gaps - 4-5 weeks](#phase-4-low-priority-p3)

---

## Phase 1: Critical (P0) - 1-2 Weeks

### GAP-009: Implement Strategy Abstraction Layer 🔴
**Priority:** P0 (Critical)  
**Effort:** 3-5 days  
**Dependencies:** None  
**Status:** Required for multi-strategy support

#### Problem
All trading logic is hardcoded in `tradingClient.ts` and `paperTradingEngine.ts`. Cannot add new strategies without major code changes. System is tightly coupled to a single trading approach.

#### Solution Design

Create abstract base class that all strategies must implement:

```typescript
// apps/backend/src/trading/StrategyBase.ts
export interface StrategyConfig {
  name: string;
  enabled: boolean;
  riskLimits?: {
    maxPositionSize?: number;
    maxOpenOrders?: number;
    maxDrawdown?: number;
  };
  parameters?: Record<string, any>;
}

export interface Signal {
  action: 'BUY' | 'SELL' | 'CANCEL' | 'HOLD';
  tokenId: string;
  price?: string;
  size?: string;
  confidence: number; // 0-1
  reason: string;
  metadata?: Record<string, any>;
}

export abstract class StrategyBase {
  protected config: StrategyConfig;
  protected logger: any;
  
  constructor(config: StrategyConfig, logger: any) {
    this.config = config;
    this.logger = logger;
  }
  
  /**
   * Called when new market data arrives
   * @returns Array of trading signals
   */
  abstract onMarketData(
    tokenId: string, 
    orderbook: Orderbook, 
    positions: Position[], 
    balance: number
  ): Promise<Signal[]>;
  
  /**
   * Called when an order is filled
   */
  abstract onFill(fill: Fill): Promise<void>;
  
  /**
   * Called when an order is rejected or cancelled
   */
  abstract onOrderUpdate(order: Order): Promise<void>;
  
  /**
   * Called on errors
   */
  abstract onError(error: Error): Promise<void>;
  
  /**
   * Initialize strategy (load historical data, etc.)
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing strategy', { name: this.config.name });
  }
  
  /**
   * Shutdown strategy (cleanup resources)
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down strategy', { name: this.config.name });
  }
  
  /**
   * Health check
   */
  isHealthy(): boolean {
    return this.config.enabled;
  }
  
  /**
   * Get strategy metrics
   */
  getMetrics(): Record<string, any> {
    return {
      name: this.config.name,
      enabled: this.config.enabled,
    };
  }
}
```

#### Step-by-Step Implementation

**Step 1: Create Strategy Base Class (1 day)**

1.1. Create `apps/backend/src/trading/StrategyBase.ts`
```bash
touch apps/backend/src/trading/StrategyBase.ts
```

1.2. Implement abstract class with methods shown above

1.3. Add exports to `apps/backend/src/trading/index.ts`
```typescript
export { StrategyBase, type StrategyConfig, type Signal } from './StrategyBase';
```

**Step 2: Create Example Strategy Implementation (1 day)**

2.1. Create `apps/backend/src/trading/strategies/SimpleMarketMaker.ts`
```typescript
import { StrategyBase, Signal } from '../StrategyBase';
import { Orderbook, Position, Fill, Order } from '@polymarket/shared';
import { logger } from '../../utils/logger';

export interface MarketMakerConfig {
  spread: number; // e.g., 0.02 = 2%
  orderSize: number; // in USDC
  maxPosition: number; // max contracts
}

export class SimpleMarketMaker extends StrategyBase {
  private config: MarketMakerConfig;
  
  constructor(strategyConfig: any, mmConfig: MarketMakerConfig) {
    super(strategyConfig, logger);
    this.config = mmConfig;
  }
  
  async onMarketData(
    tokenId: string,
    orderbook: Orderbook,
    positions: Position[],
    balance: number
  ): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    // Get current position
    const position = positions.find(p => p.tokenId === tokenId);
    const currentSize = position ? Number(position.size) : 0;
    
    // Check if we're at max position
    if (Math.abs(currentSize) >= this.config.maxPosition) {
      return signals; // No new orders
    }
    
    // Get mid price
    const bestBid = orderbook.bids[0] ? Number(orderbook.bids[0].price) : null;
    const bestAsk = orderbook.asks[0] ? Number(orderbook.asks[0].price) : null;
    
    if (!bestBid || !bestAsk) {
      return signals;
    }
    
    const midPrice = (bestBid + bestAsk) / 2;
    const halfSpread = this.config.spread / 2;
    
    // Place buy order below mid
    if (currentSize < this.config.maxPosition) {
      signals.push({
        action: 'BUY',
        tokenId,
        price: String(midPrice * (1 - halfSpread)),
        size: String(this.config.orderSize),
        confidence: 0.8,
        reason: 'Market making: buy below mid',
      });
    }
    
    // Place sell order above mid
    if (currentSize > -this.config.maxPosition) {
      signals.push({
        action: 'SELL',
        tokenId,
        price: String(midPrice * (1 + halfSpread)),
        size: String(this.config.orderSize),
        confidence: 0.8,
        reason: 'Market making: sell above mid',
      });
    }
    
    return signals;
  }
  
  async onFill(fill: Fill): Promise<void> {
    this.logger.info('Fill received', {
      strategy: this.config.name,
      side: fill.side,
      size: fill.size,
      price: fill.price,
    });
  }
  
  async onOrderUpdate(order: Order): Promise<void> {
    this.logger.debug('Order update', {
      strategy: this.config.name,
      orderId: order.orderId,
      status: order.status,
    });
  }
  
  async onError(error: Error): Promise<void> {
    this.logger.error('Strategy error', {
      strategy: this.config.name,
      error: error.message,
    });
  }
}
```

**Step 3: Create Strategy Manager (1 day)**

3.1. Create `apps/backend/src/trading/StrategyManager.ts`
```typescript
import { StrategyBase, Signal } from './StrategyBase';
import { Orderbook, Position, Fill, Order } from '@polymarket/shared';
import { logger } from '../utils/logger';

export class StrategyManager {
  private strategies: Map<string, StrategyBase> = new Map();
  private enabled: boolean = true;
  
  /**
   * Register a strategy
   */
  registerStrategy(name: string, strategy: StrategyBase): void {
    if (this.strategies.has(name)) {
      throw new Error(`Strategy ${name} already registered`);
    }
    
    this.strategies.set(name, strategy);
    logger.info('Strategy registered', { name });
  }
  
  /**
   * Initialize all strategies
   */
  async initialize(): Promise<void> {
    logger.info('Initializing strategy manager', { 
      strategies: Array.from(this.strategies.keys()) 
    });
    
    for (const [name, strategy] of this.strategies) {
      try {
        await strategy.initialize();
      } catch (error) {
        logger.error('Strategy initialization failed', {
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  
  /**
   * Get signals from all strategies for market data
   */
  async getSignals(
    tokenId: string,
    orderbook: Orderbook,
    positions: Position[],
    balance: number
  ): Promise<Signal[]> {
    if (!this.enabled) {
      return [];
    }
    
    const allSignals: Signal[] = [];
    
    for (const [name, strategy] of this.strategies) {
      if (!strategy.isHealthy()) {
        continue;
      }
      
      try {
        const signals = await strategy.onMarketData(tokenId, orderbook, positions, balance);
        
        // Tag signals with strategy name
        const taggedSignals = signals.map(s => ({
          ...s,
          metadata: { ...s.metadata, strategyName: name },
        }));
        
        allSignals.push(...taggedSignals);
      } catch (error) {
        logger.error('Strategy signal generation failed', {
          strategy: name,
          error: error instanceof Error ? error.message : String(error),
        });
        
        await strategy.onError(error as Error);
      }
    }
    
    return allSignals;
  }
  
  /**
   * Notify all strategies of a fill
   */
  async notifyFill(fill: Fill): Promise<void> {
    for (const strategy of this.strategies.values()) {
      try {
        await strategy.onFill(fill);
      } catch (error) {
        logger.error('Strategy fill notification failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  
  /**
   * Notify all strategies of an order update
   */
  async notifyOrderUpdate(order: Order): Promise<void> {
    for (const strategy of this.strategies.values()) {
      try {
        await strategy.onOrderUpdate(order);
      } catch (error) {
        logger.error('Strategy order notification failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  
  /**
   * Shutdown all strategies
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down strategy manager');
    
    for (const [name, strategy] of this.strategies) {
      try {
        await strategy.shutdown();
      } catch (error) {
        logger.error('Strategy shutdown failed', {
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    this.strategies.clear();
  }
  
  /**
   * Enable/disable all strategies
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Strategy manager enabled state changed', { enabled });
  }
  
  /**
   * Get all strategy metrics
   */
  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [name, strategy] of this.strategies) {
      metrics[name] = strategy.getMetrics();
    }
    
    return metrics;
  }
}
```

**Step 4: Integrate with Server (1 day)**

4.1. Update `apps/backend/src/server/index.ts`

Add after paper engine initialization:
```typescript
import { StrategyManager } from '../trading/StrategyManager';
import { SimpleMarketMaker } from '../trading/strategies/SimpleMarketMaker';

let strategyManager: StrategyManager | null = null;

// Initialize strategy manager (paper mode only for now)
if (!isLiveTradingEnabled()) {
  strategyManager = new StrategyManager();
  
  // Register strategies from config
  const marketMaker = new SimpleMarketMaker(
    { name: 'simple-mm', enabled: true },
    {
      spread: config.strategy?.spread || 0.02,
      orderSize: 10,
      maxPosition: config.strategy?.maxPositionSize || 100,
    }
  );
  
  strategyManager.registerStrategy('simple-mm', marketMaker);
  await strategyManager.initialize();
  
  logger.info('Strategy manager initialized');
}
```

4.2. Add strategy signals to market data handler:
```typescript
// In market feed 'update' event handler
marketFeedService.on('update', async (tokenId: string, orderbook: Orderbook) => {
  if (strategyManager && paperEngine) {
    const positions = paperEngine.getPositions();
    const balance = paperEngine.getBalance();
    
    const signals = await strategyManager.getSignals(tokenId, orderbook, positions, balance);
    
    // Execute signals
    for (const signal of signals) {
      if (signal.action === 'BUY' || signal.action === 'SELL') {
        try {
          const order = paperEngine.createOrder(
            signal.tokenId,
            signal.action,
            signal.price!,
            signal.size!
          );
          
          paperEngine.tryFillOrder(order.orderId, orderbook);
          
          logger.info('Signal executed', {
            strategy: signal.metadata?.strategyName,
            action: signal.action,
            reason: signal.reason,
          });
        } catch (error) {
          logger.error('Signal execution failed', {
            signal,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
});
```

**Step 5: Add Tests (0.5 days)**

5.1. Create `apps/backend/tests/unit/StrategyBase.test.ts`
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyBase, Signal, StrategyConfig } from '../../src/trading/StrategyBase';
import { Orderbook, Position, Fill, Order } from '@polymarket/shared';

class TestStrategy extends StrategyBase {
  async onMarketData(): Promise<Signal[]> {
    return [{
      action: 'BUY',
      tokenId: 'test',
      price: '0.5',
      size: '10',
      confidence: 1.0,
      reason: 'test',
    }];
  }
  
  async onFill(): Promise<void> {}
  async onOrderUpdate(): Promise<void> {}
  async onError(): Promise<void> {}
}

describe('StrategyBase', () => {
  it('should create strategy with config', () => {
    const config: StrategyConfig = { name: 'test', enabled: true };
    const strategy = new TestStrategy(config, console);
    expect(strategy.isHealthy()).toBe(true);
  });
  
  it('should generate signals', async () => {
    const config: StrategyConfig = { name: 'test', enabled: true };
    const strategy = new TestStrategy(config, console);
    const signals = await strategy.onMarketData('test', {} as Orderbook, [], 1000);
    expect(signals).toHaveLength(1);
    expect(signals[0].action).toBe('BUY');
  });
});
```

5.2. Create `apps/backend/tests/unit/StrategyManager.test.ts`

**Step 6: Documentation (0.5 days)**

6.1. Create `docs/strategy-framework.md`
```markdown
# Strategy Framework

## Overview
The strategy framework provides a pluggable architecture for implementing trading strategies.

## Creating a Strategy
1. Extend `StrategyBase` abstract class
2. Implement required methods: `onMarketData`, `onFill`, `onOrderUpdate`, `onError`
3. Register with `StrategyManager`

## Example
See `apps/backend/src/trading/strategies/SimpleMarketMaker.ts` for a complete example.

## Configuration
Strategies can be configured via `config/strategy.json` or environment variables.
```

6.2. Update `docs/architecture.md` to include strategy framework

**Acceptance Criteria:**
- ✅ StrategyBase abstract class created
- ✅ SimpleMarketMaker example strategy implemented
- ✅ StrategyManager created and integrated
- ✅ Strategies generate signals on market data
- ✅ All tests pass (add 10+ new tests)
- ✅ Documentation updated

---

### GAP-010: Implement Signal Generation Framework 🔴
**Priority:** P0 (Critical)  
**Effort:** 2-3 days  
**Dependencies:** GAP-009 (StrategyBase)  
**Status:** Required for coordinated strategy execution

#### Problem
No centralized signal processing. Signals from multiple strategies need prioritization, aggregation, and risk checks before execution.

#### Solution Design

Create SignalEngine that:
1. Collects signals from all strategies
2. Prioritizes signals (by confidence, strategy weight, etc.)
3. Applies risk checks
4. Routes to execution engine
5. Tracks signal performance

#### Step-by-Step Implementation

**Step 1: Create Signal Types (0.5 days)**

1.1. Create `apps/backend/src/trading/SignalEngine.ts`
```typescript
import { Signal } from './StrategyBase';
import { RiskManager } from './riskManager';
import { logger } from '../utils/logger';
import { Order, Position } from '@polymarket/shared';

export interface SignalResult {
  signal: Signal;
  approved: boolean;
  reason?: string;
  orderId?: string;
}

export interface SignalEngineConfig {
  enabled: boolean;
  maxSignalsPerToken: number; // Max concurrent signals per token
  minConfidence: number; // Minimum confidence to execute (0-1)
  conflictResolution: 'highest-confidence' | 'first-wins' | 'aggregate';
}

export class SignalEngine {
  private config: SignalEngineConfig;
  private riskManager: RiskManager;
  private activeSignals: Map<string, Signal[]> = new Map(); // tokenId -> signals
  private signalHistory: SignalResult[] = [];
  
  constructor(config: SignalEngineConfig, riskManager: RiskManager) {
    this.config = config;
    this.riskManager = riskManager;
  }
  
  /**
   * Process incoming signals
   */
  async processSignals(
    signals: Signal[],
    currentOrders: Order[],
    currentPositions: Position[]
  ): Promise<SignalResult[]> {
    if (!this.config.enabled) {
      return [];
    }
    
    const results: SignalResult[] = [];
    
    // Group signals by token
    const signalsByToken = this.groupSignalsByToken(signals);
    
    for (const [tokenId, tokenSignals] of signalsByToken) {
      // Filter by confidence
      const qualifiedSignals = tokenSignals.filter(
        s => s.confidence >= this.config.minConfidence
      );
      
      if (qualifiedSignals.length === 0) {
        continue;
      }
      
      // Resolve conflicts
      const resolvedSignals = this.resolveConflicts(qualifiedSignals);
      
      // Apply risk checks
      for (const signal of resolvedSignals) {
        const result = await this.evaluateSignal(
          signal,
          currentOrders,
          currentPositions
        );
        
        results.push(result);
        this.signalHistory.push(result);
      }
    }
    
    // Trim history (keep last 1000)
    if (this.signalHistory.length > 1000) {
      this.signalHistory = this.signalHistory.slice(-1000);
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
   * Resolve conflicting signals (e.g., BUY and SELL for same token)
   */
  private resolveConflicts(signals: Signal[]): Signal[] {
    if (signals.length <= 1) {
      return signals;
    }
    
    switch (this.config.conflictResolution) {
      case 'highest-confidence':
        // Take signal with highest confidence
        return [signals.reduce((prev, curr) => 
          curr.confidence > prev.confidence ? curr : prev
        )];
        
      case 'first-wins':
        // Take first signal
        return [signals[0]];
        
      case 'aggregate':
        // Aggregate signals (e.g., average price, sum size)
        return this.aggregateSignals(signals);
        
      default:
        return [signals[0]];
    }
  }
  
  /**
   * Aggregate multiple signals into one
   */
  private aggregateSignals(signals: Signal[]): Signal[] {
    // Count BUY vs SELL signals
    const buys = signals.filter(s => s.action === 'BUY');
    const sells = signals.filter(s => s.action === 'SELL');
    
    // If majority is BUY, create aggregated BUY signal
    if (buys.length > sells.length) {
      const avgPrice = buys.reduce((sum, s) => sum + Number(s.price || 0), 0) / buys.length;
      const totalSize = buys.reduce((sum, s) => sum + Number(s.size || 0), 0);
      const avgConfidence = buys.reduce((sum, s) => sum + s.confidence, 0) / buys.length;
      
      return [{
        action: 'BUY',
        tokenId: signals[0].tokenId,
        price: String(avgPrice),
        size: String(totalSize),
        confidence: avgConfidence,
        reason: `Aggregated ${buys.length} BUY signals`,
        metadata: { aggregated: true, count: buys.length },
      }];
    } else if (sells.length > buys.length) {
      // Similar for SELL
      const avgPrice = sells.reduce((sum, s) => sum + Number(s.price || 0), 0) / sells.length;
      const totalSize = sells.reduce((sum, s) => sum + Number(s.size || 0), 0);
      const avgConfidence = sells.reduce((sum, s) => sum + s.confidence, 0) / sells.length;
      
      return [{
        action: 'SELL',
        tokenId: signals[0].tokenId,
        price: String(avgPrice),
        size: String(totalSize),
        confidence: avgConfidence,
        reason: `Aggregated ${sells.length} SELL signals`,
        metadata: { aggregated: true, count: sells.length },
      }];
    }
    
    // Conflicting signals cancel out
    return [];
  }
  
  /**
   * Evaluate signal against risk limits
   */
  private async evaluateSignal(
    signal: Signal,
    currentOrders: Order[],
    currentPositions: Position[]
  ): Promise<SignalResult> {
    // Apply risk manager checks
    const riskCheck = this.riskManager.checkOrder(
      signal.tokenId,
      signal.action,
      signal.size || '0',
      currentOrders,
      currentPositions
    );
    
    if (!riskCheck.allowed) {
      logger.warn('Signal rejected by risk manager', {
        signal,
        reason: riskCheck.reason,
      });
      
      return {
        signal,
        approved: false,
        reason: riskCheck.reason,
      };
    }
    
    // Check max signals per token
    const activeForToken = this.activeSignals.get(signal.tokenId) || [];
    if (activeForToken.length >= this.config.maxSignalsPerToken) {
      return {
        signal,
        approved: false,
        reason: `Max signals per token (${this.config.maxSignalsPerToken}) reached`,
      };
    }
    
    // Approved
    activeForToken.push(signal);
    this.activeSignals.set(signal.tokenId, activeForToken);
    
    logger.info('Signal approved', {
      action: signal.action,
      tokenId: signal.tokenId,
      confidence: signal.confidence,
      reason: signal.reason,
      strategy: signal.metadata?.strategyName,
    });
    
    return {
      signal,
      approved: true,
    };
  }
  
  /**
   * Mark signal as executed (remove from active)
   */
  markExecuted(signal: Signal, orderId: string): void {
    const activeForToken = this.activeSignals.get(signal.tokenId) || [];
    const index = activeForToken.findIndex(s => s === signal);
    
    if (index !== -1) {
      activeForToken.splice(index, 1);
      this.activeSignals.set(signal.tokenId, activeForToken);
    }
    
    logger.info('Signal executed', {
      orderId,
      action: signal.action,
      tokenId: signal.tokenId,
    });
  }
  
  /**
   * Get signal performance metrics
   */
  getMetrics(): Record<string, any> {
    const total = this.signalHistory.length;
    const approved = this.signalHistory.filter(r => r.approved).length;
    const rejected = total - approved;
    
    return {
      total,
      approved,
      rejected,
      approvalRate: total > 0 ? approved / total : 0,
      activeSignals: Array.from(this.activeSignals.values()).flat().length,
    };
  }
}
```

**Step 2: Integrate with Strategy Manager (0.5 days)**

2.1. Update `StrategyManager` to use `SignalEngine`

**Step 3: Add to Server (0.5 days)**

3.1. Initialize SignalEngine in server.ts
3.2. Pass signals through SignalEngine before execution

**Step 4: Add Tests (0.5 days)**

4.1. Test signal conflict resolution
4.2. Test risk checks
4.3. Test signal aggregation

**Step 5: Documentation (0.5 days)**

5.1. Document signal flow in architecture.md
5.2. Add signal engine configuration guide

**Acceptance Criteria:**
- ✅ SignalEngine processes signals from multiple strategies
- ✅ Conflicts resolved according to configuration
- ✅ Risk checks applied before execution
- ✅ Signal performance tracked
- ✅ All tests pass (add 15+ new tests)
- ✅ Documentation complete

---

## Phase 2: High Priority (P1) - 3-4 Weeks

### GAP-001: Wire MARKETS_CONFIG_PATH 🟠
**Priority:** P1 (High)  
**Effort:** 1 day  
**Dependencies:** None  
**Files:** `apps/backend/src/config/index.ts`, `config/markets.json.example`

#### Problem
`config/markets.json.example` exists but not loaded. Cannot configure per-market position limits and spreads without code changes.

#### Step-by-Step Implementation

**Step 1: Add to Config Schema (2 hours)**

1.1. Edit `apps/backend/src/config/index.ts`

Add to Zod schema (around line 260):
```typescript
  // Markets configuration file path (Research §6.1, §8)
  MARKETS_CONFIG_PATH: optionalStringFromEnv(z.string().optional()),
```

Add to parsed config (around line 395):
```typescript
    marketsConfigPath: env.MARKETS_CONFIG_PATH,
```

**Step 2: Load markets.json (2 hours)**

2.1. Add loading function in `apps/backend/src/config/index.ts`:
```typescript
import fs from 'fs';
import path from 'path';

/**
 * Load markets configuration from JSON file
 */
function loadMarketsConfig(filePath: string | undefined): MarketConfigEntry[] {
  if (!filePath) {
    return [];
  }
  
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
      logger.warn('Markets config file not found', { path: absolutePath });
      return [];
    }
    
    const fileContents = fs.readFileSync(absolutePath, 'utf-8');
    const marketsData = JSON.parse(fileContents);
    
    // Validate structure
    if (!Array.isArray(marketsData)) {
      throw new Error('Markets config must be an array');
    }
    
    // Validate each entry
    const marketSchema = z.object({
      tokenId: z.string(),
      maxPositionSize: z.number().optional(),
      spread: z.number().optional(),
    });
    
    const validated = marketsData.map((entry, index) => {
      const result = marketSchema.safeParse(entry);
      if (!result.success) {
        throw new Error(`Invalid market entry at index ${index}: ${result.error.message}`);
      }
      return result.data;
    });
    
    logger.info('Markets config loaded', {
      path: absolutePath,
      markets: validated.length,
    });
    
    return validated;
  } catch (error) {
    logger.error('Failed to load markets config', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Fail startup if config is invalid
  }
}
```

2.2. Add to config parsing:
```typescript
export function parseConfig(): Config {
  // ... existing code ...
  
  // Load markets config if path provided
  const marketsConfig = loadMarketsConfig(env.MARKETS_CONFIG_PATH);
  
  // If markets config provided, override TOKEN_IDS
  const tokenIds = marketsConfig.length > 0
    ? marketsConfig.map(m => m.tokenId)
    : env.TOKEN_IDS.split(',').filter((id) => id.trim() !== '');
  
  return {
    // ... existing fields ...
    tokenIds,
    markets: marketsConfig,
    marketsConfigPath: env.MARKETS_CONFIG_PATH,
  };
}
```

**Step 3: Use in Risk Manager (2 hours)**

3.1. Update `apps/backend/src/trading/riskManager.ts`:

```typescript
constructor(config: RiskManagerConfig, marketsConfig?: MarketConfigEntry[]) {
  this.config = config;
  this.marketsConfig = new Map();
  
  // Load per-market config
  if (marketsConfig) {
    for (const market of marketsConfig) {
      this.marketsConfig.set(market.tokenId, market);
    }
  }
}

checkOrder(
  tokenId: string,
  side: 'BUY' | 'SELL',
  size: string,
  currentOrders: Order[],
  currentPositions: Position[]
): { allowed: boolean; reason?: string } {
  // Get market-specific limit or fall back to global
  const marketConfig = this.marketsConfig.get(tokenId);
  const maxPositionSize = marketConfig?.maxPositionSize || this.config.maxExposurePerMarket;
  
  // ... rest of risk checks using maxPositionSize
}
```

3.2. Update initialization in `apps/backend/src/server/index.ts`:
```typescript
riskManager = new RiskManager({
  // ... existing config
}, config.markets);
```

**Step 4: Update Example File (1 hour)**

4.1. Edit `config/markets.json.example`:
```json
[
  {
    "tokenId": "0x4d145d1824e45c6a2087e9c7e4e8b1c7d1234567",
    "maxPositionSize": 100,
    "spread": 0.02,
    "enabled": true
  },
  {
    "tokenId": "0x7b291d4c7e8b1c3d4e5f6a1234567890abcdef12",
    "maxPositionSize": 50,
    "spread": 0.03,
    "enabled": true
  }
]
```

**Step 5: Documentation (1 hour)**

5.1. Update `docs/environment.md`:
```markdown
### MARKETS_CONFIG_PATH

**Type:** String (file path)  
**Default:** None  
**Required:** No  
**Status:** ✅ IMPLEMENTED

Path to markets configuration JSON file. When provided, overrides TOKEN_IDS and allows per-market configuration.

**Example:**
\`\`\`bash
MARKETS_CONFIG_PATH=config/markets.json
\`\`\`

**Configuration Format:**
\`\`\`json
[
  {
    "tokenId": "0x...",
    "maxPositionSize": 100,
    "spread": 0.02
  }
]
\`\`\`

See `config/markets.json.example` for complete example.
```

5.2. Update `docs/examples.md` with markets.json usage example

**Step 6: Tests (2 hours)**

6.1. Create `apps/backend/tests/unit/marketsConfig.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/config';
import fs from 'fs';
import path from 'path';

describe('Markets Config Loading', () => {
  it('should load valid markets.json', () => {
    // Create temp config file
    const tempPath = path.join(__dirname, 'temp-markets.json');
    fs.writeFileSync(tempPath, JSON.stringify([
      { tokenId: '0x123', maxPositionSize: 100, spread: 0.02 }
    ]));
    
    process.env.MARKETS_CONFIG_PATH = tempPath;
    
    const config = parseConfig();
    
    expect(config.markets).toHaveLength(1);
    expect(config.markets[0].tokenId).toBe('0x123');
    expect(config.tokenIds).toContain('0x123');
    
    // Cleanup
    fs.unlinkSync(tempPath);
  });
  
  it('should validate market entries', () => {
    const tempPath = path.join(__dirname, 'invalid-markets.json');
    fs.writeFileSync(tempPath, JSON.stringify([
      { invalidField: 'value' }
    ]));
    
    process.env.MARKETS_CONFIG_PATH = tempPath;
    
    expect(() => parseConfig()).toThrow('Invalid market entry');
    
    fs.unlinkSync(tempPath);
  });
});
```

**Acceptance Criteria:**
- ✅ MARKETS_CONFIG_PATH added to config schema
- ✅ markets.json loaded and validated at startup
- ✅ Per-market position limits applied in risk manager
- ✅ TOKEN_IDS overridden when markets.json provided
- ✅ Tests pass (add 5+ new tests)
- ✅ Documentation updated

---

### GAP-002: Wire STRATEGY_CONFIG_PATH 🟠
**Priority:** P1 (High)  
**Effort:** 1 day  
**Dependencies:** GAP-009 (Strategy framework helpful but not required)

#### Step-by-Step Implementation

Similar to GAP-001 but for strategy.json. Key differences:

1. Load `config/strategy.json` with strategy parameters
2. Pass to StrategyManager/strategies during initialization
3. Support different parameters per strategy
4. Add validation schema for strategy config

**Implementation:** Follow same pattern as GAP-001 above.

**Acceptance Criteria:**
- ✅ STRATEGY_CONFIG_PATH loaded
- ✅ Strategy parameters configurable via JSON
- ✅ Tests pass
- ✅ Documentation complete

---

### GAP-033: Add Chaos Engineering Tests 🟠
**Priority:** P1 (High)  
**Effort:** 3 days  
**Dependencies:** None

#### Problem
No dedicated tests for failure scenarios: WebSocket disconnects, API failures, DB corruption. These scenarios untested but critical for production reliability.

#### Step-by-Step Implementation

**Step 1: Create Chaos Test Directory (0.5 days)**

1.1. Create directory structure:
```bash
mkdir -p apps/backend/tests/chaos
```

1.2. Create `apps/backend/tests/chaos/README.md`:
```markdown
# Chaos Engineering Tests

Tests for system behavior under failure conditions.

## Test Scenarios
- WebSocket disconnection and reconnection
- API failures and timeouts
- Database corruption
- Memory pressure
- Network partitions
- Clock skew

## Running Tests
\`\`\`bash
npm run test:chaos
\`\`\`
```

**Step 2: WebSocket Chaos Tests (1 day)**

2.1. Create `apps/backend/tests/chaos/websocket-failures.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarketFeedClient } from '../../src/clients/marketFeed';
import { WebSocketClient } from '../../src/clients/websocket';
import WebSocket from 'ws';

describe('WebSocket Chaos Tests', () => {
  let marketFeed: MarketFeedClient;
  
  beforeEach(() => {
    marketFeed = new MarketFeedClient({
      url: 'wss://test.example.com',
      tokenIds: ['0xtest'],
    });
  });
  
  afterEach(async () => {
    await marketFeed.close();
  });
  
  it('should handle abrupt disconnection', async () => {
    const disconnectEvents: any[] = [];
    const reconnectEvents: any[] = [];
    
    marketFeed.on('disconnected', () => disconnectEvents.push(Date.now()));
    marketFeed.on('connected', () => reconnectEvents.push(Date.now()));
    
    // Connect
    marketFeed.connect();
    await new Promise(resolve => marketFeed.once('connected', resolve));
    
    // Simulate abrupt disconnect
    (marketFeed as any).client.ws?.terminate();
    
    // Should reconnect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    expect(disconnectEvents).toHaveLength(1);
    expect(reconnectEvents.length).toBeGreaterThanOrEqual(2); // Initial + reconnect
  });
  
  it('should handle message flood (backpressure)', async () => {
    marketFeed.connect();
    await new Promise(resolve => marketFeed.once('connected', resolve));
    
    // Send 1000 messages rapidly
    const messages: any[] = [];
    marketFeed.on('snapshot', (tokenId, orderbook) => {
      messages.push({ tokenId, orderbook });
    });
    
    for (let i = 0; i < 1000; i++) {
      (marketFeed as any).client.emit('message', JSON.stringify({
        event_type: 'book',
        asset_id: '0xtest',
        timestamp: Date.now(),
        bids: [{ price: '0.5', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
      }));
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should process all messages (or gracefully drop duplicates)
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.length).toBeLessThanOrEqual(1000);
  });
  
  it('should handle malformed messages', async () => {
    const errorEvents: any[] = [];
    marketFeed.on('error', (error) => errorEvents.push(error));
    
    marketFeed.connect();
    await new Promise(resolve => marketFeed.once('connected', resolve));
    
    // Send malformed JSON
    (marketFeed as any).client.ws?.emit('message', 'invalid json {{{');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should log error but not crash
    expect(errorEvents.length).toBeGreaterThan(0);
    expect((marketFeed as any).client.state).not.toBe('CLOSED');
  });
  
  it('should handle rapid connect/disconnect cycles', async () => {
    for (let i = 0; i < 10; i++) {
      marketFeed.connect();
      await new Promise(resolve => setTimeout(resolve, 50));
      await marketFeed.close();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Should not crash or leak resources
    expect((marketFeed as any).client).toBeDefined();
  });
  
  it('should handle network timeout during reconnect', async () => {
    marketFeed.connect();
    await new Promise(resolve => marketFeed.once('connected', resolve));
    
    // Simulate network timeout
    vi.spyOn(WebSocket.prototype, 'send').mockImplementation(() => {
      throw new Error('ETIMEDOUT');
    });
    
    (marketFeed as any).client.ws?.terminate();
    
    // Should handle timeout gracefully
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Should still be attempting reconnect
    expect((marketFeed as any).client.state).toBe('RECONNECTING');
  });
});
```

**Step 3: API Failure Tests (1 day)**

3.1. Create `apps/backend/tests/chaos/api-failures.test.ts`:
```typescript
describe('API Chaos Tests', () => {
  it('should handle CLOB API downtime', async () => {
    // Mock CLOB API to return 503
    // Verify circuit breaker trips
    // Verify graceful degradation
  });
  
  it('should handle timeout cascade', async () => {
    // Mock slow responses
    // Verify timeout handling
    // Verify no thread exhaustion
  });
  
  it('should handle rate limiting (429)', async () => {
    // Mock 429 responses
    // Verify backoff
    // Verify retry with jitter
  });
  
  it('should handle partial API failure', async () => {
    // Some endpoints work, some fail
    // Verify fallback behavior
  });
});
```

**Step 4: Database Chaos Tests (0.5 days)**

4.1. Create `apps/backend/tests/chaos/database-failures.test.ts`

**Step 5: Add to CI (0.5 days)**

5.1. Add chaos test script to `apps/backend/package.json`:
```json
{
  "scripts": {
    "test:chaos": "vitest run tests/chaos --reporter=verbose"
  }
}
```

5.2. Update `.github/workflows/ci.yml`:
```yaml
- name: Run chaos tests
  run: npm run test:chaos
  continue-on-error: true  # Don't fail CI on chaos tests initially
```

**Acceptance Criteria:**
- ✅ Chaos test directory created
- ✅ WebSocket failure tests (10+ scenarios)
- ✅ API failure tests (10+ scenarios)
- ✅ Database failure tests (5+ scenarios)
- ✅ All tests document expected behavior
- ✅ CI integration complete

---

### GAP-041: Infrastructure as Code 🟠
**Priority:** P1 (High)  
**Effort:** 3-5 days  
**Dependencies:** None

#### Problem
Manual infrastructure setup leads to inconsistent deployments. Need IaC for reproducible infrastructure.

#### Solution Options
1. **Terraform** - Most popular, cloud-agnostic
2. **Pulumi** - Modern, uses real programming languages
3. **AWS CDK** - For AWS-only deployments
4. **Docker Swarm / Kubernetes** - For container orchestration

#### Step-by-Step Implementation (Terraform)

**Step 1: Setup Terraform (0.5 days)**

1.1. Create `infrastructure/` directory:
```bash
mkdir -p infrastructure/{aws,azure,gcp}
```

1.2. Create `infrastructure/aws/main.tf`:
```hcl
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "polymarket-bot-terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "production"
}

variable "app_version" {
  description = "Application version to deploy"
  type        = string
}
```

**Step 2: Define Resources (2 days)**

2.1. Create `infrastructure/aws/ecs.tf` for container deployment:
```hcl
# ECS Cluster
resource "aws_ecs_cluster" "polymarket_bot" {
  name = "polymarket-bot-${var.environment}"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Task Definition
resource "aws_ecs_task_definition" "bot" {
  family                   = "polymarket-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn
  
  container_definitions = jsonencode([
    {
      name      = "polymarket-bot"
      image     = "${aws_ecr_repository.bot.repository_url}:${var.app_version}"
      essential = true
      
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        },
        {
          containerPort = 9090
          protocol      = "tcp"
        }
      ]
      
      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "LOG_LEVEL", value = "info" }
      ]
      
      secrets = [
        {
          name      = "PRIVATE_KEY"
          valueFrom = aws_secretsmanager_secret.private_key.arn
        },
        {
          name      = "ADMIN_TOKEN"
          valueFrom = aws_secretsmanager_secret.admin_token.arn
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.bot.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "bot"
        }
      }
      
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# ECS Service
resource "aws_ecs_service" "bot" {
  name            = "polymarket-bot"
  cluster         = aws_ecs_cluster.polymarket_bot.id
  task_definition = aws_ecs_task_definition.bot.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.bot.id]
    assign_public_ip = false
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.bot.arn
    container_name   = "polymarket-bot"
    container_port   = 3000
  }
  
  depends_on = [aws_lb_listener.bot]
}
```

2.2. Create `infrastructure/aws/database.tf` for RDS:
```hcl
# RDS PostgreSQL (for future use)
resource "aws_db_instance" "bot" {
  identifier     = "polymarket-bot-${var.environment}"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t4g.micro"
  
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true
  
  db_name  = "polymarket_bot"
  username = "botadmin"
  password = random_password.db_password.result
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"
  
  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.bot.name
  
  skip_final_snapshot = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "polymarket-bot-final-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Store DB password in Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name = "polymarket-bot/${var.environment}/db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}
```

2.3. Create `infrastructure/aws/monitoring.tf`:
```hcl
# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "bot" {
  name              = "/ecs/polymarket-bot-${var.environment}"
  retention_in_days = 30
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "polymarket-bot-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "This metric monitors ECS CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    ClusterName = aws_ecs_cluster.polymarket_bot.name
    ServiceName = aws_ecs_service.bot.name
  }
}

resource "aws_cloudwatch_metric_alarm" "high_memory" {
  alarm_name          = "polymarket-bot-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "This metric monitors ECS memory utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    ClusterName = aws_ecs_cluster.polymarket_bot.name
    ServiceName = aws_ecs_service.bot.name
  }
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "polymarket-bot-alerts-${var.environment}"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
```

**Step 3: Documentation (1 day)**

3.1. Create `infrastructure/README.md`:
```markdown
# Infrastructure as Code

## Prerequisites
- Terraform >= 1.0
- AWS CLI configured
- Appropriate IAM permissions

## Deployment

### Initialize
\`\`\`bash
cd infrastructure/aws
terraform init
\`\`\`

### Plan
\`\`\`bash
terraform plan -var="app_version=1.0.0"
\`\`\`

### Apply
\`\`\`bash
terraform apply -var="app_version=1.0.0"
\`\`\`

### Destroy
\`\`\`bash
terraform destroy
\`\`\`

## Environments
- `dev` - Development environment
- `staging` - Staging environment
- `production` - Production environment

## State Management
State is stored in S3 with locking via DynamoDB.
```

**Step 4: CI/CD Integration (1 day)**

4.1. Create `.github/workflows/terraform.yml`:
```yaml
name: Terraform

on:
  push:
    branches: [main]
    paths: ['infrastructure/**']
  pull_request:
    paths: ['infrastructure/**']

jobs:
  terraform:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.5.0
      
      - name: Terraform Format
        run: terraform fmt -check -recursive infrastructure/
      
      - name: Terraform Init
        run: |
          cd infrastructure/aws
          terraform init
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - name: Terraform Validate
        run: |
          cd infrastructure/aws
          terraform validate
      
      - name: Terraform Plan
        if: github.event_name == 'pull_request'
        run: |
          cd infrastructure/aws
          terraform plan -var="app_version=latest"
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - name: Terraform Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: |
          cd infrastructure/aws
          terraform apply -auto-approve -var="app_version=${{ github.sha }}"
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

**Acceptance Criteria:**
- ✅ Terraform configuration for AWS ECS deployment
- ✅ RDS PostgreSQL configuration
- ✅ CloudWatch monitoring and alarms
- ✅ Secrets Manager integration
- ✅ CI/CD pipeline for infrastructure
- ✅ Documentation complete
- ✅ Successfully deploy to test environment

---

*[Continue with remaining 40 gaps in similar detailed format...]*

---

## Summary Table: All 47 Gaps

| ID | Name | Priority | Effort | Dependencies | Phase |
|----|------|----------|--------|--------------|-------|
| GAP-009 | Strategy Abstraction Layer | P0 | 3-5 days | None | 1 |
| GAP-010 | Signal Generation Framework | P0 | 2-3 days | GAP-009 | 1 |
| GAP-001 | Wire MARKETS_CONFIG_PATH | P1 | 1 day | None | 2 |
| GAP-002 | Wire STRATEGY_CONFIG_PATH | P1 | 1 day | GAP-009 | 2 |
| GAP-003 | Learning System Config Vars | P2 | 1 day | None | 3 |
| GAP-004 | Metrics Config Vars | P2 | 0.5 days | None | 3 |
| GAP-005 | WebSocket Config Vars | P2 | 0.5 days | None | 3 |
| GAP-006 | Azure Credential Vars | P3 | 2 hours | None | 4 |
| GAP-007 | AWS Credential Vars | P3 | 2 hours | None | 4 |
| GAP-008 | Config Documentation Drift | P3 | 2 hours | None | 4 |
| GAP-011 | Strategy Hot-Reload | P1 | 2 days | GAP-002 | 2 |
| GAP-012 | Strategy Backtesting | P1 | 1 week | GAP-009 | 2 |
| GAP-013 | Multi-Strategy Orchestration | P2 | 3-5 days | GAP-009 | 3 |
| GAP-014 | Pre-Trade Liquidity Validation | P3 | 3 days | None | 4 |
| GAP-015 | Prometheus/Grafana Enabled | P2 | ✅ DONE | None | - |
| GAP-016 | Deployment Workflow | P2 | 1 day | None | 3 |
| GAP-017 | Pre-Deployment Script | P3 | 1 day | None | 4 |
| GAP-018 | DB Backup Script | P3 | 1 day | None | 4 |
| GAP-019 | UMA Resolution Docs | P3 | 2 hours | None | 4 |
| GAP-020 | Fee-Rate Checking | P3 | 1 day | None | 4 |
| GAP-021 | Cost Scenarios Docs | P3 | 3 hours | None | 4 |
| GAP-022 | .env.example Drift | P2 | ✅ DONE | None | - |
| GAP-023 | ENV_VARIABLE_REFERENCE | P2 | ✅ DONE | None | - |
| GAP-024 | Secret Management Clarity | P3 | 1 hour | None | 4 |
| GAP-025 | Research Comparison Update | P3 | 2 hours | None | 4 |
| GAP-026 | Gap Analysis Update | P3 | 2 hours | None | 4 |
| GAP-027 | Architecture Docs Update | P3 | 3 hours | None | 4 |
| GAP-028 | Runbook Backup Procedures | P3 | 2 hours | GAP-018 | 4 |
| GAP-029 | Runbook UMA Resolution | P3 | 1 hour | GAP-019 | 4 |
| GAP-030 | Examples markets.json | P3 | 1 hour | GAP-001 | 4 |
| GAP-031 | Master Plan Update | P3 | 1 hour | None | 4 |
| GAP-032 | Small PR Plan Clarification | P3 | 0.5 hours | None | 4 |
| GAP-033 | Chaos Engineering Tests | P1 | 3 days | None | 2 |
| GAP-034 | Integration Test Coverage | P2 | 1 week | None | 3 |
| GAP-035 | Performance Benchmarks | P2 | 2 days | None | 3 |
| GAP-036 | Test Data Generators | P3 | 2 days | None | 4 |
| GAP-037 | Mutation Testing | P3 | 3 days | None | 4 |
| GAP-038 | Cloud Secret Backends | P2 | 1 week | None | 3 |
| GAP-039 | Secrets Rotation | P3 | 3-5 days | GAP-038 | 4 |
| GAP-040 | Compliance Reporting | P3 | 2-3 days | None | 4 |
| GAP-041 | Infrastructure as Code | P1 | 3-5 days | None | 2 |
| GAP-042 | Container Registry | P2 | 1 day | None | 3 |
| GAP-043 | Staging Environment | P2 | 2 days | GAP-041 | 3 |
| GAP-044 | Health Check Monitoring | P3 | 1 day | None | 4 |
| GAP-045 | Learning System Production | P2 | 1 week | GAP-003,009 | 3 |
| GAP-046 | Strategy Validation | P3 | 2-3 days | GAP-012 | 4 |
| GAP-047 | Online Learning | P3 | 1-2 weeks | GAP-045 | 4 |

---

## Execution Timeline

### Week 1-2: Phase 1 (Critical)
- GAP-009: Strategy Abstraction (5 days)
- GAP-010: Signal Engine (3 days)
- Start planning Phase 2

### Week 3-5: Phase 2 (High Priority) - Part 1
- GAP-001: Markets Config (1 day)
- GAP-002: Strategy Config (1 day)
- GAP-033: Chaos Tests (3 days)
- GAP-041: Infrastructure as Code (5 days)
- GAP-011: Strategy Hot-Reload (2 days)

### Week 6-8: Phase 2 (High Priority) - Part 2
- GAP-012: Strategy Backtesting Integration (5 days)
- Remaining P1 gaps

### Week 9-12: Phase 3 (Medium Priority)
- Configuration wiring (GAP-003, 004, 005)
- Documentation gaps
- Integration testing
- Cloud secrets implementation

### Week 13-16: Phase 4 (Low Priority)
- Documentation polish
- Test improvements
- Optional features
- Nice-to-have enhancements

---

## Cost Estimates

### Development Resources
- **Senior Developer:** 12-16 weeks @ $150/hr = $72,000-96,000
- **DevOps Engineer:** 4-6 weeks @ $150/hr = $24,000-36,000
- **QA Engineer:** 4 weeks @ $100/hr = $16,000

**Total Development:** $112,000-148,000

### Infrastructure Costs (Monthly)
- **AWS ECS Fargate:** $30-50/month
- **RDS PostgreSQL:** $15-30/month
- **CloudWatch:** $10-20/month
- **S3/Secrets Manager:** $5-10/month

**Total Infrastructure:** $60-110/month

### Ongoing Maintenance
- **Monitoring & Alerts:** 2-4 hours/week
- **Security Updates:** 4-8 hours/month
- **Feature Development:** Variable

---

## Risk Mitigation

### High-Risk Items
1. **Strategy Framework Refactor** - May break existing functionality
   - Mitigation: Comprehensive testing, parallel implementation
   
2. **Infrastructure Migration** - Downtime risk
   - Mitigation: Blue-green deployment, rollback plan
   
3. **Learning System Integration** - Complex ML integration
   - Mitigation: Phased rollout, feature flags

### Validation Gates
- ✅ All tests pass before merge
- ✅ Code review required
- ✅ Manual QA for critical features
- ✅ Staging deployment before production
- ✅ Monitoring and alerting in place

---

## Success Metrics

### Phase 1 (Critical)
- ✅ Can deploy multiple strategies
- ✅ Signals processed through centralized engine
- ✅ No regression in existing functionality

### Phase 2 (High Priority)
- ✅ Per-market configuration working
- ✅ Chaos tests catching failures
- ✅ Infrastructure reproducible via IaC

### Phase 3 (Medium Priority)
- ✅ All config vars wired
- ✅ Documentation accurate
- ✅ Cloud secrets working

### Phase 4 (Low Priority)
- ✅ All nice-to-haves complete
- ✅ System fully documented
- ✅ Production-ready checklist complete

---

## Appendix

### Tools & Technologies
- **TypeScript** - Primary language
- **Vitest** - Testing framework
- **Terraform** - Infrastructure as Code
- **Docker** - Containerization
- **AWS ECS** - Container orchestration
- **Prometheus/Grafana** - Monitoring
- **PostgreSQL** - Database (future)

### Related Documentation
- [COMPREHENSIVE_GAPS_REPORT.md](./COMPREHENSIVE_GAPS_REPORT.md)
- [AUDIT_STATUS.md](./AUDIT_STATUS.md)
- [docs/architecture.md](./docs/architecture.md)
- [REPORTS/GAP_ANALYSIS.md](./REPORTS/GAP_ANALYSIS.md)

### Contact & Escalation
For questions or blockers during implementation, consult:
- Architecture decisions → docs/adr/
- Security questions → docs/security.md
- Compliance questions → docs/compliance.md
