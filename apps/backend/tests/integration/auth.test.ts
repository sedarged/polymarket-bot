import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createServer } from "../../src/server";

/**
 * Authentication Tests - Audit Finding A-004
 *
 * Tests that all sensitive endpoints require admin authentication.
 * Sensitive endpoints include:
 * - /status - Exposes wallet address and trading mode
 * - /state - Exposes orders, positions, and balances
 * - /orders - Exposes order information
 * - /fills - Exposes fill history
 * - /kill - Kill switch activation
 * - /kill-switch - Legacy kill switch endpoint
 */
describe("Authentication - Audit Finding A-004", () => {
  let server: http.Server;
  let baseUrl: string;

  // Valid admin token for testing (dynamic, zgodny z .env)
  const VALID_TOKEN = process.env.ADMIN_TOKEN || "polymarket-test-admin";
  const INVALID_TOKEN = "invalid-token-xyz";

  beforeAll(async () => {
    // Ustaw token z .env (jeśli nie ustawiony)
    if (!process.env.ADMIN_TOKEN) {
      process.env.ADMIN_TOKEN = "polymarket-test-admin";
    }
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== "string") {
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

  describe("Public endpoints (no auth required)", () => {
    it("allows access to /health without auth", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
    });

    it("allows access to /ready without auth", async () => {
      const response = await fetch(`${baseUrl}/ready`);
      expect([200, 503]).toContain(response.status);
    });

    it("allows access to /metrics without auth", async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      expect(response.status).toBe(200);
    });

    it("allows access to /orderbooks without auth", async () => {
      const response = await fetch(`${baseUrl}/orderbooks`);
      expect(response.status).toBe(200);
    });

    it("allows access to /feed/status without auth", async () => {
      const response = await fetch(`${baseUrl}/feed/status`);
      expect(response.status).toBe(200);
    });
  });

  describe("Sensitive endpoint: /status", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/status`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects request with invalid token", async () => {
      const response = await fetch(`${baseUrl}/status`, {
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid Bearer token", async () => {
      const response = await fetch(`${baseUrl}/status`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.liveTrading).toBeDefined();
      expect(body.tradingClientInitialized).toBeDefined();
    });

    it("allows request with valid token (without Bearer prefix)", async () => {
      const response = await fetch(`${baseUrl}/status`, {
        headers: {
          Authorization: VALID_TOKEN,
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Sensitive endpoint: /state", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/state`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects request with invalid token", async () => {
      const response = await fetch(`${baseUrl}/state`, {
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/state`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      // Should succeed even if trading client is not initialized
      expect([200, 500]).toContain(response.status);
    });
  });

  describe("Sensitive endpoint: /orders", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/orders`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects request with invalid token", async () => {
      const response = await fetch(`${baseUrl}/orders`, {
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/orders`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      // Should succeed even if trading client is not initialized
      expect([200, 500]).toContain(response.status);
    });
  });

  describe("Sensitive endpoint: /fills", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/fills`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects request with invalid token", async () => {
      const response = await fetch(`${baseUrl}/fills`, {
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/fills`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      // Should succeed even if trading client is not initialized
      expect([200, 500]).toContain(response.status);
    });
  });

  describe("Sensitive endpoint: /kill", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/kill`, {
        method: "POST",
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects request with invalid token", async () => {
      const response = await fetch(`${baseUrl}/kill`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/kill`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  describe("Sensitive endpoint: /kill-switch (legacy)", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/kill-switch`, {
        method: "POST",
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects request with invalid token", async () => {
      const response = await fetch(`${baseUrl}/kill-switch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/kill-switch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });
});

describe("Authentication - Token requirement in production", () => {
  it("should fail config parsing when ADMIN_TOKEN is missing in production", async () => {
    // Import parseConfig dynamically to test with fresh environment
    const { parseConfig } = await import("../../src/config/index.js");

    const envWithoutToken = {
      ...process.env,
      NODE_ENV: "production",
      ADMIN_TOKEN: "",
      LIVE_TRADING: "false",
    };

    expect(() => parseConfig(envWithoutToken)).toThrow(
      /ADMIN_TOKEN is required/,
    );
  });

  it("should succeed config parsing when ADMIN_TOKEN is missing but ADMIN_TOKEN_NEXT is provided in production", async () => {
    const { parseConfig } = await import("../../src/config/index.js");

    const envWithNextToken = {
      ...process.env,
      NODE_ENV: "production",
      ADMIN_TOKEN: "",
      ADMIN_TOKEN_NEXT: "next-token-12345",
      LIVE_TRADING: "false",
    };

    const config = parseConfig(envWithNextToken);
    expect(config.adminTokenNext).toBe("next-token-12345");
  });

  it("should fail config parsing when ADMIN_TOKEN is missing with live trading", async () => {
    const { parseConfig } = await import("../../src/config/index.js");

    const envWithoutToken = {
      ...process.env,
      NODE_ENV: "development", // Not production, but live trading is enabled
      ADMIN_TOKEN: "",
      LIVE_TRADING: "true",
      COMPLIANCE_ACCEPTED: "true",
    };

    expect(() => parseConfig(envWithoutToken)).toThrow(
      /ADMIN_TOKEN is required/,
    );
  });

  it("should not fail config parsing when ADMIN_TOKEN is missing in development", async () => {
    const { parseConfig } = await import("../../src/config/index.js");

    const envWithoutToken = {
      ...process.env,
      NODE_ENV: "development",
      ADMIN_TOKEN: "",
      LIVE_TRADING: "false",
    };

    expect(() => parseConfig(envWithoutToken)).not.toThrow();
  });

  it("should succeed config parsing when ADMIN_TOKEN is provided in production", async () => {
    const { parseConfig } = await import("../../src/config/index.js");

    const envWithToken = {
      ...process.env,
      NODE_ENV: "production",
      ADMIN_TOKEN: "test-token-12345",
      LIVE_TRADING: "false",
    };

    const config = parseConfig(envWithToken);
    expect(config.adminToken).toBe("test-token-12345");
  });

  it("should succeed config parsing when ADMIN_TOKEN is provided with live trading", async () => {
    const { parseConfig } = await import("../../src/config/index.js");

    const envWithToken = {
      ...process.env,
      NODE_ENV: "development",
      ADMIN_TOKEN: "test-token-67890",
      LIVE_TRADING: "true",
      COMPLIANCE_ACCEPTED: "true",
    };

    const config = parseConfig(envWithToken);
    expect(config.adminToken).toBe("test-token-67890");
  });
});
