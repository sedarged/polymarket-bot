import { bench, describe } from 'vitest';
import { CircuitBreaker } from '../../src/utils/circuitBreaker';

/**
 * Circuit Breaker Benchmarks
 * 
 * These benchmarks measure the performance of circuit breaker operations,
 * which are critical for preventing cascading failures.
 */

describe('Circuit Breaker Performance', () => {
  const breaker = new CircuitBreaker({
    name: 'test-breaker',
    failureThreshold: 5,
    resetTimeout: 60000,
    successThreshold: 2,
  });

  bench('execute - successful request (closed state)', async () => {
    await breaker.execute(async () => 'success');
  });

  bench('getMetrics', () => {
    breaker.getMetrics();
  });

  // Benchmark batch operations
  bench('execute - 10 successful requests', async () => {
    const breaker2 = new CircuitBreaker({
      name: 'test-breaker-2',
      failureThreshold: 5,
      resetTimeout: 60000,
      successThreshold: 2,
    });
    
    for (let i = 0; i < 10; i++) {
      await breaker2.execute(async () => 'success');
    }
  });
});
