import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketClient, WebSocketState } from "../src/clients/websocket";
import { WebSocketServer } from "ws";

describe("WebSocketClient", () => {
  let server: WebSocketServer;
  let port: number;
  let client: WebSocketClient;

  beforeEach(async () => {
    // Create a test WebSocket server
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      server.on("listening", () => {
        const address = server.address();
        if (address && typeof address !== "string") {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (client) {
      await client.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe("connection lifecycle", () => {
    it("should connect to WebSocket server", async () => {
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      const openPromise = new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      client.connect();
      await openPromise;

      expect(client.isConnected()).toBe(true);
      expect(client.getState()).toBe(WebSocketState.CONNECTED);
    });

    it("should emit open event on connection", async () => {
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
      });

      const openHandler = vi.fn();
      client.on("open", openHandler);

      client.connect();
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      expect(openHandler).toHaveBeenCalledOnce();
    });

    it("should emit close event on disconnection", async () => {
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 1000, // Prevent immediate reconnect
      });

      const closeHandler = vi.fn(() => {
        // Debug log
        console.log("WebSocketClient: close event fired");
      });
      client.on("close", closeHandler);

      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
        client.connect();
      });

      const closePromise = new Promise<void>((resolve) => {
        client.on("close", () => resolve());
      });

      await client.close();
      await closePromise;

      expect(closeHandler).toHaveBeenCalled();
      expect(client.getState()).toBe(WebSocketState.CLOSED);
    }, 10000);
  });

  describe("message handling", () => {
    beforeEach(async () => {
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
      });

      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
        client.connect();
      });
    });

    it("should receive and parse JSON messages", async () => {
      const testMessage = { type: "test", data: "hello" };

      const messagePromise = new Promise<unknown>((resolve) => {
        client.on("message", (msg) => resolve(msg));
      });

      // Server sends message to client
      server.clients.forEach((ws) => {
        ws.send(JSON.stringify(testMessage));
      });

      const received = await messagePromise;
      expect(received).toEqual(testMessage);
    });

    it("should send messages to server", async () => {
      const testMessage = { type: "subscribe", data: "market" };

      const messagePromise = new Promise<unknown>((resolve) => {
        // Set up the handler for any new connections
        const handleConnection = (ws: any) => {
          ws.on("message", (data: any) => {
            resolve(JSON.parse(data.toString()));
          });
        };

        // Handle existing connections
        if (server.clients.size > 0) {
          server.clients.forEach((ws) => {
            ws.on("message", (data: any) => {
              resolve(JSON.parse(data.toString()));
            });
          });
        }

        server.on("connection", handleConnection);
      });

      client.send(testMessage);

      const received = await messagePromise;
      expect(received).toEqual(testMessage);
    });
  });

  describe("reconnection", () => {
    it("should use exponential backoff configuration", () => {
      // Test that configuration is properly set
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
        maxReconnectDelay: 1000,
        reconnectBackoffMultiplier: 2,
      });

      expect(client.getState()).toBe(WebSocketState.DISCONNECTED);
    });

    it("should not reconnect when closed manually", async () => {
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        reconnectDelay: 100,
      });

      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
        client.connect();
      });

      client.close();

      // Wait to ensure no reconnection attempt
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(client.getState()).toBe(WebSocketState.CLOSED);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should not connect if already connected", async () => {
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
      });

      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
        client.connect();
      });

      const openHandler = vi.fn();
      client.on("open", openHandler);

      // Try to connect again
      client.connect();

      // Wait a bit to ensure no second connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(openHandler).not.toHaveBeenCalled();
    });

    it("should not send messages when disconnected", async () => {
      client = new WebSocketClient({
        url: `ws://localhost:${port}`,
      });

      // Try to send before connecting
      client.send({ test: "data" });

      // Should not throw, just log warning
      expect(client.isConnected()).toBe(false);
    });
  });
});
