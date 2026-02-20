/**
 * Integration Tests for Signal Routing and Error Handling
 * 
 * Addresses GAP-033: Integration Test Coverage
 * 
 * Tests end-to-end signal routing from SignalCatalog to Strategies:
 * - Signal registration and retrieval
 * - Signal propagation to strategies via updateSignals()
 * - Error handling for catalog failures
 * - Error handling for signal processing errors
 * - Signal versioning compatibility
 * - Multi-signal routing scenarios
 * - Cascading failure scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignalCatalog } from '../../src/learning/signalCatalog';
import { StrategyOrchestrator } from '../../src/trading/strategies/StrategyOrchestrator';
import { registerStrategies, StrategyFactory } from '../../src/trading/strategies';
import type { IStrategy, MarketContext, TradingDecision, Position } from '../../src/trading/strategies/types';
import type { SignalDefinition } from '../../src/learning/types';
import path from 'path';
import fs from 'fs';

/**
 * Helper to safely call updateSignals on a strategy
 * Provides type-safe handling of the optional updateSignals hook
 */
function updateStrategySignals(strategy: IStrategy, signals: Record<string, unknown>): void {
  if (strategy.updateSignals) {
    strategy.updateSignals(signals);
  } else {
    throw new Error(`Strategy ${strategy.id} does not implement updateSignals hook`);
  }
}

// Mock strategy that implements updateSignals hook
class SignalAwareStrategy implements IStrategy {
  readonly id: string;
  readonly name = 'SignalAwareStrategy';
  readonly version = '1.0.0';
  readonly description = 'Test strategy that uses signals';
  
  private config: any;
  private receivedSignals: Record<string, unknown>[] = [];
  private shouldThrowOnSignalUpdate = false;
  
  constructor(id: string) {
    this.id = id;
  }

  async initialize(config: any): Promise<void> {
    this.config = config;
  }

  async evaluate(context: MarketContext, position?: Position): Promise<TradingDecision> {
    // Use signals to inform decision if available
    const hasSignals = this.receivedSignals.length > 0;
    const lastSignal = hasSignals ? this.receivedSignals[this.receivedSignals.length - 1] : null;
    
    return {
      action: 'hold',
      confidence: hasSignals ? 0.8 : 0.5,
      rationale: hasSignals 
        ? `Using ${this.receivedSignals.length} signals, last: ${JSON.stringify(lastSignal)}`
        : 'No signals received',
      metadata: {
        signalCount: this.receivedSignals.length,
        lastSignal,
      },
    };
  }

  updateSignals(signals: Record<string, unknown>): void {
    if (this.shouldThrowOnSignalUpdate) {
      throw new Error('Signal processing error');
    }
    this.receivedSignals.push(signals);
  }

  getConfig(): any {
    return this.config;
  }

  // Test helper methods
  getReceivedSignals(): Record<string, unknown>[] {
    return this.receivedSignals;
  }

  clearReceivedSignals(): void {
    this.receivedSignals = [];
  }

  setShouldThrowOnSignalUpdate(shouldThrow: boolean): void {
    this.shouldThrowOnSignalUpdate = shouldThrow;
  }
}

describe('Signal Routing - Integration', () => {
  let catalog: SignalCatalog;
  let orchestrator: StrategyOrchestrator;
  let testDbPath: string;

  const mockMarketContext: MarketContext = {
    marketId: 'signal-test-market',
    tokenId: 'test-token',
    bestBid: 0.48,
    bestAsk: 0.52,
    mid: 0.50,
    spread: 0.04,
    liquidity: {
      bidSize: 100,
      askSize: 100,
    },
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    // Use a unique test database for each test
    testDbPath = path.join(process.cwd(), 'data', `signals-test-${Date.now()}.db`);
    catalog = new SignalCatalog({ path: testDbPath });
    
    orchestrator = new StrategyOrchestrator({
      maxStrategies: 5,
      enableConflictDetection: true,
      enableStateIsolation: true,
    });
  });

  afterEach(async () => {
    await orchestrator.cleanup();
    catalog.close();
    
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  });

  describe('End-to-End Signal Flow', () => {
    it('should route signals from catalog to strategy and influence decisions', async () => {
      // 1. Register signal in catalog
      const signalDef: Omit<SignalDefinition, 'createdAt' | 'updatedAt'> = {
        signalName: 'momentum_score',
        version: '1.0.0',
        description: 'Momentum indicator',
        featureGroup: 'strategy',
        inputFields: ['price', 'volume'],
        outputType: 'number',
        owner: 'test',
      };
      
      catalog.registerSignal(signalDef);

      // 2. Create signal-aware strategy
      const strategy = new SignalAwareStrategy('signal-test-1');
      await strategy.initialize({
        strategyId: 'signal-test-1',
        type: 'test',
        params: {},
        enabled: true,
      });
      
      // 3. Add strategy to orchestrator
      await orchestrator.addStrategy(strategy);

      // 4. Fetch signal from catalog
      const signal = catalog.getSignal('momentum_score', '1.0.0');
      expect(signal).toBeDefined();
      expect(signal?.signalName).toBe('momentum_score');

      // 5. Route signal to strategy
      const signalData = {
        signalName: 'momentum_score',
        version: '1.0.0',
        value: 0.75,
        timestamp: new Date().toISOString(),
      };
      // SignalAwareStrategy is guaranteed to have updateSignals
      if (strategy.updateSignals) {
        strategy.updateSignals(signalData);
      } else {
        throw new Error('Test strategy missing updateSignals hook');
      }

      // 6. Evaluate strategy - should use signals
      const results = await orchestrator.evaluateAll(mockMarketContext);
      
      expect(results).toHaveLength(1);
      expect(results[0].decision.confidence).toBeGreaterThan(0.5);
      expect(results[0].decision.rationale).toContain('Using 1 signals');
      expect(results[0].decision.metadata?.signalCount).toBe(1);
      expect(results[0].decision.metadata?.lastSignal).toEqual(signalData);
    });

    it('should handle multiple signals routed to same strategy', async () => {
      // Register multiple signals
      const signals: Array<Omit<SignalDefinition, 'createdAt' | 'updatedAt'>> = [
        {
          signalName: 'momentum',
          version: '1.0.0',
          description: 'Momentum signal',
          featureGroup: 'strategy',
          inputFields: ['price'],
          outputType: 'number',
          owner: 'test',
        },
        {
          signalName: 'volatility',
          version: '1.0.0',
          description: 'Volatility signal',
          featureGroup: 'risk',
          inputFields: ['returns'],
          outputType: 'number',
          owner: 'test',
        },
      ];

      signals.forEach(sig => catalog.registerSignal(sig));

      // Create strategy
      const strategy = new SignalAwareStrategy('multi-signal-test');
      await strategy.initialize({
        strategyId: 'multi-signal-test',
        type: 'test',
        params: {},
        enabled: true,
      });

      await orchestrator.addStrategy(strategy);

      // Route multiple signals
      updateStrategySignals(strategy, { signalName: 'momentum', value: 0.8 });
      updateStrategySignals(strategy, { signalName: 'volatility', value: 0.3 });

      // Evaluate
      const results = await orchestrator.evaluateAll(mockMarketContext);
      
      expect(results[0].decision.metadata?.signalCount).toBe(2);
      expect(strategy.getReceivedSignals()).toHaveLength(2);
    });

    it('should support signal versioning in routing', async () => {
      // Register two versions of same signal
      catalog.registerSignal({
        signalName: 'alpha_score',
        version: '1.0.0',
        description: 'Alpha v1',
        featureGroup: 'strategy',
        inputFields: ['price'],
        outputType: 'number',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'alpha_score',
        version: '2.0.0',
        description: 'Alpha v2 with improvements',
        featureGroup: 'strategy',
        inputFields: ['price', 'volume'],
        outputType: 'number',
        owner: 'test',
      });

      // Verify both versions exist
      const v1 = catalog.getSignal('alpha_score', '1.0.0');
      const v2 = catalog.getSignal('alpha_score', '2.0.0');
      const latest = catalog.getLatestSignal('alpha_score');

      expect(v1?.version).toBe('1.0.0');
      expect(v2?.version).toBe('2.0.0');
      expect(latest?.version).toBe('2.0.0');

      // Strategy can choose which version to use
      const strategy = new SignalAwareStrategy('version-test');
      await strategy.initialize({
        strategyId: 'version-test',
        type: 'test',
        params: {},
        enabled: true,
      });

      // Route specific version
      updateStrategySignals(strategy, {
        signalName: 'alpha_score',
        version: '1.0.0',
        value: 0.6,
      });

      expect(strategy.getReceivedSignals()[0]).toMatchObject({
        signalName: 'alpha_score',
        version: '1.0.0',
        value: 0.6,
      });
    });
  });

  describe('Error Handling - Signal Catalog Failures', () => {
    it('should handle missing signal gracefully', () => {
      // Try to get non-existent signal
      const signal = catalog.getSignal('nonexistent', '1.0.0');
      expect(signal).toBeNull();

      // Should not throw
      expect(() => catalog.getLatestSignal('nonexistent')).not.toThrow();
      const latest = catalog.getLatestSignal('nonexistent');
      expect(latest).toBeNull();
    });

    it('should handle version mismatch', () => {
      catalog.registerSignal({
        signalName: 'test_signal',
        version: '1.0.0',
        description: 'Test',
        featureGroup: 'market',
        inputFields: ['price'],
        outputType: 'number',
        owner: 'test',
      });

      // Request wrong version
      const wrongVersion = catalog.getSignal('test_signal', '2.0.0');
      expect(wrongVersion).toBeNull();

      // Correct version works
      const correctVersion = catalog.getSignal('test_signal', '1.0.0');
      expect(correctVersion).not.toBeNull();
    });

    it('should reject duplicate signal registration', () => {
      const signalDef = {
        signalName: 'duplicate_test',
        version: '1.0.0',
        description: 'Test',
        featureGroup: 'market' as const,
        inputFields: ['price'],
        outputType: 'number' as const,
        owner: 'test',
      };

      // First registration succeeds
      expect(() => catalog.registerSignal(signalDef)).not.toThrow();

      // Second registration should throw
      expect(() => catalog.registerSignal(signalDef)).toThrow(
        /Signal duplicate_test version 1.0.0 already exists/
      );
    });

    it('should handle catalog unavailable scenario', () => {
      // Close catalog to simulate unavailability
      catalog.close();

      // Operations should throw after closing
      expect(() => {
        catalog.registerSignal({
          signalName: 'after_close',
          version: '1.0.0',
          description: 'Test',
          featureGroup: 'market',
          inputFields: ['price'],
          outputType: 'number',
          owner: 'test',
        });
      }).toThrow();
    });
  });

  describe('Error Handling - Signal Processing Errors', () => {
    it('should handle strategy signal processing errors gracefully', async () => {
      const strategy = new SignalAwareStrategy('error-test');
      await strategy.initialize({
        strategyId: 'error-test',
        type: 'test',
        params: {},
        enabled: true,
      });

      await orchestrator.addStrategy(strategy);

      // Configure strategy to throw on signal update
      strategy.setShouldThrowOnSignalUpdate(true);

      // Attempting to update signals should throw
      expect(() => {
        updateStrategySignals(strategy, { test: 'data' });
      }).toThrow('Signal processing error');

      // But orchestrator should still be able to evaluate (strategy falls back)
      const results = await orchestrator.evaluateAll(mockMarketContext);
      expect(results).toHaveLength(1);
      expect(results[0].decision.action).toBe('hold');
    });

    it('should handle malformed signal data', async () => {
      const strategy = new SignalAwareStrategy('malformed-test');
      await strategy.initialize({
        strategyId: 'malformed-test',
        type: 'test',
        params: {},
        enabled: true,
      });

      // Test with various malformed data
      const malformedInputs = [
        null,
        undefined,
        '',
        123,
        [],
        { nested: { deep: { data: 'value' } } },
      ];

      for (const input of malformedInputs) {
        // Should not throw - strategy implementation decides how to handle
        expect(() => {
          updateStrategySignals(strategy, input as any);
        }).not.toThrow();
      }

      // All malformed inputs should be recorded
      expect(strategy.getReceivedSignals()).toHaveLength(malformedInputs.length);
    });

    it('should handle strategy without updateSignals hook', async () => {
      // Register built-in strategies
      registerStrategies();

      // Create strategy without updateSignals (random strategy)
      const strategy = await StrategyFactory.create({
        strategyId: 'no-signals-test',
        type: 'random',
        params: {
          buyProbability: 0.3,
          sellProbability: 0.3,
          seed: 42,
        },
        enabled: true,
      });

      await orchestrator.addStrategy(strategy);

      // Strategy should evaluate fine without signals
      const results = await orchestrator.evaluateAll(mockMarketContext);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeUndefined();
      
      // updateSignals should be undefined or not cause issues if it exists
      if (strategy.updateSignals) {
        expect(() => updateStrategySignals(strategy, {})).not.toThrow();
      }

      StrategyFactory.clear();
    });
  });

  describe('Cascading Failures', () => {
    it('should handle signal catalog failure during active trading', async () => {
      // Setup with signals
      catalog.registerSignal({
        signalName: 'cascade_test',
        version: '1.0.0',
        description: 'Test',
        featureGroup: 'market',
        inputFields: ['price'],
        outputType: 'number',
        owner: 'test',
      });

      const strategy = new SignalAwareStrategy('cascade-test');
      await strategy.initialize({
        strategyId: 'cascade-test',
        type: 'test',
        params: {},
        enabled: true,
      });

      await orchestrator.addStrategy(strategy);

      // Initial signal routing works
      const signal = catalog.getSignal('cascade_test', '1.0.0');
      expect(signal).not.toBeNull();
      updateStrategySignals(strategy, { value: 0.5 });

      // Evaluate successfully
      let results = await orchestrator.evaluateAll(mockMarketContext);
      expect(results[0].error).toBeUndefined();

      // Simulate catalog failure (close it)
      catalog.close();

      // Strategy should still be able to evaluate (fallback to last known state)
      results = await orchestrator.evaluateAll(mockMarketContext);
      expect(results[0].error).toBeUndefined();
      expect(results[0].decision.action).toBe('hold');
      
      // Strategy should still have previous signals
      expect(strategy.getReceivedSignals()).toHaveLength(1);
    });

    it('should handle partial signal routing failure with multiple strategies', async () => {
      const strategy1 = new SignalAwareStrategy('strategy-1');
      const strategy2 = new SignalAwareStrategy('strategy-2');

      await strategy1.initialize({
        strategyId: 'strategy-1',
        type: 'test',
        params: {},
        enabled: true,
      });

      await strategy2.initialize({
        strategyId: 'strategy-2',
        type: 'test',
        params: {},
        enabled: true,
      });

      await orchestrator.addStrategy(strategy1);
      await orchestrator.addStrategy(strategy2);

      // Configure strategy-2 to throw on signal update
      strategy2.setShouldThrowOnSignalUpdate(true);

      // Route signals - strategy-1 succeeds, strategy-2 fails
      updateStrategySignals(strategy1, { value: 0.6 });
      expect(() => updateStrategySignals(strategy2, { value: 0.7 })).toThrow();

      // Both strategies should still evaluate
      const results = await orchestrator.evaluateAll(mockMarketContext);
      expect(results).toHaveLength(2);
      
      // Strategy-1 has signals
      const result1 = results.find(r => r.strategyId === 'strategy-1');
      expect(result1?.decision.metadata?.signalCount).toBe(1);
      
      // Strategy-2 has no signals but still evaluates
      const result2 = results.find(r => r.strategyId === 'strategy-2');
      expect(result2?.decision.metadata?.signalCount).toBe(0);
    });
  });

  describe('Signal Query and Metadata', () => {
    it('should query signals by feature group', () => {
      // Register signals in different groups
      const signalDefs = [
        {
          signalName: 'market_signal_1',
          version: '1.0.0',
          description: 'Market signal',
          featureGroup: 'market' as const,
          inputFields: ['price'],
          outputType: 'number' as const,
          owner: 'test',
        },
        {
          signalName: 'risk_signal_1',
          version: '1.0.0',
          description: 'Risk signal',
          featureGroup: 'risk' as const,
          inputFields: ['volatility'],
          outputType: 'number' as const,
          owner: 'test',
        },
        {
          signalName: 'market_signal_2',
          version: '1.0.0',
          description: 'Another market signal',
          featureGroup: 'market' as const,
          inputFields: ['volume'],
          outputType: 'number' as const,
          owner: 'test',
        },
      ];

      signalDefs.forEach(sig => catalog.registerSignal(sig));

      // Query by feature group
      const marketSignals = catalog.querySignals({ featureGroup: 'market' });
      const riskSignals = catalog.querySignals({ featureGroup: 'risk' });

      expect(marketSignals).toHaveLength(2);
      expect(riskSignals).toHaveLength(1);
      expect(marketSignals.every(s => s.featureGroup === 'market')).toBe(true);
      expect(riskSignals[0].featureGroup).toBe('risk');
    });

    it('should provide catalog statistics', () => {
      // Register signals
      catalog.registerSignal({
        signalName: 'sig1',
        version: '1.0.0',
        description: 'Test',
        featureGroup: 'market',
        inputFields: ['price'],
        outputType: 'number',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'sig1',
        version: '2.0.0',
        description: 'Test v2',
        featureGroup: 'market',
        inputFields: ['price'],
        outputType: 'number',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'sig2',
        version: '1.0.0',
        description: 'Test',
        featureGroup: 'risk',
        inputFields: ['price'],
        outputType: 'number',
        owner: 'test',
      });

      const stats = catalog.getStats();
      
      expect(stats.totalSignals).toBe(2); // sig1 and sig2
      expect(stats.totalVersions).toBe(3); // 2 versions of sig1 + 1 of sig2
      expect(stats.signalsByGroup.market).toBe(1);
      expect(stats.signalsByGroup.risk).toBe(1);
    });
  });
});
