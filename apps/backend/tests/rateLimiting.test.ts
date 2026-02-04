import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createServer, getRateLimiter } from '../src/server';

describe('Server Rate Limiting (A-008)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Note: Rate limits use default config values (100 requests per 60 seconds)
    // These tests verify the rate limiting mechanism works correctly
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up rate limiter to prevent resource leaks
    const rateLimiter = getRateLimiter();
    if (rateLimiter) {
      rateLimiter.stop();
      rateLimiter.reset();
    }
    
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('allows many requests within rate limit', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // Make multiple requests - should all succeed (under default limit of 100)
    for (let i = 0; i < 10; i++) {
      const response = await fetch(endpoint);
      expect(response.status).toBe(200);
    }
  });

  it('blocks requests exceeding rate limit with 429', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // Use up the rate limit (default: 100 requests per minute)
    // Make 100 requests to use up the limit
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(fetch(endpoint));
    }
    await Promise.all(requests);
    
    // Next request should be rate limited
    const response = await fetch(endpoint);
    expect(response.status).toBe(429);
    
    const body = await response.json();
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toContain('Rate limit exceeded');
    expect(body.retryAfter).toBeDefined();
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('includes Retry-After header in 429 response', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // Use up the rate limit
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(fetch(endpoint));
    }
    await Promise.all(requests);
    
    // Next request should include Retry-After header
    const response = await fetch(endpoint);
    expect(response.status).toBe(429);
    expect(response.headers.has('retry-after')).toBe(true);
    
    const retryAfter = response.headers.get('retry-after');
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('applies rate limiting to different endpoints', async () => {
    // Test different endpoints all count toward the same IP rate limit
    const endpoints = [
      '/health',
      '/ready',
      '/metrics',
    ];
    
    // Make requests to use up the entire limit (100 requests)
    const requests = [];
    for (let i = 0; i < 100; i++) {
      const endpoint = endpoints[i % endpoints.length];
      requests.push(fetch(`${baseUrl}${endpoint}`));
    }
    await Promise.all(requests);
    
    // Next should be rate limited
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(429);
  });

  it('includes CORS headers in 429 response', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // Use up rate limit
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(fetch(endpoint));
    }
    await Promise.all(requests);
    
    // Rate-limited request with origin header
    const response = await fetch(endpoint, {
      headers: {
        'Origin': 'http://localhost:3000',
      },
    });
    
    expect(response.status).toBe(429);
    expect(response.headers.has('access-control-allow-origin')).toBe(true);
    expect(response.headers.has('access-control-allow-methods')).toBe(true);
  });

  it('handles CORS preflight requests without rate limiting', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // OPTIONS requests should not be rate limited
    // Make more than the limit to verify
    for (let i = 0; i < 110; i++) {
      const response = await fetch(endpoint, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });
      
      expect(response.status).toBe(200);
    }
  });

  it('rate limit response is valid JSON', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // Use up rate limit
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(fetch(endpoint));
    }
    await Promise.all(requests);
    
    const response = await fetch(endpoint);
    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toBe('application/json');
    
    // Should be valid JSON
    const body = await response.json();
    expect(body).toBeDefined();
    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
    expect(typeof body.retryAfter).toBe('number');
  });
});

describe('Server Rate Limiting - IP Tracking', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Reset rate limiter from previous test suite to avoid interference
    const existingRateLimiter = getRateLimiter();
    if (existingRateLimiter) {
      existingRateLimiter.reset();
    }
    
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up rate limiter to prevent resource leaks
    const rateLimiter = getRateLimiter();
    if (rateLimiter) {
      rateLimiter.stop();
      rateLimiter.reset();
    }
    
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('does not trust X-Forwarded-For header by default', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // With RATE_LIMIT_TRUST_PROXY=false (default), X-Forwarded-For headers are ignored
    // All requests from the same client (test runner) count toward the same limit
    // regardless of X-Forwarded-For header value
    
    // Make 100 requests with different X-Forwarded-For headers
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(
        fetch(endpoint, {
          headers: { 'X-Forwarded-For': `10.99.${i}.1` },
        })
      );
    }
    await Promise.all(requests);
    
    // Next request should be rate limited because all requests came from same socket IP
    // (X-Forwarded-For was ignored since RATE_LIMIT_TRUST_PROXY=false)
    const response = await fetch(endpoint, {
      headers: { 'X-Forwarded-For': '10.99.200.1' },
    });
    expect(response.status).toBe(429);
  });

  it('X-Forwarded-For header ignored when trust proxy disabled', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // X-Forwarded-For headers should be ignored when RATE_LIMIT_TRUST_PROXY=false
    // This test verifies that different X-Forwarded-For values don't bypass rate limiting
    
    // Setting different X-Forwarded-For values should not reset the rate limit
    // because the actual socket IP is what's being tracked
    const response1 = await fetch(endpoint, {
      headers: { 'X-Forwarded-For': '10.0.0.3, 10.0.0.100, 10.0.0.200' },
    });
    expect(response1.status).toBe(429); // Still rate limited from previous test
  });
});
