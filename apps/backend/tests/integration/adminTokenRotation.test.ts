import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createServer } from "../../src/server";
import { ConfigManager } from "../../src/config/configManager";

describe("Admin token rotation (GAP-038)", () => {
  let server: http.Server;
  let baseUrl: string;
  let originalAdminToken: string | undefined;
  let originalAdminTokenNext: string | undefined;
  const configManager = ConfigManager.getInstance();

  const token1 = "rotation-token-1";
  const token2 = "rotation-token-2";

  beforeAll(async () => {
    originalAdminToken = process.env.ADMIN_TOKEN;
    originalAdminTokenNext = process.env.ADMIN_TOKEN_NEXT;

    process.env.ADMIN_TOKEN = token1;
    delete process.env.ADMIN_TOKEN_NEXT;

    await configManager.reloadConfig({ reason: "test" });

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

    if (originalAdminToken !== undefined) {
      process.env.ADMIN_TOKEN = originalAdminToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }

    if (originalAdminTokenNext !== undefined) {
      process.env.ADMIN_TOKEN_NEXT = originalAdminTokenNext;
    } else {
      delete process.env.ADMIN_TOKEN_NEXT;
    }

    await configManager.reloadConfig({ reason: "test-cleanup" });
    await configManager.destroy();
  });

  it("accepts only ADMIN_TOKEN initially", async () => {
    const ok = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    expect(ok.status).toBe(200);

    const bad = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(bad.status).toBe(401);
  });

  it("accepts ADMIN_TOKEN_NEXT after reload (dual-token window)", async () => {
    process.env.ADMIN_TOKEN = token1;
    process.env.ADMIN_TOKEN_NEXT = token2;
    await configManager.reloadConfig({ reason: "test" });

    const ok1 = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    expect(ok1.status).toBe(200);

    const ok2 = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(ok2.status).toBe(200);
  });

  it("supports completing rotation by swapping ADMIN_TOKEN and clearing NEXT", async () => {
    process.env.ADMIN_TOKEN = token2;
    delete process.env.ADMIN_TOKEN_NEXT;
    await configManager.reloadConfig({ reason: "test" });

    const ok = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(ok.status).toBe(200);

    const old = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    expect(old.status).toBe(401);
  });

  it("rejects empty authorization header value (Bearer with no token)", async () => {
    // Set up dual-token window
    process.env.ADMIN_TOKEN = token1;
    process.env.ADMIN_TOKEN_NEXT = token2;
    await configManager.reloadConfig({ reason: "test" });

    const emptyBearer = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: "Bearer " },
    });
    expect(emptyBearer.status).toBe(401);
  });

  it("rejects whitespace-only tokens", async () => {
    // Set up dual-token window
    process.env.ADMIN_TOKEN = token1;
    process.env.ADMIN_TOKEN_NEXT = token2;
    await configManager.reloadConfig({ reason: "test" });

    const whitespaceToken = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: "Bearer    " },
    });
    expect(whitespaceToken.status).toBe(401);
  });

  it("rejects authorization header with only Bearer keyword", async () => {
    // Set up dual-token window
    process.env.ADMIN_TOKEN = token1;
    process.env.ADMIN_TOKEN_NEXT = token2;
    await configManager.reloadConfig({ reason: "test" });

    const bearerOnly = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: "Bearer" },
    });
    expect(bearerOnly.status).toBe(401);
  });


  it("accepts case-insensitive Bearer scheme", async () => {
    process.env.ADMIN_TOKEN = token1;
    delete process.env.ADMIN_TOKEN_NEXT;
    await configManager.reloadConfig({ reason: "test" });

    const lowerCaseBearer = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `bearer ${token1}` },
    });
    expect(lowerCaseBearer.status).toBe(200);
  });

  it("accepts Bearer token with extra spacing around token", async () => {
    process.env.ADMIN_TOKEN = token1;
    delete process.env.ADMIN_TOKEN_NEXT;
    await configManager.reloadConfig({ reason: "test" });

    const paddedBearer = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer   ${token1}   ` },
    });
    expect(paddedBearer.status).toBe(200);
  });
});

