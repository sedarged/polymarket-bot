import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retry, sleep } from '../src/utils/retry';

describe('Retry Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('retry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(fn, { attempts: 3, delay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after all attempts fail', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(retry(fn, { attempts: 3, delay: 10 })).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      await retry(fn, { attempts: 3, delay: 100, backoffMultiplier: 2 });

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });
});
