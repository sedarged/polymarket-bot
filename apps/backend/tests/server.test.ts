import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createServer } from '../src/server';

describe('Server', () => {
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

  it('returns health payload', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.liveTradingEnabled).toBe(false);
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns readiness payload with 503 when not ready', async () => {
    const response = await fetch(`${baseUrl}/ready`);
    const body = await response.json();

    // Server starts without trading client initialized or market feed connected
    expect(response.status).toBe(503);
    expect(body.ready).toBe(false);
    expect(typeof body.timestamp).toBe('string');
    expect(body.checks).toBeDefined();
    expect(body.checks.marketFeed).toBeDefined();
    expect(body.checks.tradingClient).toBeDefined();
  });

  it('returns metrics payload', async () => {
    const response = await fetch(`${baseUrl}/metrics`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptime).toBe('number');
    expect(body.memory).toBeDefined();
    expect(typeof body.memory.heapUsed).toBe('number');
    expect(typeof body.memory.heapTotal).toBe('number');
    expect(typeof body.memory.rss).toBe('number');
    expect(body.trading).toBeDefined();
    expect(typeof body.trading.liveTrading).toBe('boolean');
    expect(typeof body.trading.initialized).toBe('boolean');
    expect(body.marketFeed).toBeDefined();
    expect(typeof body.marketFeed.connected).toBe('boolean');
    expect(Array.isArray(body.circuitBreakers)).toBe(true);
  });

  it('returns not found for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Not Found');
  });
});

describe('Server CORS', () => {
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

  it('includes CORS methods in response', async () => {
    const response = await fetch(`${baseUrl}/health`);
    
    expect(response.status).toBe(200);
    // When there's no Origin header, we still include CORS methods but not origin
    expect(response.headers.has('access-control-allow-methods')).toBe(true);
  });

  it('handles OPTIONS preflight request', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
    });
    
    expect(response.status).toBe(200);
    expect(response.headers.has('access-control-allow-methods')).toBe(true);
    expect(response.headers.has('access-control-allow-headers')).toBe(true);
  });

  it('allows requests from configured origin', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        'Origin': 'http://localhost:3000',
      },
    });
    
    expect(response.status).toBe(200);
    const corsOrigin = response.headers.get('access-control-allow-origin');
    // Should reflect the origin back since it's in allowedOrigins
    expect(corsOrigin).toBe('http://localhost:3000');
  });

  it('does not allow requests from non-configured origin', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        'Origin': 'https://malicious.example.com',
      },
    });
    
    expect(response.status).toBe(200);
    const corsOrigin = response.headers.get('access-control-allow-origin');
    // Should NOT have CORS origin header for disallowed origin
    expect(corsOrigin).toBeNull();
  });
});
