import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

describe('Server Integration Tests', () => {
  let serverProcess: ChildProcess;
  const apiPort = 3000;
  const adminPort = 3001;
  const maxRetries = 10;
  const retryDelay = 500;

  async function waitForServer(port: number): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await makeRequest(port, '/health');
        if (res.statusCode === 200) {
          return;
        }
      } catch {
        // Server not ready, retry
      }
      await sleep(retryDelay);
    }
    throw new Error(`Server on port ${port} did not start within ${maxRetries * retryDelay}ms`);
  }

  beforeAll(async () => {
    // Start the server in dev mode
    serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: {
        ...process.env,
        BACKEND_PORT: String(apiPort),
        ADMIN_PORT: String(adminPort),
      },
      stdio: 'ignore',
    });

    // Wait for server to be ready
    await waitForServer(apiPort);
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => resolve(), 5000); // Timeout after 5s
      });
    }
  });

  function makeRequest(port: number, path: string, method = 'GET'): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path,
          method,
        },
        (res) => {
          resolve(res);
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  function readResponse(res: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
      res.on('error', reject);
    });
  }

  describe('Health Endpoint', () => {
    it('should respond with 200 OK on /health', async () => {
      const res = await makeRequest(apiPort, '/health');
      expect(res.statusCode).toBe(200);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json).toEqual({ status: 'ok' });
    });
  });

  describe('Markets Endpoint', () => {
    it('should return markets without limit parameter or handle API errors gracefully', async () => {
      const res = await makeRequest(apiPort, '/api/markets');
      // Accept 200 (success) or 500 (API unavailable) since we're making real API calls
      expect([200, 500]).toContain(res.statusCode);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      if (res.statusCode === 200) {
        expect(Array.isArray(json)).toBe(true);
      } else {
        expect(json).toHaveProperty('error');
      }
    });

    it('should reject invalid limit parameter (NaN)', async () => {
      const res = await makeRequest(apiPort, '/api/markets?limit=abc');
      expect(res.statusCode).toBe(400);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json.error).toBe('Invalid limit value');
    });

    it('should reject invalid limit parameter (zero)', async () => {
      const res = await makeRequest(apiPort, '/api/markets?limit=0');
      expect(res.statusCode).toBe(400);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json.error).toBe('Invalid limit value');
    });

    it('should reject invalid limit parameter (negative)', async () => {
      const res = await makeRequest(apiPort, '/api/markets?limit=-5');
      expect(res.statusCode).toBe(400);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json.error).toBe('Invalid limit value');
    });
  });

  describe('Orderbook Endpoint', () => {
    it('should reject request without tokenId parameter', async () => {
      const res = await makeRequest(apiPort, '/api/orderbook');
      expect(res.statusCode).toBe(400);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json.error).toBe('Missing tokenId query parameter');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in responses', async () => {
      const res = await makeRequest(apiPort, '/health');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toBe('GET,OPTIONS');
    });

    it('should handle OPTIONS requests', async () => {
      const res = await makeRequest(apiPort, '/health', 'OPTIONS');
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown paths', async () => {
      const res = await makeRequest(apiPort, '/api/unknown');
      expect(res.statusCode).toBe(404);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json.error).toBe('Not found');
    });

    it('should return 405 for unsupported methods', async () => {
      const res = await makeRequest(apiPort, '/health', 'POST');
      expect(res.statusCode).toBe(405);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json.error).toBe('Method not allowed');
    });
  });

  describe('Admin Server', () => {
    it('should respond with 200 OK on admin /health', async () => {
      const res = await makeRequest(adminPort, '/health');
      expect(res.statusCode).toBe(200);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json).toEqual({ status: 'ok' });
    });

    it('should return 404 for unknown admin paths', async () => {
      const res = await makeRequest(adminPort, '/api/unknown');
      expect(res.statusCode).toBe(404);

      const body = await readResponse(res);
      const json = JSON.parse(body);
      expect(json.error).toBe('Not found');
    });
  });
});
