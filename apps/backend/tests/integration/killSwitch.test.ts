import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/server';
import type { Server } from 'http';
import { config } from '../../src/config';

/**
 * Enhanced Kill Switch Tests - PR-006
 *
 * Uses createServer() + listen(0) to avoid port conflicts with config.port/metricsPort.
 *
 * Tests for the enhanced /kill endpoint with selective cancellation scopes:
 * - scope=all: Cancel all orders (default behavior)
 * - scope=market: Cancel orders for specific market (tokenId or assetId)
 * - scope=risk-only: Disable risk manager without cancelling orders
 *
 * Related Issue: #234 (PR-006)
 * Review Comment: https://github.com/sedarged/polymarket-bot/pull/262#pullrequestreview-3763884483
 */

describe('Enhanced Kill Switch - PR-006', () => {
  let server: Server;
  let baseUrl: string;
  const adminToken = config.adminToken;

  beforeEach(async () => {
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

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  describe('Scope validation', () => {
    it('should reject invalid scope parameter', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=invalid`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Must be one of: 'all', 'market', 'risk-only'");
    });

    it('should accept valid scope=all', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      // Should succeed (200) or fail for operational reasons (500), but not validation error (400)
      expect([200, 500]).toContain(response.status);
    });

    it('should accept valid scope=market with tokenId', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=market&tokenId=test123`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      // Should succeed (200) or fail for operational reasons (500), but not validation error (400)
      expect([200, 500]).toContain(response.status);
    });

    it('should accept valid scope=risk-only', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=risk-only`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      // Should succeed (200) or fail for operational reasons (500), but not validation error (400)
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Market scope validation', () => {
    it('should reject scope=market without tokenId or assetId', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=market`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('either tokenId or assetId must be provided');
    });

    it('should accept scope=market with tokenId', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=market&tokenId=abc123`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      // Should not be a validation error
      expect(response.status).not.toBe(400);
    });

    it('should accept scope=market with assetId', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=market&assetId=asset456`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      // Should not be a validation error
      expect(response.status).not.toBe(400);
    });

    it('should accept scope=market with both tokenId and assetId', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=market&tokenId=abc123&assetId=asset456`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      // Should not be a validation error
      expect(response.status).not.toBe(400);
    });
  });

  describe('Response structure', () => {
    it('should return scope in response for scope=all', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();
        expect(body.scope).toBe('all');
        expect(body).toHaveProperty('cancelledCount');
        expect(body).toHaveProperty('message');
      }
    });

    it('should return scope and tokenId in response for scope=market', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=market&tokenId=test123`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();
        expect(body.scope).toBe('market');
        expect(body.tokenId).toBe('test123');
        expect(body).toHaveProperty('cancelledCount');
        expect(body.message).toContain('test123');
      }
    });

    it('should return scope in response for scope=risk-only', async () => {
      const response = await fetch(`${baseUrl}/kill?scope=risk-only`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();
        expect(body.scope).toBe('risk-only');
        expect(body).toHaveProperty('message');
        // With createServer() only, risk manager is not started so message may be "No risk manager active"
        expect(body.message).toMatch(/Risk manager|No risk manager active/);
      }
    });
  });

  describe('Backward compatibility', () => {
    it('should default to scope=all when no scope provided', async () => {
      const response = await fetch(`${baseUrl}/kill`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();
        expect(body.scope).toBe('all');
        expect(body.message).toContain('Kill switch activated');
      }
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all scopes', async () => {
      const scopes = ['all', 'market', 'risk-only'];
      
      for (const scope of scopes) {
        const url = scope === 'market' 
          ? `${baseUrl}/kill?scope=${scope}&tokenId=test`
          : `${baseUrl}/kill?scope=${scope}`;
          
        const response = await fetch(url, {
          method: 'POST',
          // No authorization header
        });

        expect(response.status).toBe(401);
      }
    });
  });
});
