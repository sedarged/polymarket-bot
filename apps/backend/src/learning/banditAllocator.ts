/**
 * Bandit Allocator - Multi-Armed Bandit algorithms for strategy capital allocation
 * 
 * Implements three allocation algorithms:
 * 1. Epsilon-Greedy: Balance exploration and exploitation with probability epsilon
 * 2. UCB1 (Upper Confidence Bound): Optimistic exploration based on uncertainty
 * 3. Thompson Sampling: Bayesian approach with beta distributions
 * 
 * Paper trading only - allocates simulated capital across strategies.
 * Design follows REPORTS/LEARNING_SYSTEM.md specification (Section 6).
 */

import { logger } from '../utils/logger';
import type {
  BanditAlgorithm,
  StrategyPerformance,
  AllocationResult,
  BanditState,
} from './types';

export interface BanditAllocatorConfig {
  algorithm: BanditAlgorithm;
  totalCapital: number;
  explorationFactor?: number; // epsilon for epsilon-greedy (default: 0.1), c for UCB1 (default: 2.0)
  minAllocation?: number; // Minimum allocation per strategy (default: 0.05 = 5%)
  maxAllocation?: number; // Maximum allocation per strategy (default: 0.5 = 50%)
  minTradeCount?: number; // Minimum trades before considering allocation (default: 10)
}

export class BanditAllocator {
  private config: Required<BanditAllocatorConfig>;
  private state: Map<string, BanditState>; // Strategy ID -> bandit state
  
  constructor(config: BanditAllocatorConfig) {
    const minAllocation = config.minAllocation ?? 0.05;
    const maxAllocation = config.maxAllocation ?? 0.5;
    const explorationFactor = config.explorationFactor ?? (config.algorithm === 'ucb1' ? 2.0 : 0.1);
    const minTradeCount = config.minTradeCount ?? 10;

    // Validate configuration
    if (!config.algorithm || !['epsilon-greedy', 'ucb1', 'thompson-sampling'].includes(config.algorithm)) {
      throw new Error(`BanditAllocator: invalid algorithm "${config.algorithm}"`);
    }
    if (!Number.isFinite(config.totalCapital) || config.totalCapital <= 0) {
      throw new Error(`BanditAllocator: totalCapital must be a positive number, got ${config.totalCapital}`);
    }
    if (!Number.isFinite(explorationFactor) || explorationFactor < 0) {
      throw new Error(`BanditAllocator: explorationFactor must be a non-negative number, got ${explorationFactor}`);
    }
    if (minAllocation < 0 || minAllocation > 1) {
      throw new Error(`BanditAllocator: minAllocation must be between 0 and 1, got ${minAllocation}`);
    }
    if (maxAllocation < 0 || maxAllocation > 1) {
      throw new Error(`BanditAllocator: maxAllocation must be between 0 and 1, got ${maxAllocation}`);
    }
    if (minAllocation > maxAllocation) {
      throw new Error(`BanditAllocator: minAllocation (${minAllocation}) must not exceed maxAllocation (${maxAllocation})`);
    }
    if (!Number.isInteger(minTradeCount) || minTradeCount < 0) {
      throw new Error(`BanditAllocator: minTradeCount must be a non-negative integer, got ${minTradeCount}`);
    }

    this.config = {
      algorithm: config.algorithm,
      totalCapital: config.totalCapital,
      explorationFactor,
      minAllocation,
      maxAllocation,
      minTradeCount,
    };
    
    this.state = new Map();
    
    logger.info('BanditAllocator initialized', {
      algorithm: this.config.algorithm,
      totalCapital: this.config.totalCapital,
      explorationFactor: this.config.explorationFactor,
    });
  }
  
  /**
   * Allocate capital across strategies based on performance
   */
  allocate(performances: StrategyPerformance[]): AllocationResult[] {
    // Filter strategies with sufficient data
    const eligible = performances.filter(p => p.tradeCount >= this.config.minTradeCount);
    
    if (eligible.length === 0) {
      logger.warn('No eligible strategies for allocation', {
        total: performances.length,
        minTradeCount: this.config.minTradeCount,
      });
      return [];
    }
    
    // Update bandit state for all strategies
    for (const perf of eligible) {
      this.updateState(perf);
    }
    
    // Allocate based on algorithm
    let allocations: AllocationResult[];
    
    switch (this.config.algorithm) {
      case 'epsilon-greedy':
        allocations = this.epsilonGreedy(eligible);
        break;
      case 'ucb1':
        allocations = this.ucb1(eligible);
        break;
      case 'thompson-sampling':
        allocations = this.thompsonSampling(eligible);
        break;
      default:
        throw new Error(`Unknown bandit algorithm: ${this.config.algorithm}`);
    }
    
    // Normalize allocations to sum to 1.0 and apply constraints
    allocations = this.normalizeAndConstrain(allocations);
    
    // Calculate capital amounts
    allocations = allocations.map(a => ({
      ...a,
      capitalAmount: a.allocation * this.config.totalCapital,
    }));
    
    logger.info('Capital allocated', {
      algorithm: this.config.algorithm,
      strategies: allocations.length,
      totalAllocated: allocations.reduce((sum, a) => sum + a.capitalAmount, 0),
    });
    
    return allocations;
  }
  
  /**
   * Epsilon-Greedy: Explore with probability epsilon, exploit otherwise
   */
  private epsilonGreedy(performances: StrategyPerformance[]): AllocationResult[] {
    const epsilon = this.config.explorationFactor;
    const timestamp = new Date().toISOString();
    
    // Explore: allocate uniformly
    if (Math.random() < epsilon) {
      const uniformAllocation = 1.0 / performances.length;
      return performances.map(p => ({
        strategyId: p.strategyId,
        allocation: uniformAllocation,
        capitalAmount: 0, // Will be calculated later
        score: uniformAllocation,
        reason: `Exploration (epsilon=${epsilon})`,
        timestamp,
      }));
    }
    
    // Exploit: allocate to best performers
    // Use a softmax-like distribution based on Sharpe ratio
    const scores = performances.map(p => this.calculateScore(p));
    const maxScore = Math.max(...scores);
    
    // Softmax with temperature = 1
    const expScores = scores.map(s => Math.exp(s - maxScore)); // Subtract max for numerical stability
    const sumExpScores = expScores.reduce((sum, exp) => sum + exp, 0);
    
    return performances.map((p, i) => ({
      strategyId: p.strategyId,
      allocation: expScores[i] / sumExpScores,
      capitalAmount: 0, // Will be calculated later
      score: scores[i],
      reason: `Exploitation (score=${scores[i].toFixed(3)})`,
      timestamp,
    }));
  }
  
  /**
   * UCB1: Upper Confidence Bound with exploration bonus
   */
  private ucb1(performances: StrategyPerformance[]): AllocationResult[] {
    const c = this.config.explorationFactor; // Exploration constant
    const timestamp = new Date().toISOString();
    const totalPulls = Array.from(this.state.values()).reduce((sum, s) => sum + s.pulls, 0);
    
    const ucbScores = performances.map(p => {
      const state = this.state.get(p.strategyId);
      if (!state || state.pulls === 0) {
        // If never pulled, give high priority
        return Number.POSITIVE_INFINITY;
      }
      
      // UCB1 formula: mean + c * sqrt(ln(totalPulls) / pulls)
      const exploitValue = state.meanReward;
      const exploreBonus = c * Math.sqrt(Math.log(totalPulls) / state.pulls);
      return exploitValue + exploreBonus;
    });
    
    // Allocate proportionally to UCB scores (using softmax for smooth distribution)
    const maxScore = Math.max(...ucbScores.filter(s => isFinite(s)));
    const expScores = ucbScores.map(s => isFinite(s) ? Math.exp(s - maxScore) : Math.exp(10)); // High value for infinity
    const sumExpScores = expScores.reduce((sum, exp) => sum + exp, 0);
    
    return performances.map((p, i) => ({
      strategyId: p.strategyId,
      allocation: expScores[i] / sumExpScores,
      capitalAmount: 0, // Will be calculated later
      score: ucbScores[i],
      reason: `UCB1 (score=${isFinite(ucbScores[i]) ? ucbScores[i].toFixed(3) : 'INF'}, c=${c})`,
      timestamp,
    }));
  }
  
  /**
   * Thompson Sampling: Bayesian approach with Gaussian (normal) approximation
   * 
   * For continuous rewards (PnL), we approximate the posterior over the mean reward
   * with a Gaussian distribution:
   * - Mean reward as the mean of the Gaussian
   * - Variance derived from the sample variance and number of pulls
   */
  private thompsonSampling(performances: StrategyPerformance[]): AllocationResult[] {
    const timestamp = new Date().toISOString();
    
    // Sample from each strategy's reward distribution
    const samples = performances.map(p => {
      const state = this.state.get(p.strategyId);
      if (!state || state.pulls === 0) {
        // If never pulled, sample from a prior (neutral distribution)
        return this.sampleGaussian(0, 1);
      }
      
      // Sample from Gaussian(mean, variance/pulls)
      const stdDev = Math.sqrt(Math.max(state.variance, 0.01) / state.pulls);
      return this.sampleGaussian(state.meanReward, stdDev);
    });
    
    // Allocate proportionally to sampled values (using softmax)
    const maxSample = Math.max(...samples);
    const expSamples = samples.map(s => Math.exp(s - maxSample));
    const sumExpSamples = expSamples.reduce((sum, exp) => sum + exp, 0);
    
    return performances.map((p, i) => ({
      strategyId: p.strategyId,
      allocation: expSamples[i] / sumExpSamples,
      capitalAmount: 0, // Will be calculated later
      score: samples[i],
      reason: `Thompson Sampling (sample=${samples[i].toFixed(3)})`,
      timestamp,
    }));
  }
  
  /**
   * Calculate performance score for a strategy
   * 
   * Follows REPORTS/LEARNING_SYSTEM.md specification:
   * score = (sharpe * 0.5) + (pnl_norm * 0.3) - (drawdown_norm * 0.2)
   * 
   * Where:
   * - sharpe: Raw Sharpe ratio
   * - pnl_norm: Normalized PnL (capped at 1000)
   * - drawdown_norm: Normalized drawdown (0 to 1 range)
   */
  private calculateScore(perf: StrategyPerformance): number {
    // Use raw Sharpe ratio
    const sharpe = Number.isFinite(perf.sharpe) ? perf.sharpe : 0;
    
    // Normalize PnL to 0-1 range, capped at 1000
    const pnlNorm = Math.max(0, Math.min(1, perf.pnl / 1000));
    
    // Normalize drawdown to 0-1 range (higher is worse)
    const drawdownNorm = Math.max(0, Math.min(1, perf.maxDrawdown));
    
    // Weighted combination (as per LEARNING_SYSTEM.md example)
    return (sharpe * 0.5) + (pnlNorm * 0.3) - (drawdownNorm * 0.2);
  }
  
  /**
   * Update bandit state for a strategy based on recent performance
   */
  private updateState(perf: StrategyPerformance): void {
    let state = this.state.get(perf.strategyId);
    
    if (!state) {
      // Initialize new strategy
      state = {
        strategyId: perf.strategyId,
        pulls: 1,
        totalReward: perf.pnl,
        meanReward: perf.pnl,
        variance: 0,
        lastPull: new Date().toISOString(),
      };
      this.state.set(perf.strategyId, state);
      return;
    }
    
    // Update with new performance data
    const newPulls = state.pulls + 1;
    const newTotalReward = state.totalReward + perf.pnl;
    const newMeanReward = newTotalReward / newPulls;
    
    // Update variance using Welford's online algorithm
    const delta = perf.pnl - state.meanReward;
    const delta2 = perf.pnl - newMeanReward;
    const newVariance = ((state.variance * state.pulls) + (delta * delta2)) / newPulls;
    
    state.pulls = newPulls;
    state.totalReward = newTotalReward;
    state.meanReward = newMeanReward;
    state.variance = newVariance;
    state.lastPull = new Date().toISOString();
  }
  
  /**
   * Normalize allocations to sum to 1.0 and apply min/max constraints.
   * 
   * Strategy:
   * 1. First clamp each allocation to [minAllocation, maxAllocation]
   * 2. Check if the configuration is feasible (can we have allocations that sum to 1.0?)
   * 3. If infeasible, fall back to equal allocation
   * 4. Otherwise, iteratively redistribute to meet both sum=1.0 and bound constraints
   */
  private normalizeAndConstrain(allocations: AllocationResult[]): AllocationResult[] {
    if (allocations.length === 0) return [];
    
    const n = allocations.length;
    const minAlloc = this.config.minAllocation;
    const maxAlloc = this.config.maxAllocation;
    
    // Check feasibility
    if (minAlloc * n > 1.0 || maxAlloc * n < 1.0) {
      logger.warn('Infeasible allocation constraints; using equal allocation', {
        minAllocation: minAlloc,
        maxAllocation: maxAlloc,
        strategies: n,
      });
      const equal = 1.0 / n;
      return allocations.map(a => ({ ...a, allocation: equal }));
    }
    
    // First normalize to sum to 1.0
    let sum = allocations.reduce((s, a) => s + a.allocation, 0);
    let constrained: AllocationResult[];
    
    if (sum === 0) {
      // All allocations are zero, use equal allocation
      constrained = allocations.map(a => ({ ...a, allocation: 1.0 / n }));
    } else {
      constrained = allocations.map(a => ({ ...a, allocation: a.allocation / sum }));
    }
    
    // Apply constraints with redistribution
    // This is a simplified approach: clamp to bounds, then redistribute excess/deficit
    const maxIterations = 10;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Clamp all allocations to bounds
      const clamped = constrained.map(a => ({
        ...a,
        allocation: Math.max(minAlloc, Math.min(maxAlloc, a.allocation)),
      }));
      
      // Calculate current sum
      sum = clamped.reduce((s, a) => s + a.allocation, 0);
      const diff = sum - 1.0;
      
      // If close enough, we're done
      if (Math.abs(diff) < 1e-9) {
        return clamped;
      }
      
      // Find indices that have room to adjust
      if (diff > 0) {
        // Need to decrease some allocations
        const adjustable = clamped
          .map((a, idx) => ({ idx, room: a.allocation - minAlloc }))
          .filter(x => x.room > 1e-9);
        
        if (adjustable.length === 0) {
          // Can't adjust further, return as is
          return clamped;
        }
        
        const totalRoom = adjustable.reduce((s, x) => s + x.room, 0);
        const scale = Math.min(1, diff / totalRoom);
        
        constrained = clamped.map((a, idx) => {
          const adj = adjustable.find(x => x.idx === idx);
          if (adj) {
            return { ...a, allocation: a.allocation - (adj.room * scale) };
          }
          return a;
        });
      } else {
        // Need to increase some allocations
        const adjustable = clamped
          .map((a, idx) => ({ idx, room: maxAlloc - a.allocation }))
          .filter(x => x.room > 1e-9);
        
        if (adjustable.length === 0) {
          // Can't adjust further, return as is
          return clamped;
        }
        
        const totalRoom = adjustable.reduce((s, x) => s + x.room, 0);
        const needed = -diff;
        const scale = Math.min(1, needed / totalRoom);
        
        constrained = clamped.map((a, idx) => {
          const adj = adjustable.find(x => x.idx === idx);
          if (adj) {
            return { ...a, allocation: a.allocation + (adj.room * scale) };
          }
          return a;
        });
      }
    }
    
    // Final normalization if still not exact
    sum = constrained.reduce((s, a) => s + a.allocation, 0);
    if (Math.abs(sum - 1.0) > 1e-9 && sum > 0) {
      constrained = constrained.map(a => ({ ...a, allocation: a.allocation / sum }));
      // Final clamp to ensure bounds are respected
      constrained = constrained.map(a => ({
        ...a,
        allocation: Math.max(minAlloc, Math.min(maxAlloc, a.allocation)),
      }));
    }
    
    return constrained;
  }
  
  /**
   * Sample from a Gaussian distribution using Box-Muller transform
   */
  private sampleGaussian(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
  
  /**
   * Get current state for a strategy
   */
  getState(strategyId: string): BanditState | undefined {
    return this.state.get(strategyId);
  }
  
  /**
   * Get all states
   */
  getAllStates(): BanditState[] {
    return Array.from(this.state.values());
  }
  
  /**
   * Reset state for a strategy (useful for testing)
   */
  resetState(strategyId?: string): void {
    if (strategyId) {
      this.state.delete(strategyId);
      logger.info('Reset bandit state for strategy', { strategyId });
    } else {
      this.state.clear();
      logger.info('Reset all bandit states');
    }
  }
  
  /**
   * Get configuration
   */
  getConfig(): Required<BanditAllocatorConfig> {
    return { ...this.config };
  }
}
