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
  AllocationConfig,
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
    this.config = {
      algorithm: config.algorithm,
      totalCapital: config.totalCapital,
      explorationFactor: config.explorationFactor ?? (config.algorithm === 'ucb1' ? 2.0 : 0.1),
      minAllocation: config.minAllocation ?? 0.05,
      maxAllocation: config.maxAllocation ?? 0.5,
      minTradeCount: config.minTradeCount ?? 10,
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
   * Thompson Sampling: Bayesian approach with beta distributions
   * 
   * For continuous rewards (PnL), we use a Gaussian approximation:
   * - Mean reward as the mean of the Gaussian
   * - Variance from sample variance
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
   * Combines Sharpe, PnL, and drawdown into a single score
   */
  private calculateScore(perf: StrategyPerformance): number {
    // Normalize metrics to 0-1 range
    const sharpeNorm = Math.max(0, Math.min(1, (perf.sharpe + 2) / 4)); // Sharpe -2 to 2 -> 0 to 1
    const pnlNorm = Math.max(0, Math.min(1, perf.pnl / 1000)); // Cap at 1000
    const drawdownPenalty = Math.max(0, perf.maxDrawdown); // Higher is worse
    
    // Weighted combination (as per LEARNING_SYSTEM.md example)
    return (sharpeNorm * 0.5) + (pnlNorm * 0.3) - (drawdownPenalty * 0.2);
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
   * Normalize allocations to sum to 1.0 and apply min/max constraints
   */
  private normalizeAndConstrain(allocations: AllocationResult[]): AllocationResult[] {
    if (allocations.length === 0) return [];
    
    // Apply min/max constraints
    let constrained = allocations.map(a => ({
      ...a,
      allocation: Math.max(this.config.minAllocation, Math.min(this.config.maxAllocation, a.allocation)),
    }));
    
    // Re-normalize to sum to 1.0
    const sum = constrained.reduce((s, a) => s + a.allocation, 0);
    if (sum === 0) {
      // If all allocations are 0, distribute equally
      const equalAllocation = 1.0 / constrained.length;
      constrained = constrained.map(a => ({ ...a, allocation: equalAllocation }));
    } else {
      constrained = constrained.map(a => ({ ...a, allocation: a.allocation / sum }));
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
