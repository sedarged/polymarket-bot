import { bench, describe } from 'vitest';
import { RateLimiter } from '../../src/utils/rateLimiter';

/**
 * Rate Limiter Benchmarks
 * 
 * These benchmarks measure the performance of rate limiting operations,
 * which are critical for API protection (Audit Finding A-008).
 */

describe('Rate Limiter Performance', () => {
  const rateLimiter = new RateLimiter({
    windowMs: 60000, // 1 minute
    maxRequests: 100,
  });

  bench('checkLimit - new IP', () => {
    const ip = `192.168.1.${Math.floor(Math.random() * 255)}`;
    rateLimiter.checkLimit(ip);
  });

  bench('checkLimit - existing IP within limit', () => {
    rateLimiter.checkLimit('192.168.1.1');
  });

  bench('getStats', () => {
    rateLimiter.getStats();
  });

  // Benchmark batch operations
  const ips = Array.from({ length: 100 }, (_, i) => `192.168.1.${i}`);

  bench('checkLimit - 100 requests from different IPs', () => {
    for (const ip of ips) {
      rateLimiter.checkLimit(ip);
    }
  });

  bench('checkLimit - 100 requests from same IP', () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 });
    for (let i = 0; i < 100; i++) {
      limiter.checkLimit('192.168.1.1');
    }
  });
});
