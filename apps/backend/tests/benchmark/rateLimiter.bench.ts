import { bench, describe, afterAll } from 'vitest';
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

  // Clean up the rate limiter after tests to prevent timer leaks
  afterAll(() => {
    rateLimiter.stop();
  });

  // Pre-generate a pool of IPs to avoid random generation in the benchmarked section
  const randomIps = Array.from({ length: 1000 }, (_, i) => `192.168.1.${i % 256}`);
  let randomIpIndex = 0;

  bench('checkLimit - new IP', () => {
    const ip = randomIps[randomIpIndex];
    randomIpIndex = (randomIpIndex + 1) % randomIps.length;
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
    limiter.stop();
  });
});
