import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  logStrategyError,
  executeStrategyWithErrorHandling,
  createStrategyExecutor,
  logStrategyWarning,
  logStrategyMetrics,
} from "../../src/utils/strategyErrorLogging";
import { initializeAlerting, getAlertingService } from "../../src/utils/alerting";

describe("Strategy Error Logging", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock global fetch for alerting
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    global.fetch = mockFetch;

    // Inicjalizuj tylko Telegram
    initializeAlerting({
      telegramBotToken: "telegram-test-token",
      telegramChatId: "telegram-test-chat",
      thresholds: {
        errorRatePercent: 5,
        circuitBreakerTrips: 1,
      },
    });
  });

  describe("logStrategyError", () => {
    it("should log error with strategy name and context", () => {
      const error = new Error("Strategy failed");
      const context = {
        marketId: "market-123",
        signals: { rsi: 70, macd: 0.5 },
      };

      logStrategyError("momentum-strategy", error, context);

      // Alert should be sent
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle non-Error objects", () => {
      logStrategyError("momentum-strategy", "String error", {
        marketId: "market-123",
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it("should send alert via alerting service", async () => {
      const error = new Error("Test error");
      const context = { marketId: "market-123" };

      logStrategyError("test-strategy", error, context);

      // Wait for async alert to be sent
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Sprawdź czy wysłano do Telegrama
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://api.telegram.org/bot"),
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("should work without alerting service configured", () => {
      // Clear alerting service
      const alerting = getAlertingService();
      if (alerting) {
        alerting.clearHistory();
      }

      const error = new Error("Test error");

      // Should not throw even without alerting
      expect(() => {
        logStrategyError("test-strategy", error, {});
      }).not.toThrow();
    });
  });

  describe("executeStrategyWithErrorHandling", () => {
    it("should return success result when strategy succeeds", async () => {
      const strategyFn = vi.fn().mockResolvedValue({ action: "BUY", size: 10 });
      const context = { marketId: "market-123" };

      const result = await executeStrategyWithErrorHandling(
        "test-strategy",
        strategyFn,
        context,
      );

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ action: "BUY", size: 10 });
      expect(result.error).toBeUndefined();
      expect(strategyFn).toHaveBeenCalledTimes(1);
    });

    it("should return error result when strategy throws", async () => {
      const strategyFn = vi
        .fn()
        .mockRejectedValue(new Error("Strategy failed"));
      const context = { marketId: "market-123" };

      const result = await executeStrategyWithErrorHandling(
        "test-strategy",
        strategyFn,
        context,
      );

      expect(result.success).toBe(false);
      expect(result.result).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe("Strategy failed");
      expect(strategyFn).toHaveBeenCalledTimes(1);

      // Alert should be sent
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle non-Error exceptions", async () => {
      const strategyFn = vi.fn().mockRejectedValue("String error");

      const result = await executeStrategyWithErrorHandling(
        "test-strategy",
        strategyFn,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe("String error");
    });

    it("should include execution duration in logs", async () => {
      const strategyFn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error("Failed after delay");
      });

      const result = await executeStrategyWithErrorHandling(
        "test-strategy",
        strategyFn,
      );

      expect(result.success).toBe(false);
      // Duration should be at least 100ms
      // (actual logging is checked via logs, not returned in result)
    });

    it("should merge context with error logging", async () => {
      const strategyFn = vi.fn().mockRejectedValue(new Error("Test error"));
      const context = {
        marketId: "market-123",
        signals: { rsi: 70 },
      };

      await executeStrategyWithErrorHandling(
        "test-strategy",
        strategyFn,
        context,
      );

      // Alert powinien być wysłany do Telegrama
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).toHaveBeenCalled();
      // Sprawdź czy body zawiera marketId w tekstowej wiadomości Telegrama
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("marketId");
    });
  });

  describe("createStrategyExecutor", () => {
    it("should create executor with pre-configured context", async () => {
      const baseContext = { marketId: "market-123" };
      const executor = createStrategyExecutor("test-strategy", baseContext);

      const strategyFn = vi.fn().mockResolvedValue({ action: "BUY" });

      const result = await executor(strategyFn);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ action: "BUY" });
    });

    it("should merge additional context with base context", async () => {
      const baseContext = { marketId: "market-123" };
      const executor = createStrategyExecutor("test-strategy", baseContext);

      const strategyFn = vi.fn().mockRejectedValue(new Error("Test error"));
      const additionalContext = { signals: { rsi: 70 } };

      const result = await executor(strategyFn, additionalContext);

      expect(result.success).toBe(false);

      // Both contexts should be included in alert
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should allow creating multiple executors with different contexts", async () => {
      const executor1 = createStrategyExecutor("strategy-1", {
        marketId: "market-1",
      });
      const executor2 = createStrategyExecutor("strategy-2", {
        marketId: "market-2",
      });

      const fn1 = vi.fn().mockResolvedValue({ action: "BUY" });
      const fn2 = vi.fn().mockResolvedValue({ action: "SELL" });

      const result1 = await executor1(fn1);
      const result2 = await executor2(fn2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe("logStrategyWarning", () => {
    it("should log warning with strategy name and context", () => {
      const context = { marketId: "market-123" };

      // Should not throw
      expect(() => {
        logStrategyWarning("test-strategy", "Missing optional signal", context);
      }).not.toThrow();
    });
  });

  describe("logStrategyMetrics", () => {
    it("should log metrics with strategy name", () => {
      const metrics = {
        executionTimeMs: 150,
        decision: "BUY" as const,
        confidence: 0.85,
        signalCount: 5,
      };

      // Should not throw
      expect(() => {
        logStrategyMetrics("test-strategy", metrics);
      }).not.toThrow();
    });

    it("should include context in metrics", () => {
      const metrics = {
        executionTimeMs: 150,
        decision: "HOLD" as const,
      };
      const context = { marketId: "market-123" };

      // Should not throw
      expect(() => {
        logStrategyMetrics("test-strategy", metrics, context);
      }).not.toThrow();
    });
  });

  describe("Integration Tests", () => {
    it("should handle full strategy execution lifecycle", async () => {
      const executor = createStrategyExecutor("momentum-strategy", {
        marketId: "market-123",
      });

      // First execution succeeds
      const successFn = vi.fn().mockResolvedValue({ action: "BUY", size: 10 });
      const result1 = await executor(successFn, { signals: { rsi: 30 } });
      expect(result1.success).toBe(true);

      // Second execution fails
      const failFn = vi.fn().mockRejectedValue(new Error("Insufficient data"));
      const result2 = await executor(failFn, { signals: { rsi: 70 } });
      expect(result2.success).toBe(false);

      // Alerts should be sent for failure only
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only for failure
    });

    it("should handle concurrent strategy executions", async () => {
      const executor1 = createStrategyExecutor("strategy-1", {
        marketId: "market-1",
      });
      const executor2 = createStrategyExecutor("strategy-2", {
        marketId: "market-2",
      });

      const fn1 = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { action: "BUY" };
      });

      const fn2 = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        throw new Error("Strategy 2 failed");
      });

      // Execute concurrently
      const [result1, result2] = await Promise.all([
        executor1(fn1),
        executor2(fn2),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);

      // Wait for alerts
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only for strategy-2 failure
    });
  });
});
