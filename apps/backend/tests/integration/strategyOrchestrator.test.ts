/**
 * Integration Tests for StrategyOrchestrator
 * 
 * Tests the orchestrator with real strategy instances and
 * validates end-to-end multi-strategy execution.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { StrategyOrchestrator } from '../../src/trading/strategies/StrategyOrchestrator';
import { registerStrategies, StrategyFactory } from '../../src/trading/strategies';
import type { IStrategy, MarketContext } from '../../src/trading/strategies/types';

describe('StrategyOrchestrator - Integration', () => {
  beforeAll(() => {
    // Register all built-in strategies
    registerStrategies();
  });

  afterAll(() => {
    StrategyFactory.clear();
  });

  describe('Multi-Strategy Orchestration with Real Strategies', () => {
    let orchestrator: StrategyOrchestrator;
    
    const mockMarketContext: MarketContext = {
      marketId: 'integration-test-market',
      tokenId: 'token-xyz',
      bestBid: 0.48,
      bestAsk: 0.52,
      mid: 0.50,
      spread: 0.04,
      liquidity: {
        bidSize: 100,
        askSize: 100,
      },
      timestamp: new Date().toISOString(),
      orderBook: {
        bids: [
          { price: 0.48, size: 100 },
          { price: 0.47, size: 50 },
        ],
        asks: [
          { price: 0.52, size: 100 },
          { price: 0.53, size: 50 },
        ],
      },
    };

    beforeEach(() => {
      orchestrator = new StrategyOrchestrator({
        maxStrategies: 10,
        enableConflictDetection: true,
        conflictResolution: 'highest-confidence',
        enableStateIsolation: true,
      });
    });

    afterEach(async () => {
      await orchestrator.cleanup();
    });

    it('should orchestrate multiple strategy types simultaneously', async () => {
      // Create multiple strategies of different types
      const strategies = await StrategyFactory.createAll([
        {
          strategyId: 'random-strategy-1',
          type: 'random',
          enabled: true,
          params: {
            buyProbability: 0.5,
            sellProbability: 0.5,
            seed: 12345,
          },
        },
        {
          strategyId: 'arbitrage-strategy-1',
          type: 'arbitrage',
          enabled: true,
          params: {
            minProfitBps: 50,
            maxOrderSize: 100,
          },
        },
        {
          strategyId: 'mean-reversion-strategy-1',
          type: 'mean-reversion',
          enabled: true,
          params: {
            lookbackPeriod: 10,
            entryThreshold: 1.5,
          },
        },
      ]);

      // Add all strategies to orchestrator
      for (const strategy of strategies) {
        await orchestrator.addStrategy(strategy);
      }

      expect(orchestrator.getStrategyCount()).toBe(3);

      // Evaluate all strategies
      const results = await orchestrator.evaluateAll(mockMarketContext);

      expect(results).toHaveLength(3);
      
      // Verify each strategy produced a result (using config strategyIds)
      const strategyIds = results.map(r => r.strategyId);
      expect(strategyIds).toContain('random-strategy-1');
      expect(strategyIds).toContain('arbitrage-strategy-1');
      expect(strategyIds).toContain('mean-reversion-strategy-1');

      // All results should have valid decisions
      results.forEach(result => {
        expect(result.decision).toBeDefined();
        expect(result.decision.action).toMatch(/^(buy|sell|hold|cancel)$/);
        expect(result.decision.confidence).toBeGreaterThanOrEqual(0);
        expect(result.decision.confidence).toBeLessThanOrEqual(1);
        expect(result.decision.rationale).toBeDefined();
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      });
    });

    it('should maintain state isolation across strategies', async () => {
      const arbitrageStrategy = await StrategyFactory.create({
        strategyId: 'arb-isolated-1',
        type: 'arbitrage',
        enabled: true,
        params: {},
      });

      const meanReversionStrategy = await StrategyFactory.create({
        strategyId: 'mr-isolated-1',
        type: 'mean-reversion',
        enabled: true,
        params: {},
      });

      await orchestrator.addStrategy(arbitrageStrategy);
      await orchestrator.addStrategy(meanReversionStrategy);

      // Update positions for each strategy independently (use config strategyIds)
      orchestrator.updateStrategyPosition('arb-isolated-1', 'token-xyz', {
        tokenId: 'token-xyz',
        size: 50,
        avgPrice: 0.48,
        unrealizedPnl: 10,
        realizedPnl: 5,
      });

      orchestrator.updateStrategyPosition('mr-isolated-1', 'token-xyz', {
        tokenId: 'token-xyz',
        size: -30,
        avgPrice: 0.52,
        unrealizedPnl: -5,
        realizedPnl: 2,
      });

      // Verify isolated state (use config strategyIds)
      const arbState = orchestrator.getStrategyState('arb-isolated-1');
      const mrState = orchestrator.getStrategyState('mr-isolated-1');

      expect(arbState).toBeDefined();
      expect(mrState).toBeDefined();

      const arbPosition = arbState?.positions.get('token-xyz');
      const mrPosition = mrState?.positions.get('token-xyz');

      expect(arbPosition?.size).toBe(50);
      expect(arbPosition?.avgPrice).toBe(0.48);
      expect(mrPosition?.size).toBe(-30);
      expect(mrPosition?.avgPrice).toBe(0.52);

      // Positions should be completely isolated
      expect(arbState).not.toBe(mrState);
    });

    it('should detect and resolve conflicts between strategies', async () => {
      // Create strategies with deterministic opposite directions to ensure conflict
      const buyStrategy: IStrategy = {
        id: 'buy-strategy',
        name: 'BuyStrategy',
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
            rationale: 'Buy signal',
          };
        },
        getConfig() {
          return {
            strategyId: 'deterministic-buy',
            type: 'buy',
            enabled: true,
            params: {},
          };
        },
      };

      const sellStrategy: IStrategy = {
        id: 'sell-strategy',
        name: 'SellStrategy',
        version: '1.0.0',
        description: 'Always sells',
        async initialize() {},
        async evaluate() {
          return {
            action: 'sell',
            side: 'SELL',
            price: 0.52,
            size: 10,
            confidence: 0.7,
            rationale: 'Sell signal',
          };
        },
        getConfig() {
          return {
            strategyId: 'deterministic-sell',
            type: 'sell',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(buyStrategy);
      await orchestrator.addStrategy(sellStrategy);

      // Run conflict detection
      const result = await orchestrator.evaluateWithConflictDetection(mockMarketContext);

      // Should detect conflict with opposing directions
      expect(result).toBeDefined();
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].reason).toContain('Opposing trade directions');
      
      // Should have resolved decision
      expect(result.resolvedDecision).toBeDefined();
      expect(result.resolvedDecision?.decision.action).toBeDefined();
    });

    it('should track performance metrics per strategy', async () => {
      const strategyId = 'metrics-test-strategy';
      const strategy = await StrategyFactory.create({
        strategyId,
        type: 'random',
        enabled: true,
        params: { seed: 999 },
      });

      await orchestrator.addStrategy(strategy);

      // Run multiple evaluations
      const evaluationCount = 10;
      for (let i = 0; i < evaluationCount; i++) {
        await orchestrator.evaluateAll(mockMarketContext);
      }

      // Check stats (use config strategyId)
      const stats = orchestrator.getStrategyStats(strategyId);

      expect(stats).toBeDefined();
      expect(stats?.totalEvaluations).toBe(evaluationCount);
      expect(stats?.successfulEvaluations + stats?.failedEvaluations).toBe(evaluationCount);
      expect(stats?.averageExecutionTime).toBeGreaterThanOrEqual(0);

      // Check aggregated stats (use config strategyId)
      const allStats = orchestrator.getAllStats();
      expect(Object.keys(allStats)).toContain(strategyId);
      expect(allStats[strategyId].totalEvaluations).toBe(evaluationCount);
    });

    it('should handle strategy errors without crashing', async () => {
      const goodStrategy = await StrategyFactory.create({
        strategyId: 'good-strategy',
        type: 'random',
        enabled: true,
        params: {},
      });

      // Create a mock failing strategy
      const failingStrategy: IStrategy = {
        id: 'failing-integration-strategy',
        name: 'FailingIntegration',
        version: '1.0.0',
        description: 'Intentionally fails',
        async initialize() {},
        async evaluate() {
          throw new Error('Simulated strategy error');
        },
        getConfig() {
          return {
            strategyId: 'failing',
            type: 'failing',
            enabled: true,
            params: {},
          };
        },
      };

      await orchestrator.addStrategy(goodStrategy);
      await orchestrator.addStrategy(failingStrategy);

      // Should not throw, but handle the error gracefully
      const results = await orchestrator.evaluateAll(mockMarketContext);

      expect(results).toHaveLength(2);

      // Good strategy should succeed
      const goodResult = results.find(r => r.strategyId === 'good-strategy');
      expect(goodResult).toBeDefined();
      expect(goodResult?.error).toBeUndefined();

      // Failing strategy should have error and fallback to hold
      const failingResult = results.find(r => r.strategyId === 'failing');
      expect(failingResult).toBeDefined();
      expect(failingResult?.error).toBeDefined();
      expect(failingResult?.error?.message).toBe('Simulated strategy error');
      expect(failingResult?.decision.action).toBe('hold');

      // Check that failure was tracked
      const failingStats = orchestrator.getStrategyStats('failing');
      expect(failingStats?.failedEvaluations).toBe(1);
    });

    it('should support different conflict resolution strategies', async () => {
      // Test highest-confidence resolution
      const highConfOrchestrator = new StrategyOrchestrator({
        conflictResolution: 'highest-confidence',
      });

      // Test merge resolution
      const mergeOrchestrator = new StrategyOrchestrator({
        conflictResolution: 'merge',
      });

      const strategies = await StrategyFactory.createAll([
        {
          strategyId: 'test-1',
          type: 'random',
          enabled: true,
          params: { seed: 1 },
        },
        {
          strategyId: 'test-2',
          type: 'random',
          enabled: true,
          params: { seed: 2 },
        },
      ]);

      // Add to both orchestrators
      for (const strategy of strategies) {
        await highConfOrchestrator.addStrategy(strategy);
      }

      const strategies2 = await StrategyFactory.createAll([
        {
          strategyId: 'test-3',
          type: 'random',
          enabled: true,
          params: { seed: 3 },
        },
        {
          strategyId: 'test-4',
          type: 'random',
          enabled: true,
          params: { seed: 4 },
        },
      ]);

      for (const strategy of strategies2) {
        await mergeOrchestrator.addStrategy(strategy);
      }

      // Both should work without errors
      const highConfResult = await highConfOrchestrator.evaluateWithConflictDetection(mockMarketContext);
      const mergeResult = await mergeOrchestrator.evaluateWithConflictDetection(mockMarketContext);

      expect(highConfResult).toBeDefined();
      expect(mergeResult).toBeDefined();

      // Cleanup
      await highConfOrchestrator.cleanup();
      await mergeOrchestrator.cleanup();
    });

    it('should emit events during orchestration', async () => {
      const events: string[] = [];

      orchestrator.on('strategyAdded', () => events.push('added'));
      orchestrator.on('strategyRemoved', () => events.push('removed'));
      orchestrator.on('strategyError', () => events.push('error'));

      const strategyId = 'event-test';
      const strategy = await StrategyFactory.create({
        strategyId,
        type: 'random',
        enabled: true,
        params: {},
      });

      await orchestrator.addStrategy(strategy);
      expect(events).toContain('added');

      await orchestrator.removeStrategy(strategyId);
      expect(events).toContain('removed');
    });
  });
});
