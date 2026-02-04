import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../src/utils/rateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.stop();
    }
    vi.useRealTimers();
  });

  describe('Basic rate limiting', () => {
    it('allows requests within limit', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 3,
      });

      const ip = '192.168.1.1';

      // First request
      const result1 = rateLimiter.checkLimit(ip);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      // Second request
      const result2 = rateLimiter.checkLimit(ip);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      // Third request
      const result3 = rateLimiter.checkLimit(ip);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('blocks requests exceeding limit', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      const ip = '192.168.1.1';

      // First two requests allowed
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);

      // Third request blocked
      const result3 = rateLimiter.checkLimit(ip);
      expect(result3.allowed).toBe(false);
      expect(result3.retryAfter).toBeDefined();
      expect(result3.retryAfter).toBeGreaterThan(0);
    });

    it('resets limit after window expires', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      const ip = '192.168.1.1';

      // Use up limit
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip).allowed).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(60001);

      // Should be allowed again
      const result = rateLimiter.checkLimit(ip);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });
  });

  describe('Multiple IPs', () => {
    it('tracks limits separately per IP', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // IP1 uses up its limit
      expect(rateLimiter.checkLimit(ip1).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip1).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip1).allowed).toBe(false);

      // IP2 should still be allowed
      expect(rateLimiter.checkLimit(ip2).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip2).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip2).allowed).toBe(false);
    });

    it('handles many different IPs', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      // Test 100 different IPs
      for (let i = 0; i < 100; i++) {
        const ip = `192.168.1.${i}`;
        expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
        expect(rateLimiter.checkLimit(ip).allowed).toBe(false);
      }

      const stats = rateLimiter.getStats();
      expect(stats.totalClients).toBe(100);
    });
  });

  describe('Retry-After calculation', () => {
    it('provides correct retry-after time', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      const ip = '192.168.1.1';

      // Use up limit
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);

      // Check retry-after immediately
      const result = rateLimiter.checkLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(60); // 60 seconds

      // Advance 30 seconds
      vi.advanceTimersByTime(30000);

      // Check retry-after again
      const result2 = rateLimiter.checkLimit(ip);
      expect(result2.allowed).toBe(false);
      expect(result2.retryAfter).toBe(30); // 30 seconds remaining
    });
  });

  describe('Memory cleanup', () => {
    it('cleans up expired entries', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      // Add entries for multiple IPs
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit(`192.168.1.${i}`);
      }

      expect(rateLimiter.getStats().totalClients).toBe(10);

      // Advance time past window
      vi.advanceTimersByTime(60001);

      // Trigger cleanup (runs every minute)
      vi.advanceTimersByTime(60000);

      // Make a new request to trigger internal state check
      rateLimiter.checkLimit('192.168.1.0');

      // After cleanup, expired entries should be removed
      // The cleanup happens on interval, so we need to wait
      const stats = rateLimiter.getStats();
      expect(stats.totalClients).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge cases', () => {
    it('handles high request limits', () => {
      rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 10000,
      });

      const ip = '192.168.1.1';

      // Make many requests
      for (let i = 0; i < 10000; i++) {
        expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
      }

      // Next should be blocked
      expect(rateLimiter.checkLimit(ip).allowed).toBe(false);
    });

    it('handles very short windows', () => {
      rateLimiter = new RateLimiter({
        windowMs: 1000, // 1 second
        maxRequests: 2,
      });

      const ip = '192.168.1.1';

      // Use up limit
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip).allowed).toBe(false);

      // Advance 1 second
      vi.advanceTimersByTime(1001);

      // Should be allowed again
      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
    });

    it('handles limit of 1', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      const ip = '192.168.1.1';

      expect(rateLimiter.checkLimit(ip).allowed).toBe(true);
      expect(rateLimiter.checkLimit(ip).allowed).toBe(false);
    });
  });

  describe('Stop functionality', () => {
    it('stops cleanup interval', () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });

      // Add some entries
      rateLimiter.checkLimit('192.168.1.1');
      expect(rateLimiter.getStats().totalClients).toBe(1);

      // Stop the rate limiter
      rateLimiter.stop();

      // Advance time - cleanup should not run
      vi.advanceTimersByTime(120000);

      // Stats should still show the client (cleanup didn't run)
      expect(rateLimiter.getStats().totalClients).toBe(1);
    });
  });
});
