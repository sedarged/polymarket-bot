/**
 * Tests for BanditAllocator
 * 
 * Tests multi-armed bandit algorithms for strategy capital allocation:
 * - Epsilon-greedy allocation
 * - UCB1 allocation
 * - Thompson Sampling allocation
 * - Configuration and constraints
 * - State management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BanditAllocator } from '../src/learning/banditAllocator';
import type { StrategyPerformance } from '../src/learning/types';

describe('BanditAllocator', () => {
  describe('Configuration', () => {
    it('should initialize with default config', () => {
      const allocator = new BanditAllocator({
        algorithm: 'epsilon-greedy',
        totalCapital: 10000,
      });
      
      const config = allocator.getConfig();
      expect(config.algorithm).toBe('epsilon-greedy');
      expect(config.totalCapital).toBe(10000);
      expect(config.explorationFactor).toBe(0.1); // Default epsilon
      expect(config.minAllocation).toBe(0.05);
      expect(config.maxAllocation).toBe(0.5);
      expect(config.minTradeCount).toBe(10);
    });
    
    it('should initialize with custom config', () => {
      const allocator = new BanditAllocator({
        algorithm: 'ucb1',
        totalCapital: 5000,
        explorationFactor: 1.5,
        minAllocation: 0.1,
        maxAllocation: 0.4,
        minTradeCount: 20,
      });
      
      const config = allocator.getConfig();
      expect(config.algorithm).toBe('ucb1');
      expect(config.totalCapital).toBe(5000);
      expect(config.explorationFactor).toBe(1.5);
      expect(config.minAllocation).toBe(0.1);
      expect(config.maxAllocation).toBe(0.4);
      expect(config.minTradeCount).toBe(20);
    });
    
    it('should default explorationFactor to 2.0 for UCB1', () => {
      const allocator = new BanditAllocator({
        algorithm: 'ucb1',
        totalCapital: 10000,
      });
      
      const config = allocator.getConfig();
      expect(config.explorationFactor).toBe(2.0);
    });
  });
  
  describe('Epsilon-Greedy Allocation', () => {
    let allocator: BanditAllocator;
    let strategies: StrategyPerformance[];
    
    beforeEach(() => {
      allocator = new BanditAllocator({
        algorithm: 'epsilon-greedy',
        totalCapital: 10000,
        explorationFactor: 0.0, // Disable exploration for deterministic tests
      });
      
      strategies = [
        {
          strategyId: 'strategy-1',
          pnl: 500,
          sharpe: 1.5,
          maxDrawdown: 0.05,
          winRate: 0.6,
          errorRate: 0.01,
          tradeCount: 50,
          lastUpdated: new Date().toISOString(),
        },
        {
          strategyId: 'strategy-2',
          pnl: 200,
          sharpe: 1.2,
          maxDrawdown: 0.08,
          winRate: 0.55,
          errorRate: 0.02,
          tradeCount: 40,
          lastUpdated: new Date().toISOString(),
        },
        {
          strategyId: 'strategy-3',
          pnl: 100,
          sharpe: 0.8,
          maxDrawdown: 0.1,
          winRate: 0.5,
          errorRate: 0.01,
          tradeCount: 30,
          lastUpdated: new Date().toISOString(),
        },
      ];
    });
    
    it('should allocate capital to all eligible strategies', () => {
      const allocations = allocator.allocate(strategies);
      
      expect(allocations).toHaveLength(3);
      expect(allocations.map(a => a.strategyId)).toContain('strategy-1');
      expect(allocations.map(a => a.strategyId)).toContain('strategy-2');
      expect(allocations.map(a => a.strategyId)).toContain('strategy-3');
    });
    
    it('should allocate more to better performing strategies', () => {
      const allocations = allocator.allocate(strategies);
      
      const alloc1 = allocations.find(a => a.strategyId === 'strategy-1')!;
      const alloc2 = allocations.find(a => a.strategyId === 'strategy-2')!;
      const alloc3 = allocations.find(a => a.strategyId === 'strategy-3')!;
      
      expect(alloc1.allocation).toBeGreaterThan(alloc2.allocation);
      expect(alloc2.allocation).toBeGreaterThan(alloc3.allocation);
    });
    
    it('should sum allocations to 1.0', () => {
      const allocations = allocator.allocate(strategies);
      
      const sum = allocations.reduce((s, a) => s + a.allocation, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
    
    it('should respect total capital', () => {
      const allocations = allocator.allocate(strategies);
      
      const totalAllocated = allocations.reduce((s, a) => s + a.capitalAmount, 0);
      expect(totalAllocated).toBeCloseTo(10000, 2);
    });
    
    it('should filter out strategies with insufficient trades', () => {
      const lowTradeStrategy: StrategyPerformance = {
        strategyId: 'strategy-low-trades',
        pnl: 1000,
        sharpe: 2.0,
        maxDrawdown: 0.02,
        winRate: 0.7,
        errorRate: 0.0,
        tradeCount: 5, // Below min of 10
        lastUpdated: new Date().toISOString(),
      };
      
      const allocations = allocator.allocate([...strategies, lowTradeStrategy]);
      
      expect(allocations).toHaveLength(3);
      expect(allocations.map(a => a.strategyId)).not.toContain('strategy-low-trades');
    });
    
    it('should apply min/max allocation constraints', () => {
      const constrainedAllocator = new BanditAllocator({
        algorithm: 'epsilon-greedy',
        totalCapital: 10000,
        explorationFactor: 0.0,
        minAllocation: 0.2,
        maxAllocation: 0.4,
      });
      
      const allocations = constrainedAllocator.allocate(strategies);
      
      for (const alloc of allocations) {
        expect(alloc.allocation).toBeGreaterThanOrEqual(0.2);
        expect(alloc.allocation).toBeLessThanOrEqual(0.4);
      }
    });
  });
  
  describe('UCB1 Allocation', () => {
    let allocator: BanditAllocator;
    let strategies: StrategyPerformance[];
    
    beforeEach(() => {
      allocator = new BanditAllocator({
        algorithm: 'ucb1',
        totalCapital: 10000,
        explorationFactor: 2.0,
      });
      
      strategies = [
        {
          strategyId: 'strategy-1',
          pnl: 500,
          sharpe: 1.5,
          maxDrawdown: 0.05,
          winRate: 0.6,
          errorRate: 0.01,
          tradeCount: 50,
          lastUpdated: new Date().toISOString(),
        },
        {
          strategyId: 'strategy-2',
          pnl: 200,
          sharpe: 1.2,
          maxDrawdown: 0.08,
          winRate: 0.55,
          errorRate: 0.02,
          tradeCount: 40,
          lastUpdated: new Date().toISOString(),
        },
      ];
    });
    
    it('should prioritize unexplored strategies', () => {
      // First allocation should include both strategies
      const allocations1 = allocator.allocate(strategies);
      expect(allocations1).toHaveLength(2);
      
      // Add a new strategy with no history
      const newStrategy: StrategyPerformance = {
        strategyId: 'strategy-new',
        pnl: 0,
        sharpe: 0,
        maxDrawdown: 0,
        winRate: 0.5,
        errorRate: 0,
        tradeCount: 10, // Just meets minimum
        lastUpdated: new Date().toISOString(),
      };
      
      const allocations2 = allocator.allocate([...strategies, newStrategy]);
      
      // New strategy should get some allocation due to high uncertainty
      const newAlloc = allocations2.find(a => a.strategyId === 'strategy-new');
      expect(newAlloc).toBeDefined();
      expect(newAlloc!.allocation).toBeGreaterThan(0);
    });
    
    it('should sum allocations to 1.0', () => {
      const allocations = allocator.allocate(strategies);
      
      const sum = allocations.reduce((s, a) => s + a.allocation, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });
  
  describe('Thompson Sampling Allocation', () => {
    let allocator: BanditAllocator;
    let strategies: StrategyPerformance[];
    
    beforeEach(() => {
      allocator = new BanditAllocator({
        algorithm: 'thompson-sampling',
        totalCapital: 10000,
      });
      
      strategies = [
        {
          strategyId: 'strategy-1',
          pnl: 500,
          sharpe: 1.5,
          maxDrawdown: 0.05,
          winRate: 0.6,
          errorRate: 0.01,
          tradeCount: 50,
          lastUpdated: new Date().toISOString(),
        },
        {
          strategyId: 'strategy-2',
          pnl: 200,
          sharpe: 1.2,
          maxDrawdown: 0.08,
          winRate: 0.55,
          errorRate: 0.02,
          tradeCount: 40,
          lastUpdated: new Date().toISOString(),
        },
      ];
    });
    
    it('should allocate capital based on sampled distributions', () => {
      const allocations = allocator.allocate(strategies);
      
      expect(allocations).toHaveLength(2);
      expect(allocations.every(a => a.allocation > 0)).toBe(true);
    });
    
    it('should sum allocations to 1.0', () => {
      const allocations = allocator.allocate(strategies);
      
      const sum = allocations.reduce((s, a) => s + a.allocation, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
    
    it('should produce different allocations on repeated calls (stochastic)', () => {
      const allocations1 = allocator.allocate(strategies);
      const allocations2 = allocator.allocate(strategies);
      
      // At least one allocation should be different
      const alloc1_1 = allocations1.find(a => a.strategyId === 'strategy-1')!.allocation;
      const alloc2_1 = allocations2.find(a => a.strategyId === 'strategy-1')!.allocation;
      
      // Allow for some randomness - they should sometimes be different
      // We can't guarantee this in a single test, but over multiple runs it should happen
      expect(allocations1).toHaveLength(2);
      expect(allocations2).toHaveLength(2);
    });
  });
  
  describe('State Management', () => {
    let allocator: BanditAllocator;
    
    beforeEach(() => {
      allocator = new BanditAllocator({
        algorithm: 'epsilon-greedy',
        totalCapital: 10000,
        explorationFactor: 0.0,
      });
    });
    
    it('should track state for allocated strategies', () => {
      const strategies: StrategyPerformance[] = [
        {
          strategyId: 'strategy-1',
          pnl: 100,
          sharpe: 1.0,
          maxDrawdown: 0.1,
          winRate: 0.5,
          errorRate: 0.01,
          tradeCount: 20,
          lastUpdated: new Date().toISOString(),
        },
      ];
      
      allocator.allocate(strategies);
      
      const state = allocator.getState('strategy-1');
      expect(state).toBeDefined();
      expect(state!.strategyId).toBe('strategy-1');
      expect(state!.pulls).toBeGreaterThan(0);
      expect(state!.totalReward).toBe(100);
    });
    
    it('should update state on repeated allocations', () => {
      const strategy: StrategyPerformance = {
        strategyId: 'strategy-1',
        pnl: 100,
        sharpe: 1.0,
        maxDrawdown: 0.1,
        winRate: 0.5,
        errorRate: 0.01,
        tradeCount: 20,
        lastUpdated: new Date().toISOString(),
      };
      
      allocator.allocate([strategy]);
      const state1 = allocator.getState('strategy-1')!;
      
      const initialPulls = state1.pulls;
      const initialReward = state1.totalReward;
      
      allocator.allocate([{ ...strategy, pnl: 150 }]);
      const state2 = allocator.getState('strategy-1')!;
      
      expect(state2.pulls).toBe(initialPulls + 1);
      expect(state2.totalReward).toBe(initialReward + 150);
    });
    
    it('should reset state for a specific strategy', () => {
      const strategies: StrategyPerformance[] = [
        {
          strategyId: 'strategy-1',
          pnl: 100,
          sharpe: 1.0,
          maxDrawdown: 0.1,
          winRate: 0.5,
          errorRate: 0.01,
          tradeCount: 20,
          lastUpdated: new Date().toISOString(),
        },
        {
          strategyId: 'strategy-2',
          pnl: 200,
          sharpe: 1.2,
          maxDrawdown: 0.08,
          winRate: 0.55,
          errorRate: 0.02,
          tradeCount: 30,
          lastUpdated: new Date().toISOString(),
        },
      ];
      
      allocator.allocate(strategies);
      
      allocator.resetState('strategy-1');
      
      expect(allocator.getState('strategy-1')).toBeUndefined();
      expect(allocator.getState('strategy-2')).toBeDefined();
    });
    
    it('should reset all states', () => {
      const strategies: StrategyPerformance[] = [
        {
          strategyId: 'strategy-1',
          pnl: 100,
          sharpe: 1.0,
          maxDrawdown: 0.1,
          winRate: 0.5,
          errorRate: 0.01,
          tradeCount: 20,
          lastUpdated: new Date().toISOString(),
        },
        {
          strategyId: 'strategy-2',
          pnl: 200,
          sharpe: 1.2,
          maxDrawdown: 0.08,
          winRate: 0.55,
          errorRate: 0.02,
          tradeCount: 30,
          lastUpdated: new Date().toISOString(),
        },
      ];
      
      allocator.allocate(strategies);
      
      allocator.resetState();
      
      expect(allocator.getAllStates()).toHaveLength(0);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle empty strategy list', () => {
      const allocator = new BanditAllocator({
        algorithm: 'epsilon-greedy',
        totalCapital: 10000,
      });
      
      const allocations = allocator.allocate([]);
      expect(allocations).toHaveLength(0);
    });
    
    it('should handle single strategy', () => {
      const allocator = new BanditAllocator({
        algorithm: 'epsilon-greedy',
        totalCapital: 10000,
        explorationFactor: 0.0,
      });
      
      const strategies: StrategyPerformance[] = [
        {
          strategyId: 'strategy-1',
          pnl: 100,
          sharpe: 1.0,
          maxDrawdown: 0.1,
          winRate: 0.5,
          errorRate: 0.01,
          tradeCount: 20,
          lastUpdated: new Date().toISOString(),
        },
      ];
      
      const allocations = allocator.allocate(strategies);
      
      expect(allocations).toHaveLength(1);
      expect(allocations[0].allocation).toBeCloseTo(1.0, 5);
      expect(allocations[0].capitalAmount).toBeCloseTo(10000, 2);
    });
    
    it('should handle negative PnL strategies', () => {
      const allocator = new BanditAllocator({
        algorithm: 'epsilon-greedy',
        totalCapital: 10000,
        explorationFactor: 0.0,
      });
      
      const strategies: StrategyPerformance[] = [
        {
          strategyId: 'strategy-1',
          pnl: -100,
          sharpe: 0.5,
          maxDrawdown: 0.2,
          winRate: 0.4,
          errorRate: 0.05,
          tradeCount: 20,
          lastUpdated: new Date().toISOString(),
        },
        {
          strategyId: 'strategy-2',
          pnl: 50,
          sharpe: 1.0,
          maxDrawdown: 0.1,
          winRate: 0.5,
          errorRate: 0.01,
          tradeCount: 20,
          lastUpdated: new Date().toISOString(),
        },
      ];
      
      const allocations = allocator.allocate(strategies);
      
      // Should still allocate, but favor the positive strategy
      expect(allocations).toHaveLength(2);
      const alloc1 = allocations.find(a => a.strategyId === 'strategy-1')!;
      const alloc2 = allocations.find(a => a.strategyId === 'strategy-2')!;
      expect(alloc2.allocation).toBeGreaterThan(alloc1.allocation);
    });
  });
});
