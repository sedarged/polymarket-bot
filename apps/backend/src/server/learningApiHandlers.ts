import http from "http";
import { logger } from "../utils/logger";
import { config } from "../config";
import {
  EventStore,
  SignalCatalog,
  BacktestEngine,
  BanditAllocator,
  MetricsGating,
  PromotionWorkflow,
} from "../learning";

/**
 * Learning System API Handlers
 *
 * Provides REST API endpoints for the learning system dashboard integration.
 * All endpoints require admin authentication (enforced by server middleware).
 *
 * Endpoints:
 * - GET /api/learning/experiments - List active experiments with metrics
 * - GET /api/learning/strategies - List strategies with performance data
 * - GET /api/learning/best - Get best performing strategy
 * - GET /api/learning/status - Get integration status
 *
 * Paper trading only - no live trading integration.
 */

// Singleton instances (initialized on demand)
let eventStore: EventStore | null = null;
let signalCatalog: SignalCatalog | null = null;
let backtestEngine: BacktestEngine | null = null;
let banditAllocator: BanditAllocator | null = null;
let metricsGating: MetricsGating | null = null;
let promotionWorkflow: PromotionWorkflow | null = null;

/**
 * Initialize learning system components (lazy initialization)
 * Initializes all components atomically to avoid partial initialization state
 */
function initializeLearningSystem(): void {
  // Check if already fully initialized
  if (
    eventStore &&
    signalCatalog &&
    backtestEngine &&
    banditAllocator &&
    metricsGating &&
    promotionWorkflow
  ) {
    return; // Already fully initialized
  }

  logger.info("Initializing learning system components");

  try {
    // Initialize into locals first to avoid partial state
    const localEventStore = new EventStore({
      path: process.env.EVENT_STORE_PATH || "./data/events.db",
      readonly: false,
      maxEvents: config.eventStoreMaxEvents,
    });

    const localSignalCatalog = new SignalCatalog({
      path: process.env.SIGNAL_CATALOG_PATH || "./data/signals.db",
      readonly: false,
    });

    const localBacktestEngine = new BacktestEngine({
      path: process.env.BACKTEST_ENGINE_PATH || "./data/backtests.db",
      eventStore: localEventStore,
      readonly: false,
      maxConcurrentBacktests: config.backtestMaxConcurrent,
      maxDateRangeDays: config.backtestMaxDateRangeDays,
    });

    const localBanditAllocator = new BanditAllocator({
      algorithm: "epsilon-greedy",
      totalCapital: 1000, // Paper trading capital
      explorationFactor: 0.1,
      minTradeCount: 10,
    });

    const localMetricsGating = new MetricsGating({
      thresholds: {
        minSharpe: 0.5,
        maxDrawdown: 0.2,
        minSampleSize: 100,
        minDays: 7,
        maxErrorRate: 0.05,
      },
    });

    const localPromotionWorkflow = new PromotionWorkflow({
      dbPath: process.env.PROMOTION_WORKFLOW_PATH || "./data/promotions.db",
      config: {
        criteria: {
          minPnl: 0,
          minSharpe: 0.5,
          maxDrawdown: 0.2,
          maxErrorRate: 0.05,
          minTradeCount: 100,
          minDays: 7,
          requireMultipleRegimes: false,
        },
        autoFlag: true,
        requireManualApproval: true,
      },
    });

    // Only assign to module-level singletons after all constructors succeed
    eventStore = localEventStore;
    signalCatalog = localSignalCatalog;
    backtestEngine = localBacktestEngine;
    banditAllocator = localBanditAllocator;
    metricsGating = localMetricsGating;
    promotionWorkflow = localPromotionWorkflow;

    logger.info("Learning system initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize learning system", { error });
    // Clear any partial state on failure
    eventStore = null;
    signalCatalog = null;
    backtestEngine = null;
    banditAllocator = null;
    metricsGating = null;
    promotionWorkflow = null;
    // Don't throw - allow API to return "not initialized" status
  }
}

/**
 * GET /api/learning/experiments
 * Returns list of active experiments with metrics
 */
export async function handleGetExperiments(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    initializeLearningSystem();

    if (!banditAllocator) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Learning system not initialized",
          experiments: [],
        }),
      );
      return;
    }

    // Get all bandit states
    const allStates = banditAllocator.getAllStates();

    // Calculate total pulls for allocation
    const totalPulls = allStates.reduce((sum, s) => sum + s.pulls, 0);

    // Format experiments data
    const experiments = allStates.map((state) => ({
      strategyId: state.strategyId,
      samples: state.pulls,
      totalReward: state.totalReward,
      meanReward: state.pulls > 0 ? state.totalReward / state.pulls : 0,
      allocation: totalPulls > 0 ? state.pulls / totalPulls : 0,
      status: state.pulls >= 10 ? "active" : "warming-up",
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        totalExperiments: experiments.length,
        experiments,
        lastUpdated: new Date().toISOString(),
      }),
    );

    logger.debug("Experiments data retrieved", { count: experiments.length });
  } catch (error) {
    logger.error("Failed to get experiments", { error });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get experiments",
      }),
    );
  }
}

/**
 * GET /api/learning/strategies
 * Returns list of strategies with performance metrics
 */
export async function handleGetStrategies(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    initializeLearningSystem();

    if (!promotionWorkflow) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Learning system not initialized",
          strategies: [],
        }),
      );
      return;
    }

    // Get all strategies from promotion workflow using listPromotions
    const allPromotions = promotionWorkflow.listPromotions();

    // Format strategy data
    const strategies = allPromotions.map((promotion) => {
      const metrics =
        typeof promotion.metrics === "string"
          ? JSON.parse(promotion.metrics)
          : promotion.metrics;

      return {
        strategyId: promotion.strategyId,
        status: promotion.status,
        samples: metrics.tradeCount || 0,
        pnl: metrics.pnl || 0,
        sharpeRatio: metrics.sharpe || 0,
        winRate: metrics.winRate || 0,
        maxDrawdown: metrics.maxDrawdown || 0,
        lastEvaluated: metrics.lastUpdated || new Date().toISOString(),
        promotionEligible: promotion.status === "under-review",
      };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        totalStrategies: strategies.length,
        strategies,
        lastUpdated: new Date().toISOString(),
      }),
    );

    logger.debug("Strategies data retrieved", { count: strategies.length });
  } catch (error) {
    logger.error("Failed to get strategies", { error });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get strategies",
      }),
    );
  }
}

/**
 * GET /api/learning/best
 * Returns the best performing strategy with recommendation
 */
export async function handleGetBestStrategy(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    initializeLearningSystem();

    if (!promotionWorkflow || !metricsGating) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Learning system not initialized",
          bestStrategy: null,
        }),
      );
      return;
    }

    // Get all strategies
    const allPromotions = promotionWorkflow.listPromotions();

    if (allPromotions.length === 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          bestStrategy: null,
          recommendation: "No strategies available",
          message: "No strategies evaluated yet",
          lastUpdated: new Date().toISOString(),
        }),
      );
      return;
    }

    // Find best strategy by Sharpe ratio
    const bestPromotion = allPromotions.reduce((best, current) => {
      const bestMetrics =
        typeof best.metrics === "string"
          ? JSON.parse(best.metrics)
          : best.metrics;
      const currentMetrics =
        typeof current.metrics === "string"
          ? JSON.parse(current.metrics)
          : current.metrics;
      const bestSharpe = bestMetrics.sharpe || -Infinity;
      const currentSharpe = currentMetrics.sharpe || -Infinity;
      return currentSharpe > bestSharpe ? current : best;
    });

    const metrics =
      typeof bestPromotion.metrics === "string"
        ? JSON.parse(bestPromotion.metrics)
        : bestPromotion.metrics;

    // Check if best strategy meets promotion criteria using metrics gating
    const performance = {
      strategyId: bestPromotion.strategyId,
      pnl: metrics.pnl || 0,
      sharpe: metrics.sharpe || 0,
      maxDrawdown: metrics.maxDrawdown || 0,
      winRate: metrics.winRate || 0,
      tradeCount: metrics.tradeCount || 0,
      errorRate: metrics.errorRate || 0,
      lastUpdated: metrics.lastUpdated || new Date().toISOString(),
    };

    const daysSinceStart = Math.floor(
      (Date.now() - new Date(bestPromotion.createdAt).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const gatingResult = metricsGating.check(performance, daysSinceStart);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        bestStrategy: {
          strategyId: bestPromotion.strategyId,
          status: bestPromotion.status,
          performance,
          promotionEligible: gatingResult.passed,
          promotionBlockers: gatingResult.failedChecks,
        },
        recommendation: gatingResult.passed
          ? "Strategy meets promotion criteria and can be considered for candidate status"
          : `Strategy does not meet promotion criteria: ${gatingResult.failedChecks.join(", ")}`,
        lastUpdated: new Date().toISOString(),
      }),
    );

    logger.debug("Best strategy retrieved", {
      strategyId: bestPromotion.strategyId,
    });
  } catch (error) {
    logger.error("Failed to get best strategy", { error });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get best strategy",
      }),
    );
  }
}

/**
 * GET /api/learning/status
 * Returns integration status of learning system components
 * Returns 503 if system is not healthy/initialized
 */
export async function handleGetLearningStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    initializeLearningSystem();

    const status = {
      eventStore: {
        initialized: eventStore !== null,
        status: eventStore ? "connected" : "not-connected",
        eventsCount: 0, // Would need to query event store for actual count
      },
      signalCatalog: {
        initialized: signalCatalog !== null,
        status: signalCatalog ? "connected" : "not-connected",
        signalsCount: signalCatalog
          ? signalCatalog.listSignalNames().length
          : 0,
      },
      backtestEngine: {
        initialized: backtestEngine !== null,
        status: backtestEngine ? "active" : "not-active",
      },
      banditAllocator: {
        initialized: banditAllocator !== null,
        status: banditAllocator ? "running" : "not-running",
        algorithm: banditAllocator
          ? banditAllocator.getConfig().algorithm
          : null,
      },
      metricsGating: {
        initialized: metricsGating !== null,
        status: metricsGating ? "active" : "not-active",
      },
      promotionWorkflow: {
        initialized: promotionWorkflow !== null,
        status: promotionWorkflow ? "active" : "not-active",
      },
      overall: {
        healthy:
          eventStore !== null &&
          banditAllocator !== null &&
          promotionWorkflow !== null,
        mode: "paper-trading-only",
      },
      lastUpdated: new Date().toISOString(),
    };

    // Return 503 if system is not healthy/initialized
    if (!status.overall.healthy) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ...status,
          error: "Learning system not fully initialized",
        }),
      );
      logger.warn("Learning system status check: system not healthy");
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));

    logger.debug("Learning system status retrieved");
  } catch (error) {
    logger.error("Failed to get learning system status", { error });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get learning system status",
      }),
    );
  }
}
