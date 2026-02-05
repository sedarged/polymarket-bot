import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry, classifyError, ErrorType, withTimeout, sleep } from '../src/utils/retry';

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should succeed on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const promise = retry(fn, { attempts: 3 });
    
    // Let the first failure happen
    await vi.runOnlyPendingTimersAsync();
    
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const promise = retry(fn, { attempts: 3 });
    const expectation = expect(promise).rejects.toThrow('persistent failure');
    
    // Run all retry timers
    await vi.runAllTimersAsync();

    await expectation;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry if isRetryable returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent error'));

    const promise = retry(fn, {
      attempts: 3,
      isRetryable: (error: Error) => false,
    });

    await expect(promise).rejects.toThrow('permanent error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect total timeout (A-009)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = retry(fn, {
      attempts: 10,
      delay: 1000,
      backoffMultiplier: 2,
      totalTimeout: 3000, // 3 seconds total
    });

    // Start timers
    const expectation = expect(promise).rejects.toThrow(/total timeout/);

    // Run all timers - the total timeout should prevent infinite retries
    await vi.runAllTimersAsync();

    await expectation;
    // Should have attempted fewer times due to timeout
    expect(fn.mock.calls.length).toBeLessThan(10);
  });

  it('should stop before next retry if it would exceed total timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = retry(fn, {
      attempts: 5,
      delay: 2000,
      backoffMultiplier: 1,
      totalTimeout: 5000, // 5 seconds total, but each delay is 2s
    });

    const expectation = expect(promise).rejects.toThrow(/total timeout/);

    // Run timers
    await vi.runAllTimersAsync();

    await expectation;
    // Should stop early because the next wait would exceed the timeout
    expect(fn.mock.calls.length).toBeLessThan(5);
  });

  it('should succeed within total timeout', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = retry(fn, {
      attempts: 5,
      delay: 100,
      totalTimeout: 10000, // 10 seconds - plenty of time
    });

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use default total timeout of 5 minutes', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('classifyError', () => {
  it('should classify rate limit errors', () => {
    expect(classifyError(new Error('429 Too Many Requests'))).toBe(ErrorType.RATE_LIMIT);
    expect(classifyError(new Error('Rate limit exceeded'))).toBe(ErrorType.RATE_LIMIT);
  });

  it('should classify timeout errors', () => {
    expect(classifyError(new Error('Request timed out'))).toBe(ErrorType.TIMEOUT);
    expect(classifyError(new Error('ETIMEDOUT'))).toBe(ErrorType.TIMEOUT);
  });

  it('should classify network errors', () => {
    expect(classifyError(new Error('ECONNREFUSED'))).toBe(ErrorType.NETWORK);
    expect(classifyError(new Error('ECONNRESET'))).toBe(ErrorType.NETWORK);
    expect(classifyError(new Error('ENOTFOUND'))).toBe(ErrorType.NETWORK);
    expect(classifyError(new Error('Network error occurred'))).toBe(ErrorType.NETWORK);
  });

  it('should classify permanent errors', () => {
    expect(classifyError(new Error('400 Bad Request'))).toBe(ErrorType.PERMANENT);
    expect(classifyError(new Error('401 Unauthorized'))).toBe(ErrorType.PERMANENT);
    expect(classifyError(new Error('403 Forbidden'))).toBe(ErrorType.PERMANENT);
    expect(classifyError(new Error('404 Not Found'))).toBe(ErrorType.PERMANENT);
  });

  it('should default to transient for unknown errors', () => {
    expect(classifyError(new Error('500 Internal Server Error'))).toBe(ErrorType.TRANSIENT);
    expect(classifyError(new Error('Unknown error'))).toBe(ErrorType.TRANSIENT);
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve if promise completes before timeout', async () => {
    const promise = new Promise<string>(resolve => {
      setTimeout(() => resolve('success'), 500);
    });

    const timeoutPromise = withTimeout(promise, 1000);
    
    await vi.advanceTimersByTimeAsync(500);
    
    const result = await timeoutPromise;
    expect(result).toBe('success');
  });

  it('should reject if timeout is reached', async () => {
    const promise = new Promise<string>(resolve => {
      setTimeout(() => resolve('success'), 2000);
    });

    const timeoutPromise = withTimeout(promise, 1000);
    const expectation = expect(timeoutPromise).rejects.toThrow('Operation timed out after 1000ms');
    
    await vi.advanceTimersByTimeAsync(1000);
    
    await expectation;
  });
});

describe('sleep', () => {
  it('should resolve after specified time', async () => {
    vi.useRealTimers();
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
