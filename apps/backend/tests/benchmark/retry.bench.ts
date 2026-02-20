import { bench, describe } from 'vitest';
import { retry, classifyError } from '../../src/utils/retry';

/**
 * Retry Logic Benchmarks
 * 
 * These benchmarks measure the performance of retry logic,
 * which is critical for handling transient failures in API calls.
 */

describe('Retry Logic Performance', () => {
  // Successful function (no retries needed)
  const successFn = async () => 'success';

  // Function that fails once then succeeds
  let callCount = 0;
  const failOnceFn = async () => {
    callCount++;
    if (callCount === 1) {
      throw new Error('Transient error');
    }
    return 'success';
  };

  bench('retry - immediate success', async () => {
    await retry(successFn, { attempts: 3, delay: 0 });
  });

  bench('retry - success after one failure', async () => {
    callCount = 0;
    await retry(failOnceFn, { attempts: 3, delay: 0 });
  });

  bench('classifyError - rate limit', () => {
    classifyError(new Error('Rate limit exceeded (429)'));
  });

  bench('classifyError - timeout', () => {
    classifyError(new Error('Request timeout'));
  });

  bench('classifyError - network', () => {
    classifyError(new Error('ECONNREFUSED'));
  });

  bench('classifyError - permanent', () => {
    classifyError(new Error('Bad request (400)'));
  });

  bench('classifyError - transient', () => {
    classifyError(new Error('Internal server error'));
  });

  // Batch error classification
  const errors = [
    new Error('Rate limit exceeded'),
    new Error('Timeout'),
    new Error('ECONNREFUSED'),
    new Error('Bad request'),
    new Error('Unknown error'),
  ];

  bench('classifyError - batch 5 errors', () => {
    errors.forEach(error => classifyError(error));
  });
});
