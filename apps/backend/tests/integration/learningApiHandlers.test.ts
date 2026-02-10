import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createServer } from "../../src/server";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Learning System API Tests - PR-012
 *
 * Tests the learning system API endpoints that provide dashboard integration:
 * - /api/learning/experiments - List active experiments with metrics
 * - /api/learning/strategies - List strategies with performance data
 * - /api/learning/best - Get best performing strategy
 * - /api/learning/status - Get integration status
 *
 * All endpoints require admin authentication.
 */
describe("Learning System API - PR-012", () => {
  let server: http.Server;
  let baseUrl: string;
  let tempDir: string;

  // Token testowy pobierany z ENV, aby był zgodny z konfiguracją
  const VALID_TOKEN = process.env.ADMIN_TOKEN || "test-admin-token-12345";
  const INVALID_TOKEN = "invalid-token-xyz";

  beforeAll(async () => {
    // Create temp directory for test databases
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-api-test-"));
    // Ustaw token ENV na wartość testową
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    process.env.EVENT_STORE_PATH = path.join(tempDir, "events.db");
    process.env.SIGNAL_CATALOG_PATH = path.join(tempDir, "signals.db");
    process.env.BACKTEST_ENGINE_PATH = path.join(tempDir, "backtests.db");
    process.env.PROMOTION_WORKFLOW_PATH = path.join(tempDir, "promotions.db");
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

    // Clean up temp directory (ignore EPERM on Windows when dir in use)
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors (e.g. EPERM on Windows when files in use)
      }
    }
  });

  describe("/api/learning/experiments", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/api/learning/experiments`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects request with invalid token", async () => {
      const response = await fetch(`${baseUrl}/api/learning/experiments`, {
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid Bearer token", async () => {
      const response = await fetch(`${baseUrl}/api/learning/experiments`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        const body = await response.json();
        expect(body).toHaveProperty("totalExperiments");
        expect(body).toHaveProperty("experiments");
        expect(body).toHaveProperty("lastUpdated");
        expect(Array.isArray(body.experiments)).toBe(true);
      }
    });

    it("returns proper experiment data structure when initialized", async () => {
      const response = await fetch(`${baseUrl}/api/learning/experiments`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();

        if (body.experiments.length > 0) {
          const experiment = body.experiments[0];
          expect(experiment).toHaveProperty("strategyId");
          expect(experiment).toHaveProperty("samples");
          expect(experiment).toHaveProperty("totalReward");
          expect(experiment).toHaveProperty("meanReward");
          expect(experiment).toHaveProperty("allocation");
          expect(experiment).toHaveProperty("status");
        }
      }
    });
  });

  describe("/api/learning/strategies", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/api/learning/strategies`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/api/learning/strategies`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        const body = await response.json();
        expect(body).toHaveProperty("totalStrategies");
        expect(body).toHaveProperty("strategies");
        expect(body).toHaveProperty("lastUpdated");
        expect(Array.isArray(body.strategies)).toBe(true);
      }
    });

    it("returns proper strategy data structure when initialized", async () => {
      const response = await fetch(`${baseUrl}/api/learning/strategies`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();

        if (body.strategies.length > 0) {
          const strategy = body.strategies[0];
          expect(strategy).toHaveProperty("strategyId");
          expect(strategy).toHaveProperty("status");
          expect(strategy).toHaveProperty("samples");
          expect(strategy).toHaveProperty("pnl");
          expect(strategy).toHaveProperty("sharpeRatio");
          expect(strategy).toHaveProperty("winRate");
          expect(strategy).toHaveProperty("maxDrawdown");
          expect(strategy).toHaveProperty("promotionEligible");
        }
      }
    });
  });

  describe("/api/learning/best", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/api/learning/best`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/api/learning/best`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        const body = await response.json();
        expect(body).toHaveProperty("bestStrategy");
        expect(body).toHaveProperty("recommendation");
        expect(body).toHaveProperty("lastUpdated");
      }
    });

    it("returns proper best strategy data structure when initialized", async () => {
      const response = await fetch(`${baseUrl}/api/learning/best`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();

        if (body.bestStrategy) {
          expect(body.bestStrategy).toHaveProperty("strategyId");
          expect(body.bestStrategy).toHaveProperty("status");
          expect(body.bestStrategy).toHaveProperty("performance");
          expect(body.bestStrategy).toHaveProperty("promotionEligible");
          expect(body.bestStrategy).toHaveProperty("promotionBlockers");
          expect(typeof body.recommendation).toBe("string");
        } else {
          // No strategies yet - should have message
          expect(body.message).toBeTruthy();
        }
      }
    });
  });

  describe("/api/learning/status", () => {
    it("rejects request without authorization header", async () => {
      const response = await fetch(`${baseUrl}/api/learning/status`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("allows request with valid token", async () => {
      const response = await fetch(`${baseUrl}/api/learning/status`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        const body = await response.json();
        expect(body).toHaveProperty("eventStore");
        expect(body).toHaveProperty("signalCatalog");
        expect(body).toHaveProperty("backtestEngine");
        expect(body).toHaveProperty("banditAllocator");
        expect(body).toHaveProperty("metricsGating");
        expect(body).toHaveProperty("promotionWorkflow");
        expect(body).toHaveProperty("overall");
        expect(body).toHaveProperty("lastUpdated");
      }
    });

    it("returns proper status data structure", async () => {
      const response = await fetch(`${baseUrl}/api/learning/status`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      if (response.status === 200) {
        const body = await response.json();

        // Check event store status structure
        expect(body.eventStore).toHaveProperty("initialized");
        expect(body.eventStore).toHaveProperty("status");
        expect(typeof body.eventStore.initialized).toBe("boolean");

        // Check overall status structure
        expect(body.overall).toHaveProperty("healthy");
        expect(body.overall).toHaveProperty("mode");
        expect(body.overall.mode).toBe("paper-trading-only");
        expect(typeof body.overall.healthy).toBe("boolean");
      }
    });
  });

  describe("Authentication behavior", () => {
    it("supports Bearer token with space", async () => {
      const response = await fetch(`${baseUrl}/api/learning/status`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect([200, 503]).toContain(response.status);
    });

    it("supports plain token without Bearer prefix", async () => {
      const response = await fetch(`${baseUrl}/api/learning/status`, {
        headers: {
          Authorization: VALID_TOKEN,
        },
      });

      expect([200, 503]).toContain(response.status);
    });

    it("rejects malformed authorization header", async () => {
      const response = await fetch(`${baseUrl}/api/learning/status`, {
        headers: {
          Authorization: "InvalidFormat",
        },
      });

      expect(response.status).toBe(401);
    });

    it("rejects empty authorization header", async () => {
      const response = await fetch(`${baseUrl}/api/learning/status`, {
        headers: {
          Authorization: "",
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Error handling", () => {
    it("returns 503 when learning system not initialized", async () => {
      const response = await fetch(`${baseUrl}/api/learning/experiments`, {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      // Should return either 200 (initialized) or 503 (not initialized)
      expect([200, 503]).toContain(response.status);

      if (response.status === 503) {
        const body = await response.json();
        expect(body.error).toContain("not initialized");
      }
    });

    it("includes proper error messages in responses", async () => {
      const response = await fetch(`${baseUrl}/api/learning/experiments`, {
        headers: {
          Authorization: `Bearer ${INVALID_TOKEN}`,
        },
      });

      const body = await response.json();
      expect(response.status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });
  });
});
