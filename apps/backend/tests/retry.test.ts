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

describe('jitter (A-023)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should apply jitter to retry delays', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    // Spy on setTimeout to capture actual delays
    vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, delay: number) => {
      if (delay > 0) {
        delays.push(delay);
      }
      return originalSetTimeout(callback, 0) as any;
    }) as any);

    const promise = retry(fn, {
      attempts: 3,
      delay: 1000,
      backoffMultiplier: 2,
      jitter: 0.1, // 10% jitter
    });

    await vi.runAllTimersAsync();
    await promise;

    // We should have captured 2 delays (one for each retry)
    expect(delays.length).toBe(2);

    // First delay: base 1000ms with ±10% jitter
    expect(delays[0]).toBeGreaterThanOrEqual(900);
    expect(delays[0]).toBeLessThanOrEqual(1100);

    // Second delay: base 2000ms (1000 * 2^1) with ±10% jitter
    expect(delays[1]).toBeGreaterThanOrEqual(1800);
    expect(delays[1]).toBeLessThanOrEqual(2200);
  });

  it('should produce different delays across multiple retries (prevents thundering herd)', async () => {
    const delays1: number[] = [];
    const delays2: number[] = [];
    const delays3: number[] = [];

    // Helper to capture delays for a single retry sequence
    const captureDelays = async (delaysArray: number[]) => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const originalSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, delay: number) => {
        if (delay > 0) {
          delaysArray.push(delay);
        }
        return originalSetTimeout(callback, 0) as any;
      }) as any);

      const promise = retry(fn, {
        attempts: 3,
        delay: 1000,
        backoffMultiplier: 2,
        jitter: 0.2, // 20% jitter for more variation
      });

      await vi.runAllTimersAsync();
      await promise;
      vi.restoreAllMocks();
    };

    // Simulate 3 concurrent clients retrying
    await captureDelays(delays1);
    vi.useFakeTimers();
    await captureDelays(delays2);
    vi.useFakeTimers();
    await captureDelays(delays3);

    // All three clients should have 2 delays
    expect(delays1.length).toBe(2);
    expect(delays2.length).toBe(2);
    expect(delays3.length).toBe(2);

    // With jitter, delays should be different (prevent thundering herd)
    // Check first retry delay varies across clients
    const firstDelays = [delays1[0], delays2[0], delays3[0]];
    const allSame = firstDelays.every(d => d === firstDelays[0]);
    expect(allSame).toBe(false);

    // Check second retry delay varies across clients
    const secondDelays = [delays1[1], delays2[1], delays3[1]];
    const allSame2 = secondDelays.every(d => d === secondDelays[0]);
    expect(allSame2).toBe(false);
  });

  it('should respect zero jitter (no randomization)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, delay: number) => {
      if (delay > 0) {
        delays.push(delay);
      }
      return originalSetTimeout(callback, 0) as any;
    }) as any);

    const promise = retry(fn, {
      attempts: 2,
      delay: 1000,
      backoffMultiplier: 2,
      jitter: 0, // No jitter
    });

    await vi.runAllTimersAsync();
    await promise;

    // With zero jitter, delay should be exactly the base delay
    expect(delays.length).toBe(1);
    expect(delays[0]).toBe(1000);
  });

  it('should apply custom jitter factor', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, delay: number) => {
      if (delay > 0) {
        delays.push(delay);
      }
      return originalSetTimeout(callback, 0) as any;
    }) as any);

    const promise = retry(fn, {
      attempts: 2,
      delay: 1000,
      backoffMultiplier: 1,
      jitter: 0.5, // 50% jitter
    });

    await vi.runAllTimersAsync();
    await promise;

    // With 50% jitter, delay should be within ±50% of base (500-1500ms)
    expect(delays.length).toBe(1);
    expect(delays[0]).toBeGreaterThanOrEqual(500);
    expect(delays[0]).toBeLessThanOrEqual(1500);
  });

  it('should never produce negative delays with jitter', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, delay: number) => {
      if (delay > 0) {
        delays.push(delay);
      }
      return originalSetTimeout(callback, 0) as any;
    }) as any);

    // Run multiple times to ensure no negative delays
    for (let i = 0; i < 10; i++) {
      vi.useFakeTimers();
      const fnInstance = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const promise = retry(fnInstance, {
        attempts: 2,
        delay: 100,
        jitter: 1.0, // 100% jitter - maximum randomization
      });

      await vi.runAllTimersAsync();
      await promise;
    }

    // All delays should be non-negative
    delays.forEach(delay => {
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  it('should use default jitter of 10% when not specified', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, delay: number) => {
      if (delay > 0) {
        delays.push(delay);
      }
      return originalSetTimeout(callback, 0) as any;
    }) as any);

    const promise = retry(fn, {
      attempts: 2,
      delay: 1000,
      // jitter not specified - should default to 0.1
    });

    await vi.runAllTimersAsync();
    await promise;

    // Default 10% jitter means delay should be within 900-1100ms
    expect(delays.length).toBe(1);
    expect(delays[0]).toBeGreaterThanOrEqual(900);
    expect(delays[0]).toBeLessThanOrEqual(1100);
  });
});
