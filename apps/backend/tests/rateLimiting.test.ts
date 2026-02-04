import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { createServer } from '../src/server';

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
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('respects X-Forwarded-For header', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // Requests with X-Forwarded-For should be tracked separately
    // Use unique IP that hasn't been used yet to avoid interference with other tests
    const uniqueIp = `10.99.99.${Math.floor(Math.random() * 255)}`;
    
    // Make 100 requests from this IP
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(
        fetch(endpoint, {
          headers: { 'X-Forwarded-For': uniqueIp },
        })
      );
    }
    await Promise.all(requests);
    
    // Next request from same IP should be rate limited
    const response = await fetch(endpoint, {
      headers: { 'X-Forwarded-For': uniqueIp },
    });
    expect(response.status).toBe(429);
    
    // Request from different IP should succeed
    const differentIp = `10.99.88.${Math.floor(Math.random() * 255)}`;
    const response2 = await fetch(endpoint, {
      headers: { 'X-Forwarded-For': differentIp },
    });
    expect(response2.status).toBe(200);
  });

  it('handles X-Forwarded-For with multiple IPs', async () => {
    const endpoint = `${baseUrl}/health`;
    
    // X-Forwarded-For can have multiple IPs (client, proxy1, proxy2)
    // Should use the first IP (original client)
    const uniqueIp = `10.77.77.${Math.floor(Math.random() * 255)}`;
    
    // Make 100 requests with same first IP
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(
        fetch(endpoint, {
          headers: { 'X-Forwarded-For': `${uniqueIp}, 10.0.0.100, 10.0.0.200` },
        })
      );
    }
    await Promise.all(requests);
    
    // Next request should be rate limited (same first IP)
    const response = await fetch(endpoint, {
      headers: { 'X-Forwarded-For': `${uniqueIp}, 192.168.1.1` },
    });
    expect(response.status).toBe(429);
  });
});
