/**
 * Unit Tests for StrategyOrchestrator
 * 
 * Tests multi-strategy orchestration capabilities:
 * - Running multiple strategies in parallel
 * - State isolation between strategies
 * - Cross-strategy conflict detection
 * - Per-strategy logging and metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrategyOrchestrator } from '../../src/trading/strategies/StrategyOrchestrator';
import { RandomStrategy } from '../../src/trading/strategies/RandomStrategy';
import { ArbitrageStrategy } from '../../src/trading/strategies/ArbitrageStrategy';
import { MeanReversionStrategy } from '../../src/trading/strategies/MeanReversionStrategy';
import type { IStrategy, MarketContext, TradingDecision, StrategyConfig } from '../../src/trading/strategies/types';

describe('StrategyOrchestrator', () => {
  let orchestrator: StrategyOrchestrator;
  
  const mockMarketContext: MarketContext = {
    marketId: 'test-market-1',
    tokenId: 'token-123',
    bestBid: 0.49,
    bestAsk: 0.51,
    mid: 0.50,
    spread: 0.02,
    liquidity: {
      bidSize: 100,
      askSize: 100,
    },
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    orchestrator = new StrategyOrchestrator({
      maxStrategies: 5,
      enableConflictDetection: true,
      conflictResolution: 'highest-confidence',
      enableStateIsolation: true,
    });
  });

  afterEach(async () => {
    await orchestrator.cleanup();
  });

  describe('Strategy Management', () => {
    it('should add a strategy', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      await orchestrator.addStrategy(strategy);

      expect(orchestrator.getStrategyCount()).toBe(1);
      expect(orchestrator.getStrategies()).toHaveLength(1);
      expect(orchestrator.getStrategies()[0].id).toBe(strategy.id);
    });

    it('should reject duplicate strategy IDs', async () => {
      const strategy1 = new RandomStrategy();
      await strategy1.initialize({
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      const strategy2 = new RandomStrategy();
      await strategy2.initialize({
        strategyId: 'random-1',  // Same strategyId as strategy1
        type: 'random',
        enabled: true,
        params: {},
      });

      await orchestrator.addStrategy(strategy1);
      
      // Should reject second strategy with same strategyId
      await expect(orchestrator.addStrategy(strategy2)).rejects.toThrow('already exists');
    });

    it('should enforce maximum strategy limit', async () => {
      const smallOrchestrator = new StrategyOrchestrator({ maxStrategies: 2 });

      const strategy1 = new RandomStrategy();
      await strategy1.initialize({
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: { seed: 1 },
      });

      const strategy2 = new ArbitrageStrategy();
      await strategy2.initialize({
        strategyId: 'arb-1',
        type: 'arbitrage',
        enabled: true,
        params: {},
      });

      const strategy3 = new MeanReversionStrategy();
      await strategy3.initialize({
        strategyId: 'mr-1',
        type: 'mean-reversion',
        enabled: true,
        params: {},
      });

      await smallOrchestrator.addStrategy(strategy1);
      await smallOrchestrator.addStrategy(strategy2);
      
      await expect(smallOrchestrator.addStrategy(strategy3)).rejects.toThrow(
        'Maximum number of strategies'
      );

      await smallOrchestrator.cleanup();
    });

    it('should remove a strategy', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      await orchestrator.addStrategy(strategy);
      expect(orchestrator.getStrategyCount()).toBe(1);

      // Use the config's strategyId
      await orchestrator.removeStrategy('random-1');
      expect(orchestrator.getStrategyCount()).toBe(0);
    });

    it('should emit events on strategy add/remove', async () => {
      const addedSpy = vi.fn();
      const removedSpy = vi.fn();

      orchestrator.on('strategyAdded', addedSpy);
      orchestrator.on('strategyRemoved', removedSpy);

      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: {},
      });

      await orchestrator.addStrategy(strategy);
      expect(addedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'random-1',
          strategyName: strategy.name,
        })
      );

      await orchestrator.removeStrategy('random-1');
      expect(removedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'random-1',
        })
      );
    });
  });

  describe('Parallel Evaluation', () => {
    it('should evaluate multiple strategies in parallel', async () => {
      // Create mock strategies with unique IDs
      const strategy1: IStrategy = {
        id: 'test-strategy-1',
        name: 'TestStrategy1',
        version: '1.0.0',
        description: 'Test strategy 1',
        async initialize() {},
        async evaluate() {
          return {
            action: 'hold',
            confidence: 0.6,
            rationale: 'Test decision 1',
          };
        },
        getConfig() {
          return {
            strategyId: 'test-1',
            type: 'test',
            enabled: true,
            params: {},
          };
        },
      };

      const strategy2: IStrategy = {
        id: 'test-strategy-2',
        name: 'TestStrategy2',
        version: '1.0.0',
        description: 'Test strategy 2',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            confidence: 0.7,
            rationale: 'Test decision 2',
          };
        },
        getConfig() {
          return {
            strategyId: 'test-2',
            type: 'test',
            enabled: true,
            params: {},
          };
        },
      };

      const strategy3: IStrategy = {
        id: 'test-strategy-3',
        name: 'TestStrategy3',
        version: '1.0.0',
        description: 'Test strategy 3',
        async initialize() {},
        async evaluate() {
          return {
            action: 'sell',
            side: 'SELL',
            confidence: 0.8,
            rationale: 'Test decision 3',
          };
        },
        getConfig() {
          return {
            strategyId: 'test-3',
            type: 'test',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(strategy1);
      await orchestrator.addStrategy(strategy2);
      await orchestrator.addStrategy(strategy3);

      const results = await orchestrator.evaluateAll(mockMarketContext);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.strategyId).toBeDefined();
        expect(result.strategyName).toBeDefined();
        expect(result.decision).toBeDefined();
        expect(result.decision.action).toBeDefined();
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.timestamp).toBeDefined();
      });
    });

    it('should handle strategy evaluation errors gracefully', async () => {
      // Create a mock strategy that throws an error
      const failingStrategy: IStrategy = {
        id: 'failing-strategy',
        name: 'Failing',
        version: '1.0.0',
        description: 'Fails on purpose',
        async initialize() {},
        async evaluate() {
          throw new Error('Intentional error');
        },
        getConfig() {
          return {
            strategyId: 'failing-1',
            type: 'failing',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(failingStrategy);

      const results = await orchestrator.evaluateAll(mockMarketContext);

      expect(results).toHaveLength(1);
      expect(results[0].error).toBeDefined();
      expect(results[0].error?.message).toBe('Intentional error');
      expect(results[0].decision.action).toBe('hold');
      expect(results[0].decision.confidence).toBe(0);
    });

    it('should track execution statistics', async () => {
      const strategy = new RandomStrategy();
      const strategyId = 'random-1';
      await strategy.initialize({
        strategyId,
        type: 'random',
        enabled: true,
        params: { seed: 123 },
      });

      await orchestrator.addStrategy(strategy);

      // Run multiple evaluations
      for (let i = 0; i < 5; i++) {
        await orchestrator.evaluateAll(mockMarketContext);
      }

      const stats = orchestrator.getStrategyStats(strategyId);
      
      expect(stats).toBeDefined();
      expect(stats?.totalEvaluations).toBe(5);
      expect(stats?.successfulEvaluations).toBe(5);
      expect(stats?.failedEvaluations).toBe(0);
      expect(stats?.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should return empty results when no strategies are added', async () => {
      const results = await orchestrator.evaluateAll(mockMarketContext);
      expect(results).toEqual([]);
    });
  });

  describe('State Isolation', () => {
    it('should maintain isolated state for each strategy', async () => {
      const strategy1: IStrategy = {
        id: 'isolated-strategy-1',
        name: 'IsolatedStrategy1',
        version: '1.0.0',
        description: 'Strategy 1',
        async initialize() {},
        async evaluate() {
          return {
            action: 'hold',
            confidence: 0.5,
            rationale: 'Hold',
          };
        },
        getConfig() {
          return {
            strategyId: 'iso-1',
            type: 'test',
            enabled: true,
            params: {},
          };
        },
      };

      const strategy2: IStrategy = {
        id: 'isolated-strategy-2',
        name: 'IsolatedStrategy2',
        version: '1.0.0',
        description: 'Strategy 2',
        async initialize() {},
        async evaluate() {
          return {
            action: 'hold',
            confidence: 0.5,
            rationale: 'Hold',
          };
        },
        getConfig() {
          return {
            strategyId: 'iso-2',
            type: 'test',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(strategy1);
      await orchestrator.addStrategy(strategy2);

      // Use config strategyId
      const state1 = orchestrator.getStrategyState('iso-1');
      const state2 = orchestrator.getStrategyState('iso-2');

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
      
      expect(state1?.data).toEqual({});
      expect(state1?.positions).toBeInstanceOf(Map);
      expect(state1?.pendingOrders).toBeInstanceOf(Set);
    });

    it('should update isolated positions independently', async () => {
      const strategy1: IStrategy = {
        id: 'position-strategy-1',
        name: 'PositionStrategy1',
        version: '1.0.0',
        description: 'Position tracking 1',
        async initialize() {},
        async evaluate() {
          return {
            action: 'hold',
            confidence: 0.5,
            rationale: 'Hold',
          };
        },
        getConfig() {
          return {
            strategyId: 'pos-1',
            type: 'test',
            enabled: true,
            params: {},
          };
        },
      };

      const strategy2: IStrategy = {
        id: 'position-strategy-2',
        name: 'PositionStrategy2',
        version: '1.0.0',
        description: 'Position tracking 2',
        async initialize() {},
        async evaluate() {
          return {
            action: 'hold',
            confidence: 0.5,
            rationale: 'Hold',
          };
        },
        getConfig() {
          return {
            strategyId: 'pos-2',
            type: 'test',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(strategy1);
      await orchestrator.addStrategy(strategy2);

      // Update position for strategy1 using config strategyId
      orchestrator.updateStrategyPosition('pos-1', 'token-123', {
        tokenId: 'token-123',
        size: 10,
        avgPrice: 0.5,
        unrealizedPnl: 5,
        realizedPnl: 0,
      });

      // Update different position for strategy2 using config strategyId
      orchestrator.updateStrategyPosition('pos-2', 'token-123', {
        tokenId: 'token-123',
        size: 20,
        avgPrice: 0.6,
        unrealizedPnl: 10,
        realizedPnl: 0,
      });

      const state1 = orchestrator.getStrategyState('pos-1');
      const state2 = orchestrator.getStrategyState('pos-2');

      const position1 = state1?.positions.get('token-123');
      const position2 = state2?.positions.get('token-123');

      expect(position1?.size).toBe(10);
      expect(position1?.avgPrice).toBe(0.5);
      expect(position2?.size).toBe(20);
      expect(position2?.avgPrice).toBe(0.6);
    });

    it('should record last evaluation in isolated state', async () => {
      const strategyId = 'random-1';
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId,
        type: 'random',
        enabled: true,
        params: { seed: 456 },
      });

      await orchestrator.addStrategy(strategy);
      
      await orchestrator.evaluateAll(mockMarketContext);

      const state = orchestrator.getStrategyState(strategyId);
      
      expect(state?.lastEvaluation).toBeDefined();
      expect(state?.lastDecision).toBeDefined();
      expect(state?.lastDecision?.action).toBeDefined();
    });
  });

  describe('Conflict Detection', () => {
    it('should detect conflicts when multiple strategies want same action', async () => {
      // Create two strategies that both want to buy
      const buyStrategy1: IStrategy = {
        id: 'buy-strategy-1',
        name: 'Buy1',
        version: '1.0.0',
        description: 'Always buys',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            price: 0.48,
            size: 10,
            confidence: 0.8,
            rationale: 'Bullish signal',
          };
        },
        getConfig() {
          return {
            strategyId: 'buy-1',
            type: 'buy',
            enabled: true,
            params: {},
          };
        },
      };

      const buyStrategy2: IStrategy = {
        id: 'buy-strategy-2',
        name: 'Buy2',
        version: '1.0.0',
        description: 'Always buys',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            price: 0.47,
            size: 15,
            confidence: 0.7,
            rationale: 'Another bullish signal',
          };
        },
        getConfig() {
          return {
            strategyId: 'buy-2',
            type: 'buy',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(buyStrategy1);
      await orchestrator.addStrategy(buyStrategy2);

      const result = await orchestrator.evaluateWithConflictDetection(mockMarketContext);

      // This WILL detect a conflict because multiple strategies want to buy
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].reason).toContain('Multiple buy signals');
    });

    it('should detect conflicts when strategies disagree', async () => {
      const buyStrategy: IStrategy = {
        id: 'buy-strategy',
        name: 'Buyer',
        version: '1.0.0',
        description: 'Wants to buy',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            price: 0.48,
            size: 10,
            confidence: 0.8,
            rationale: 'Bullish',
          };
        },
        getConfig() {
          return {
            strategyId: 'buy-1',
            type: 'buy',
            enabled: true,
            params: {},
          };
        },
      };

      const sellStrategy: IStrategy = {
        id: 'sell-strategy',
        name: 'Seller',
        version: '1.0.0',
        description: 'Wants to sell',
        async initialize() {},
        async evaluate() {
          return {
            action: 'sell',
            side: 'SELL',
            price: 0.52,
            size: 10,
            confidence: 0.7,
            rationale: 'Bearish',
          };
        },
        getConfig() {
          return {
            strategyId: 'sell-1',
            type: 'sell',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(buyStrategy);
      await orchestrator.addStrategy(sellStrategy);

      const result = await orchestrator.evaluateWithConflictDetection(mockMarketContext);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts.some(c => c.reason.includes('Opposing trade directions'))).toBe(true);
    });

    it('should emit conflict events', async () => {
      const conflictSpy = vi.fn();
      orchestrator.on('conflictDetected', conflictSpy);

      const buyStrategy: IStrategy = {
        id: 'buy-strategy',
        name: 'Buyer',
        version: '1.0.0',
        description: 'Buys',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            confidence: 0.8,
            rationale: 'Buy signal',
          };
        },
        getConfig() {
          return {
            strategyId: 'buy-1',
            type: 'buy',
            enabled: true,
            params: {},
          };
        },
      };

      const sellStrategy: IStrategy = {
        id: 'sell-strategy',
        name: 'Seller',
        version: '1.0.0',
        description: 'Sells',
        async initialize() {},
        async evaluate() {
          return {
            action: 'sell',
            side: 'SELL',
            confidence: 0.7,
            rationale: 'Sell signal',
          };
        },
        getConfig() {
          return {
            strategyId: 'sell-1',
            type: 'sell',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(buyStrategy);
      await orchestrator.addStrategy(sellStrategy);

      await orchestrator.evaluateWithConflictDetection(mockMarketContext);

      expect(conflictSpy).toHaveBeenCalled();
      expect(conflictSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: mockMarketContext.marketId,
          conflicts: expect.any(Array),
        })
      );
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflicts by highest confidence', async () => {
      const strategyId1 = 'high-conf-strategy';
      const highConfidenceStrategy: IStrategy = {
        id: 'high-conf-strategy',
        name: 'HighConf',
        version: '1.0.0',
        description: 'High confidence',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            price: 0.48,
            size: 10,
            confidence: 0.9,
            rationale: 'Very confident buy',
          };
        },
        getConfig() {
          return {
            strategyId: strategyId1,
            type: 'high',
            enabled: true,
            params: {},
          };
        },
      };

      const strategyId2 = 'low-conf-strategy';
      const lowConfidenceStrategy: IStrategy = {
        id: 'low-conf-strategy',
        name: 'LowConf',
        version: '1.0.0',
        description: 'Low confidence',
        async initialize() {},
        async evaluate() {
          return {
            action: 'sell',
            side: 'SELL',
            price: 0.52,
            size: 10,
            confidence: 0.5,
            rationale: 'Weak sell signal',
          };
        },
        getConfig() {
          return {
            strategyId: strategyId2,
            type: 'low',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(highConfidenceStrategy);
      await orchestrator.addStrategy(lowConfidenceStrategy);

      const result = await orchestrator.evaluateWithConflictDetection(mockMarketContext);

      expect(result.hasConflicts).toBe(true);
      expect(result.resolvedDecision).toBeDefined();
      expect(result.resolvedDecision?.strategyId).toBe(strategyId1);
      expect(result.resolvedDecision?.decision.confidence).toBe(0.9);
    });

    it('should resolve conflicts by first-wins when configured', async () => {
      const firstOrchestrator = new StrategyOrchestrator({
        conflictResolution: 'first-wins',
      });

      const strategyId1 = 'strategy-1';
      const strategy1: IStrategy = {
        id: 'strategy-1',
        name: 'First',
        version: '1.0.0',
        description: 'First strategy',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            confidence: 0.6,
            rationale: 'First',
          };
        },
        getConfig() {
          return {
            strategyId: strategyId1,
            type: 's1',
            enabled: true,
            params: {},
          };
        },
      };

      const strategyId2 = 'strategy-2';
      const strategy2: IStrategy = {
        id: 'strategy-2',
        name: 'Second',
        version: '1.0.0',
        description: 'Second strategy',
        async initialize() {},
        async evaluate() {
          return {
            action: 'sell',
            side: 'SELL',
            confidence: 0.8,
            rationale: 'Second',
          };
        },
        getConfig() {
          return {
            strategyId: strategyId2,
            type: 's2',
            enabled: true,
            params: {},
          };
        },
      };

      await firstOrchestrator.addStrategy(strategy1);
      await firstOrchestrator.addStrategy(strategy2);

      const result = await firstOrchestrator.evaluateWithConflictDetection(mockMarketContext);

      expect(result.hasConflicts).toBe(true);
      expect(result.resolvedDecision).toBeDefined();
      // First-wins should select the first strategy, regardless of confidence
      expect([strategyId1, strategyId2]).toContain(result.resolvedDecision?.strategyId);

      await firstOrchestrator.cleanup();
    });

    it('should merge decisions when configured', async () => {
      const mergeOrchestrator = new StrategyOrchestrator({
        conflictResolution: 'merge',
      });

      const strategyId1 = 'buy-1';
      const buyStrategy1: IStrategy = {
        id: 'buy-1',
        name: 'Buy1',
        version: '1.0.0',
        description: 'Buy strategy 1',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            price: 0.48,
            size: 10,
            confidence: 0.7,
            rationale: 'Buy 1',
          };
        },
        getConfig() {
          return {
            strategyId: strategyId1,
            type: 'b1',
            enabled: true,
            params: {},
          };
        },
      };

      const strategyId2 = 'buy-2';
      const buyStrategy2: IStrategy = {
        id: 'buy-2',
        name: 'Buy2',
        version: '1.0.0',
        description: 'Buy strategy 2',
        async initialize() {},
        async evaluate() {
          return {
            action: 'buy',
            side: 'BUY',
            price: 0.46,
            size: 20,
            confidence: 0.8,
            rationale: 'Buy 2',
          };
        },
        getConfig() {
          return {
            strategyId: strategyId2,
            type: 'b2',
            enabled: true,
            params: {},
          };
        },
      };

      await mergeOrchestrator.addStrategy(buyStrategy1);
      await mergeOrchestrator.addStrategy(buyStrategy2);

      const result = await mergeOrchestrator.evaluateWithConflictDetection(mockMarketContext);

      expect(result.hasConflicts).toBe(true);
      expect(result.resolvedDecision).toBeDefined();
      expect(result.resolvedDecision?.strategyId).toBe('merged');
      expect(result.resolvedDecision?.decision.action).toBe('buy');
      expect(result.resolvedDecision?.decision.rationale).toContain('Merged from');
      expect(result.resolvedDecision?.decision.metadata?.mergedFrom).toEqual([strategyId1, strategyId2]);

      await mergeOrchestrator.cleanup();
    });
  });

  describe('Logging and Tracing', () => {
    it('should log strategy boundaries in evaluation', async () => {
      const strategy1 = new RandomStrategy();
      await strategy1.initialize({
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: { seed: 789 },
      });

      const strategy2 = new ArbitrageStrategy();
      await strategy2.initialize({
        strategyId: 'arb-1',
        type: 'arbitrage',
        enabled: true,
        params: {},
      });

      await orchestrator.addStrategy(strategy1);
      await orchestrator.addStrategy(strategy2);

      const results = await orchestrator.evaluateAll(mockMarketContext);

      // Each result should have clear strategy identification
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.strategyId).toBeDefined();
        expect(result.strategyName).toBeDefined();
        expect(result.timestamp).toBeDefined();
      });
    });

    it('should track per-strategy metrics', async () => {
      const strategyId = 'random-1';
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId,
        type: 'random',
        enabled: true,
        params: { seed: 999 },
      });

      await orchestrator.addStrategy(strategy);

      // Run evaluations
      for (let i = 0; i < 3; i++) {
        await orchestrator.evaluateAll(mockMarketContext);
      }

      const allStats = orchestrator.getAllStats();
      
      expect(Object.keys(allStats)).toHaveLength(1);
      expect(allStats[strategyId]).toBeDefined();
      expect(allStats[strategyId].totalEvaluations).toBe(3);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all strategies on orchestrator cleanup', async () => {
      const cleanupSpy = vi.fn();

      const mockStrategy: IStrategy = {
        id: 'mock-strategy',
        name: 'Mock',
        version: '1.0.0',
        description: 'Mock strategy',
        async initialize() {},
        async evaluate() {
          return {
            action: 'hold',
            confidence: 0.5,
            rationale: 'Mock decision',
          };
        },
        async cleanup() {
          cleanupSpy();
        },
        getConfig() {
          return {
            strategyId: 'mock-1',
            type: 'mock',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(mockStrategy);
      await orchestrator.cleanup();

      expect(cleanupSpy).toHaveBeenCalled();
      expect(orchestrator.getStrategyCount()).toBe(0);
    });
  });
});
