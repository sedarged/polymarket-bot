/**
 * Unit tests for SignalEngine
 * 
 * Tests GAP-010 implementation:
 * - Signal collection and filtering
 * - Conflict resolution strategies
 * - Risk checks integration
 * - Signal performance tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalEngine, Signal, SignalEngineConfig } from '../../src/trading/SignalEngine';
import { RiskManager } from '../../src/trading/riskManager';
import type { TradingDecision } from '../../src/trading/strategies/types';

describe('SignalEngine', () => {
  let signalEngine: SignalEngine;
  let riskManager: RiskManager;
  let config: SignalEngineConfig;

  beforeEach(() => {
    // Mock risk manager
    riskManager = new RiskManager({
      maxExposurePerMarket: 1000,
      maxOpenOrders: 10,
      maxDrawdown: 0.2,
      errorRateThreshold: 0.1,
      errorRateWindow: 100,
    });

    config = {
      enabled: true,
      maxSignalsPerToken: 3,
      minConfidence: 0.5,
      conflictResolution: 'highest-confidence',
    };

    signalEngine = new SignalEngine(config, riskManager);
  });

  describe('Signal Processing', () => {
    it('should process signals successfully', async () => {
      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      const results = await signalEngine.processSignals([signal]);

      expect(results).toHaveLength(1);
      expect(results[0].approved).toBe(true);
      expect(results[0].signal.strategyId).toBe('strategy-1');
    });

    it('should filter signals below minimum confidence', async () => {
      const lowConfSignal: Signal = createTestSignal('strategy-1', 'buy', 0.3);
      const results = await signalEngine.processSignals([lowConfSignal]);

      expect(results).toHaveLength(0);
    });

    it('should process multiple signals from different strategies', async () => {
      const signal1: Signal = createTestSignal('strategy-1', 'buy', 0.7);
      const signal2: Signal = createTestSignal('strategy-2', 'buy', 0.8);
      
      const results = await signalEngine.processSignals([signal1, signal2]);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array when disabled', async () => {
      const disabledEngine = new SignalEngine(
        { ...config, enabled: false },
        riskManager
      );

      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      const results = await disabledEngine.processSignals([signal]);

      expect(results).toHaveLength(0);
    });
  });

  describe('Conflict Resolution - Highest Confidence', () => {
    beforeEach(() => {
      config.conflictResolution = 'highest-confidence';
      signalEngine = new SignalEngine(config, riskManager);
    });

    it('should select signal with highest confidence', async () => {
      const signal1: Signal = createTestSignal('strategy-1', 'buy', 0.6, 'token-1');
      const signal2: Signal = createTestSignal('strategy-2', 'buy', 0.9, 'token-1');
      const signal3: Signal = createTestSignal('strategy-3', 'buy', 0.7, 'token-1');

      const results = await signalEngine.processSignals([signal1, signal2, signal3]);

      expect(results).toHaveLength(1);
      expect(results[0].signal.strategyId).toBe('strategy-2');
      expect(results[0].signal.decision.confidence).toBe(0.9);
    });

    it('should handle conflicting buy/sell signals', async () => {
      const buySignal: Signal = createTestSignal('strategy-1', 'buy', 0.7, 'token-1');
      const sellSignal: Signal = createTestSignal('strategy-2', 'sell', 0.9, 'token-1');

      const results = await signalEngine.processSignals([buySignal, sellSignal]);

      // Should pick the sell signal (higher confidence)
      expect(results).toHaveLength(1);
      expect(results[0].signal.decision.action).toBe('sell');
    });
  });

  describe('Conflict Resolution - First Wins', () => {
    beforeEach(() => {
      config.conflictResolution = 'first-wins';
      signalEngine = new SignalEngine(config, riskManager);
    });

    it('should select first signal', async () => {
      const signal1: Signal = createTestSignal('strategy-1', 'buy', 0.6, 'token-1');
      const signal2: Signal = createTestSignal('strategy-2', 'buy', 0.9, 'token-1');

      const results = await signalEngine.processSignals([signal1, signal2]);

      expect(results).toHaveLength(1);
      expect(results[0].signal.strategyId).toBe('strategy-1');
    });
  });

  describe('Conflict Resolution - Aggregate', () => {
    beforeEach(() => {
      config.conflictResolution = 'aggregate';
      signalEngine = new SignalEngine(config, riskManager);
    });

    it('should aggregate multiple buy signals', async () => {
      const signal1: Signal = createTestSignal('strategy-1', 'buy', 0.7, 'token-1', 0.5, 10);
      const signal2: Signal = createTestSignal('strategy-2', 'buy', 0.8, 'token-1', 0.6, 15);

      const results = await signalEngine.processSignals([signal1, signal2]);

      expect(results).toHaveLength(1);
      expect(results[0].signal.decision.action).toBe('buy');
      expect(results[0].signal.decision.price).toBe(0.55); // Average of 0.5 and 0.6
      expect(results[0].signal.decision.size).toBe(25); // Sum of 10 and 15
      expect(results[0].signal.decision.metadata?.aggregated).toBe(true);
    });

    it('should aggregate multiple sell signals', async () => {
      const signal1: Signal = createTestSignal('strategy-1', 'sell', 0.7, 'token-1', 0.5, 10);
      const signal2: Signal = createTestSignal('strategy-2', 'sell', 0.8, 'token-1', 0.6, 15);

      const results = await signalEngine.processSignals([signal1, signal2]);

      expect(results).toHaveLength(1);
      expect(results[0].signal.decision.action).toBe('sell');
    });

    it('should cancel out conflicting buy and sell signals', async () => {
      const buySignal: Signal = createTestSignal('strategy-1', 'buy', 0.7, 'token-1');
      const sellSignal: Signal = createTestSignal('strategy-2', 'sell', 0.7, 'token-1');

      const results = await signalEngine.processSignals([buySignal, sellSignal]);

      // Equal buy and sell should cancel out
      expect(results).toHaveLength(0);
    });

    it('should favor majority action when aggregating', async () => {
      const buySignal1: Signal = createTestSignal('strategy-1', 'buy', 0.7, 'token-1');
      const buySignal2: Signal = createTestSignal('strategy-2', 'buy', 0.8, 'token-1');
      const sellSignal: Signal = createTestSignal('strategy-3', 'sell', 0.9, 'token-1');

      const results = await signalEngine.processSignals([buySignal1, buySignal2, sellSignal]);

      // 2 buy vs 1 sell = buy should win
      expect(results).toHaveLength(1);
      expect(results[0].signal.decision.action).toBe('buy');
    });

    it('should return empty when hold signals dominate', async () => {
      const buySignal: Signal = createTestSignal('strategy-1', 'buy', 0.7, 'token-1');
      const holdSignal1: Signal = createTestSignal('strategy-2', 'hold', 0.8, 'token-1');
      const holdSignal2: Signal = createTestSignal('strategy-3', 'hold', 0.8, 'token-1');

      const results = await signalEngine.processSignals([buySignal, holdSignal1, holdSignal2]);

      // Hold signals dominate
      expect(results).toHaveLength(0);
    });
  });

  describe('Risk Checks', () => {
    it('should reject signals that fail risk checks', async () => {
      // Mock risk manager to reject
      vi.spyOn(riskManager, 'checkOrder').mockReturnValue({
        allowed: false,
        reason: 'Max exposure exceeded',
      });

      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      const results = await signalEngine.processSignals([signal]);

      expect(results).toHaveLength(1);
      expect(results[0].approved).toBe(false);
      expect(results[0].reason).toContain('Max exposure exceeded');
    });

    it('should approve signals that pass risk checks', async () => {
      // Mock risk manager to approve
      vi.spyOn(riskManager, 'checkOrder').mockReturnValue({
        allowed: true,
      });

      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      const results = await signalEngine.processSignals([signal]);

      expect(results).toHaveLength(1);
      expect(results[0].approved).toBe(true);
    });

    it('should enforce max signals per token limit', async () => {
      const signals: Signal[] = [];
      for (let i = 0; i < 5; i++) {
        signals.push(createTestSignal(`strategy-${i}`, 'buy', 0.8, 'token-1'));
      }

      const results = await signalEngine.processSignals(signals);

      // Should only approve up to maxSignalsPerToken (3)
      const approved = results.filter(r => r.approved);
      expect(approved.length).toBeLessThanOrEqual(config.maxSignalsPerToken);
    });
  });

  describe('Signal Lifecycle Management', () => {
    it('should mark signals as executed', async () => {
      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      await signalEngine.processSignals([signal]);

      signalEngine.markExecuted(signal, 'order-123');

      const metrics = signalEngine.getMetrics();
      expect(metrics.activeSignals).toBe(0);
    });

    it('should mark signals as failed', async () => {
      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      await signalEngine.processSignals([signal]);

      const error = new Error('Execution failed');
      signalEngine.markFailed(signal, error);

      const metrics = signalEngine.getMetrics();
      expect(metrics.activeSignals).toBe(0);
    });

    it('should clear all active signals', async () => {
      const signal1: Signal = createTestSignal('strategy-1', 'buy', 0.8, 'token-1');
      const signal2: Signal = createTestSignal('strategy-2', 'buy', 0.7, 'token-2');
      
      await signalEngine.processSignals([signal1, signal2]);

      signalEngine.clearActiveSignals();

      const metrics = signalEngine.getMetrics();
      expect(metrics.activeSignals).toBe(0);
    });
  });

  describe('Performance Tracking', () => {
    it('should track signal metrics', async () => {
      const signal1: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      const signal2: Signal = createTestSignal('strategy-2', 'buy', 0.3); // Below threshold
      
      await signalEngine.processSignals([signal1, signal2]);

      const metrics = signalEngine.getMetrics();
      
      expect(metrics.total).toBe(1); // Only signal1 processed
      expect(metrics.approved).toBeGreaterThan(0);
      expect(metrics.approvalRate).toBeGreaterThan(0);
    });

    it('should track per-strategy metrics', async () => {
      // Use different tokens to avoid conflict resolution
      const signal1: Signal = createTestSignal('strategy-1', 'buy', 0.8, 'token-1');
      const signal2: Signal = createTestSignal('strategy-2', 'buy', 0.7, 'token-2');
      
      await signalEngine.processSignals([signal1, signal2]);

      const metrics = signalEngine.getMetrics();
      
      expect(metrics.byStrategy['strategy-1']).toBeDefined();
      expect(metrics.byStrategy['strategy-2']).toBeDefined();
    });

    it('should maintain signal history', async () => {
      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      await signalEngine.processSignals([signal]);

      const history = signalEngine.getHistory();
      
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].signal.strategyId).toBe('strategy-1');
    });

    it('should limit history size', async () => {
      const engineWithSmallHistory = new SignalEngine(
        { ...config, maxHistorySize: 5 },
        riskManager
      );

      // Generate more signals than history size
      for (let i = 0; i < 10; i++) {
        const signal: Signal = createTestSignal(`strategy-${i}`, 'buy', 0.8);
        await engineWithSmallHistory.processSignals([signal]);
      }

      const history = engineWithSmallHistory.getHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Events', () => {
    it('should emit signalProcessed event', async () => {
      const eventSpy = vi.fn();
      signalEngine.on('signalProcessed', eventSpy);

      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      await signalEngine.processSignals([signal]);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should emit signalExecuted event', async () => {
      const eventSpy = vi.fn();
      signalEngine.on('signalExecuted', eventSpy);

      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      await signalEngine.processSignals([signal]);
      signalEngine.markExecuted(signal, 'order-123');

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: expect.any(Object),
          orderId: 'order-123',
        })
      );
    });

    it('should emit signalFailed event', async () => {
      const eventSpy = vi.fn();
      signalEngine.on('signalFailed', eventSpy);

      const signal: Signal = createTestSignal('strategy-1', 'buy', 0.8);
      await signalEngine.processSignals([signal]);
      
      const error = new Error('Test error');
      signalEngine.markFailed(signal, error);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: expect.any(Object),
          error: expect.any(Error),
        })
      );
    });
  });

  describe('Configuration', () => {
    it('should return configuration', () => {
      const returnedConfig = signalEngine.getConfig();
      
      expect(returnedConfig.enabled).toBe(config.enabled);
      expect(returnedConfig.minConfidence).toBe(config.minConfidence);
      expect(returnedConfig.conflictResolution).toBe(config.conflictResolution);
    });
  });
});

/**
 * Helper function to create test signals
 */
function createTestSignal(
  strategyId: string,
  action: 'buy' | 'sell' | 'hold',
  confidence: number,
  tokenId: string = 'test-token',
  price?: number,
  size?: number
): Signal {
  const decision: TradingDecision = {
    action,
    confidence,
    rationale: `Test ${action} signal`,
    price: price ?? 0.5,
    size: size ?? 10,
    side: action === 'buy' ? 'BUY' : action === 'sell' ? 'SELL' : undefined,
  };

  return {
    decision,
    strategyId,
    strategyName: `Strategy ${strategyId}`,
    tokenId,
    timestamp: new Date().toISOString(),
    qualityScore: confidence,
  };
}
