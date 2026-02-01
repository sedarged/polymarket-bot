import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '../src/utils/circuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (breaker) {
      breaker.destroy();
    }
  });

  describe('initialization', () => {
    it('should start in closed state', () => {
      breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isOpen()).toBe(false);
    });

    it('should use default options', () => {
      breaker = new CircuitBreaker();
      const metrics = breaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
    });

    it('should accept custom options', () => {
      breaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        resetTimeout: 30000,
        successThreshold: 1,
      });
      expect(breaker.getMetrics().name).toBe('test-breaker');
    });
  });

  describe('closed state', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({ failureThreshold: 3 });
    });

    it('should allow requests through', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track successful requests', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      await breaker.execute(fn);
      await breaker.execute(fn);
      
      const metrics = breaker.getMetrics();
      expect(metrics.successes).toBe(2);
      expect(metrics.consecutiveSuccesses).toBe(2);
      expect(metrics.failures).toBe(0);
    });

    it('should track failed requests', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBe(1);
      expect(metrics.consecutiveFailures).toBe(1);
    });

    it('should open after reaching failure threshold', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Fail 3 times (threshold)
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isOpen()).toBe(true);
    });

    it('should reset failure count on success', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail'));
      
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.getMetrics().consecutiveFailures).toBe(1);
      
      await breaker.execute(fn);
      expect(breaker.getMetrics().consecutiveFailures).toBe(0);
      expect(breaker.getMetrics().failures).toBe(0); // Reset in closed state
      
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.getMetrics().consecutiveFailures).toBe(1);
    });
  });

  describe('open state', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({ 
        failureThreshold: 2,
        resetTimeout: 5000,
      });
    });

    it('should reject requests immediately', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Should reject without calling fn
      const fnNew = vi.fn().mockResolvedValue('success');
      await expect(breaker.execute(fnNew)).rejects.toThrow('Circuit breaker is open');
      expect(fnNew).not.toHaveBeenCalled();
    });

    it('should transition to half-open after timeout', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Fast-forward past reset timeout
      vi.advanceTimersByTime(5000);
      
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should emit open event', async () => {
      const openHandler = vi.fn();
      breaker.on('open', openHandler);
      
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      expect(openHandler).toHaveBeenCalledTimes(1);
      expect(openHandler).toHaveBeenCalledWith(
        expect.objectContaining({ state: CircuitState.OPEN })
      );
    });
  });

  describe('half-open state', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 5000,
        successThreshold: 2,
      });
    });

    it('should allow test requests', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      // Transition to half-open
      vi.advanceTimersByTime(5000);
      
      const testFn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(testFn);
      
      expect(result).toBe('success');
      expect(testFn).toHaveBeenCalledTimes(1);
    });

    it('should close after success threshold', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      // Transition to half-open
      vi.advanceTimersByTime(5000);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Success threshold is 2
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen on failure', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      // Transition to half-open
      vi.advanceTimersByTime(5000);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Any failure reopens
      const failFn = vi.fn().mockRejectedValue(new Error('still failing'));
      await expect(breaker.execute(failFn)).rejects.toThrow('still failing');
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should emit half-open and closed events', async () => {
      const halfOpenHandler = vi.fn();
      const closedHandler = vi.fn();
      breaker.on('half-open', halfOpenHandler);
      breaker.on('closed', closedHandler);
      
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      // Transition to half-open
      vi.advanceTimersByTime(5000);
      expect(halfOpenHandler).toHaveBeenCalledTimes(1);
      
      // Close the circuit
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn);
      await breaker.execute(successFn);
      
      expect(closedHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('metrics', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({ name: 'test-metrics' });
    });

    it('should track total requests', async () => {
      const fn = vi.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      await breaker.execute(fn);
      await expect(breaker.execute(fn)).rejects.toThrow();
      await breaker.execute(fn);
      
      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
    });

    it('should track last failure and success times', async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      await expect(breaker.execute(fn)).rejects.toThrow();
      const metricsAfterFailure = breaker.getMetrics();
      expect(metricsAfterFailure.lastFailureTime).toBe(now);
      expect(metricsAfterFailure.lastSuccessTime).toBeNull();
      
      vi.setSystemTime(now + 1000);
      await breaker.execute(fn);
      const metricsAfterSuccess = breaker.getMetrics();
      expect(metricsAfterSuccess.lastSuccessTime).toBe(now + 1000);
    });

    it('should include circuit breaker name', () => {
      const metrics = breaker.getMetrics();
      expect(metrics.name).toBe('test-metrics');
    });
  });

  describe('manual reset', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({ failureThreshold: 2 });
    });

    it('should reset to closed state', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Manual reset
      breaker.reset();
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBe(0);
      expect(metrics.consecutiveFailures).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should clean up timers and listeners', () => {
      breaker = new CircuitBreaker({ resetTimeout: 5000 });
      
      const handler = vi.fn();
      breaker.on('open', handler);
      
      breaker.destroy();
      
      // Should not crash or leak memory
      expect(breaker.listenerCount('open')).toBe(0);
    });
  });
});
