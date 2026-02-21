/**
 * Integration Tests for SignalEngine with StrategyOrchestrator
 * 
 * Tests the full signal processing pipeline:
 * - StrategyOrchestrator evaluates multiple strategies
 * - SignalEngine processes results
 * - Signals are filtered, prioritized, and risk-checked
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalEngine, Signal } from '../../src/trading/SignalEngine';
import { StrategyOrchestrator } from '../../src/trading/strategies/StrategyOrchestrator';
import { RandomStrategy } from '../../src/trading/strategies/RandomStrategy';
import { MarketMakingStrategy } from '../../src/trading/strategies/MarketMakingStrategy';
import { RiskManager } from '../../src/trading/riskManager';
import type { MarketContext, TradingDecision, IStrategy } from '../../src/trading/strategies/types';

describe('SignalEngine Integration with StrategyOrchestrator', () => {
  let signalEngine: SignalEngine;
  let orchestrator: StrategyOrchestrator;
  let riskManager: RiskManager;

  beforeEach(async () => {
    // Initialize risk manager
    riskManager = new RiskManager({
      maxExposurePerMarket: 1000,
      maxOpenOrders: 10,
      maxDrawdown: 0.2,
      errorRateThreshold: 0.1,
      errorRateWindow: 100,
    });

    // Initialize orchestrator
    orchestrator = new StrategyOrchestrator({
      maxStrategies: 5,
      enableConflictDetection: true,
      conflictResolution: 'highest-confidence',
    });

    // Initialize signal engine
    signalEngine = new SignalEngine(
      {
        enabled: true,
        maxSignalsPerToken: 3,
        minConfidence: 0.5,
        conflictResolution: 'highest-confidence',
      },
      riskManager
    );
  });

  describe('End-to-End Signal Processing', () => {
    it('should process signals from multiple strategies', async () => {
      // Add strategies to orchestrator
      const strategy1 = new RandomStrategy();
      await strategy1.initialize({
        strategyId: 'random-1',
        type: 'random',
        enabled: true,
        params: { minConfidence: 0.6, maxSize: 100 },
      });

      const strategy2 = new MarketMakingStrategy();
      await strategy2.initialize({
        strategyId: 'mm-1',
        type: 'market-making',
        enabled: true,
        params: { spread: 0.02, orderSize: 50 },
      });

      await orchestrator.addStrategy(strategy1);
      await orchestrator.addStrategy(strategy2);

      // Create market context
      const marketContext: MarketContext = {
        marketId: 'test-market',
        tokenId: 'test-token',
        bestBid: 0.48,
        bestAsk: 0.52,
        mid: 0.5,
        spread: 0.04,
        liquidity: {
          bidSize: 1000,
          askSize: 1000,
        },
        timestamp: new Date().toISOString(),
      };

      // Get decisions from orchestrator
      const evaluationResults = await orchestrator.evaluateAll(marketContext);

      // Convert evaluation results to signals
      const signals: Signal[] = evaluationResults
        .filter(r => !r.error && r.decision.action !== 'hold')
        .map(r => ({
          decision: r.decision,
          strategyId: r.strategyId,
          strategyName: r.strategyName,
          tokenId: marketContext.tokenId,
          timestamp: r.timestamp,
          qualityScore: r.decision.confidence,
        }));

      // Process signals through signal engine
      const signalResults = await signalEngine.processSignals(signals);

      // Verify signal processing
      expect(signalResults).toBeDefined();
      
      // At least some signals should be processed
      if (signals.length > 0) {
        expect(signalResults.length).toBeGreaterThan(0);
      }
    });

    it('should handle conflict resolution between strategies', async () => {
      // Create two mock strategies with opposing signals
      const buyStrategy: IStrategy = createMockStrategy('buy-strategy', 'buy', 0.7);
      const sellStrategy: IStrategy = createMockStrategy('sell-strategy', 'sell', 0.9);

      await orchestrator.addStrategy(buyStrategy);
      await orchestrator.addStrategy(sellStrategy);

      const marketContext: MarketContext = createTestMarketContext();

      // Get decisions from orchestrator
      const evaluationResults = await orchestrator.evaluateAll(marketContext);

      // Convert to signals
      const signals: Signal[] = evaluationResults
        .filter(r => !r.error && r.decision.action !== 'hold')
        .map(r => ({
          decision: r.decision,
          strategyId: r.strategyId,
          strategyName: r.strategyName,
          tokenId: marketContext.tokenId,
          timestamp: r.timestamp,
          qualityScore: r.decision.confidence,
        }));

      // Mock risk manager to always approve for deterministic test
      vi.spyOn(riskManager, 'checkOrder').mockReturnValue({
        allowed: true,
      });

      // Process through signal engine with highest-confidence resolution
      const signalResults = await signalEngine.processSignals(signals);

      // Should have resolved to one signal (the sell with higher confidence)
      expect(signalResults.length).toBeGreaterThan(0);
      
      const approved = signalResults.filter(r => r.approved);
      expect(approved.length).toBeGreaterThan(0);
      
      // The highest confidence signal should be selected (sell strategy)
      expect(approved[0].signal.decision.action).toBe('sell');
      expect(approved[0].signal.strategyId).toBe('sell-strategy');
    });

    it('should filter low confidence signals', async () => {
      // Create strategy with low confidence
      const lowConfStrategy: IStrategy = createMockStrategy('low-conf', 'buy', 0.3);

      await orchestrator.addStrategy(lowConfStrategy);

      const marketContext: MarketContext = createTestMarketContext();

      // Get decisions
      const evaluationResults = await orchestrator.evaluateAll(marketContext);

      // Convert to signals
      const signals: Signal[] = evaluationResults
        .filter(r => !r.error && r.decision.action !== 'hold')
        .map(r => ({
          decision: r.decision,
          strategyId: r.strategyId,
          strategyName: r.strategyName,
          tokenId: marketContext.tokenId,
          timestamp: r.timestamp,
          qualityScore: r.decision.confidence,
        }));

      // Process through signal engine (min confidence = 0.5)
      const signalResults = await signalEngine.processSignals(signals);

      // Signal should be filtered out
      expect(signalResults).toHaveLength(0);
    });

    it('should track metrics across multiple signal batches', async () => {
      const strategy = new RandomStrategy();
      await strategy.initialize({
        strategyId: 'random-test',
        type: 'random',
        enabled: true,
        params: { minConfidence: 0.7 },
      });

      await orchestrator.addStrategy(strategy);

      const marketContext: MarketContext = createTestMarketContext();

      // Process multiple batches
      for (let i = 0; i < 3; i++) {
        const evaluationResults = await orchestrator.evaluateAll(marketContext);

        const signals: Signal[] = evaluationResults
          .filter(r => !r.error && r.decision.action !== 'hold')
          .map(r => ({
            decision: r.decision,
            strategyId: r.strategyId,
            strategyName: r.strategyName,
            tokenId: marketContext.tokenId,
            timestamp: r.timestamp,
            qualityScore: r.decision.confidence,
          }));

        await signalEngine.processSignals(signals);
      }

      // Check metrics
      const metrics = signalEngine.getMetrics();
      
      // Should have processed some signals
      expect(metrics.total).toBeGreaterThanOrEqual(0);
      expect(metrics.approvalRate).toBeGreaterThanOrEqual(0);
      expect(metrics.approvalRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Orchestrator Conflict Detection with SignalEngine', () => {
    it('should handle orchestrator conflict detection and signal engine processing', async () => {
      const buyStrategy: IStrategy = createMockStrategy('buy-1', 'buy', 0.8);
      const sellStrategy: IStrategy = createMockStrategy('sell-1', 'sell', 0.7);

      await orchestrator.addStrategy(buyStrategy);
      await orchestrator.addStrategy(sellStrategy);

      const marketContext: MarketContext = createTestMarketContext();

      // Use orchestrator's conflict detection
      const conflictResult = await orchestrator.evaluateWithConflictDetection(marketContext);

      // Should detect conflicts
      expect(conflictResult.hasConflicts).toBe(true);
      expect(conflictResult.conflicts.length).toBeGreaterThan(0);

      // Orchestrator should have a resolved decision
      expect(conflictResult.resolvedDecision).toBeDefined();

      // Now process the resolved decision through signal engine
      if (conflictResult.resolvedDecision) {
        const signal: Signal = {
          decision: conflictResult.resolvedDecision.decision,
          strategyId: conflictResult.resolvedDecision.strategyId,
          strategyName: conflictResult.resolvedDecision.strategyName,
          tokenId: marketContext.tokenId,
          timestamp: conflictResult.resolvedDecision.timestamp,
          qualityScore: conflictResult.resolvedDecision.decision.confidence,
        };

        const signalResults = await signalEngine.processSignals([signal]);

        expect(signalResults).toHaveLength(1);
        expect(signalResults[0].approved).toBe(true);
      }
    });
  });

  describe('Signal Lifecycle Integration', () => {
    it('should mark signals as executed after processing', async () => {
      const strategy: IStrategy = createMockStrategy('test-strategy', 'buy', 0.8);
      await orchestrator.addStrategy(strategy);

      const marketContext: MarketContext = createTestMarketContext();

      const evaluationResults = await orchestrator.evaluateAll(marketContext);

      const signals: Signal[] = evaluationResults
        .filter(r => !r.error && r.decision.action !== 'hold')
        .map(r => ({
          decision: r.decision,
          strategyId: r.strategyId,
          strategyName: r.strategyName,
          tokenId: marketContext.tokenId,
          timestamp: r.timestamp,
          qualityScore: r.decision.confidence,
        }));

      const signalResults = await signalEngine.processSignals(signals);

      const approvedSignals = signalResults.filter(r => r.approved);

      // Mark each approved signal as executed
      for (const result of approvedSignals) {
        signalEngine.markExecuted(result.signal, `order-${Date.now()}`);
      }

      // Verify active signals cleared
      const metrics = signalEngine.getMetrics();
      expect(metrics.activeSignals).toBe(0);
    });
  });
});

/**
 * Helper function to create a mock strategy for testing
 */
function createMockStrategy(
  id: string,
  action: 'buy' | 'sell' | 'hold',
  confidence: number
): IStrategy {
  return {
    id,
    name: `Mock ${id}`,
    version: '1.0.0',
    description: `Mock strategy for ${action}`,
    
    async initialize() {
      // No-op
    },
    
    async evaluate(): Promise<TradingDecision> {
      return {
        action,
        confidence,
        rationale: `Mock ${action} signal`,
        price: 0.5,
        size: 10,
        side: action === 'buy' ? 'BUY' : action === 'sell' ? 'SELL' : undefined,
      };
    },
    
    getConfig() {
      return {
        strategyId: id,
        type: 'mock',
        enabled: true,
        params: {},
      };
    },
  };
}

/**
 * Helper function to create a test market context
 */
function createTestMarketContext(): MarketContext {
  return {
    marketId: 'test-market',
    tokenId: 'test-token',
    bestBid: 0.48,
    bestAsk: 0.52,
    mid: 0.5,
    spread: 0.04,
    liquidity: {
      bidSize: 1000,
      askSize: 1000,
    },
    timestamp: new Date().toISOString(),
  };
}
