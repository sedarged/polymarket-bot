import { config, Config } from '../config';
import { isLiveTradingEnabled } from '../utils/liveTrading';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  liveTradingEnabled: boolean;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'degraded' | 'unhealthy';
      message?: string;
      details?: Record<string, unknown>;
    };
  };
}

export interface ReadinessStatus {
  ready: boolean;
  timestamp: string;
  checks: {
    [key: string]: {
      ready: boolean;
      message?: string;
    };
  };
}

const startTime = Date.now();

/**
 * Get system health status (liveness check).
 * 
 * Liveness indicates if the application is running and not deadlocked.
 * Unlike readiness, liveness doesn't check external dependencies.
 */
export function getHealthStatus(currentConfig: Config = config): HealthStatus {
  const uptime = Date.now() - startTime;
  const memoryUsage = process.memoryUsage();
  const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const memoryUtilization = memoryUsedMB / memoryTotalMB;

  const checks: HealthStatus['checks'] = {
    memory: {
      status: memoryUtilization > 0.9 ? 'unhealthy' : memoryUtilization > 0.8 ? 'degraded' : 'ok',
      message: `${memoryUsedMB}MB / ${memoryTotalMB}MB used`,
      details: {
        heapUsed: memoryUsedMB,
        heapTotal: memoryTotalMB,
        utilization: Math.round(memoryUtilization * 100),
      },
    },
    uptime: {
      status: 'ok',
      message: `${Math.round(uptime / 1000)}s`,
      details: {
        uptimeMs: uptime,
        startTime: new Date(startTime).toISOString(),
      },
    },
  };

  // Determine overall status
  const hasUnhealthy = Object.values(checks).some((c) => c.status === 'unhealthy');
  const hasDegraded = Object.values(checks).some((c) => c.status === 'degraded');
  const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'ok';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    liveTradingEnabled: isLiveTradingEnabled(currentConfig),
    uptime,
    checks,
  };
}

/**
 * Get system readiness status (readiness check).
 * 
 * Readiness indicates if the application is ready to accept traffic.
 * This includes checks for external dependencies and critical services.
 * 
 * @param marketFeedConnected - Whether the market feed WebSocket is connected
 * @param tradingClientReady - Whether the trading client is initialized and ready
 * @param circuitBreakerMetrics - Optional circuit breaker metrics for external services
 */
export function getReadinessStatus(
  marketFeedConnected: boolean,
  tradingClientReady: boolean,
  circuitBreakerMetrics?: Array<{
    name: string;
    state: string;
    failures: number;
  }>
): ReadinessStatus {
  const checks: ReadinessStatus['checks'] = {
    marketFeed: {
      ready: marketFeedConnected,
      message: marketFeedConnected
        ? 'Market feed WebSocket connected'
        : 'Market feed WebSocket disconnected',
    },
    tradingClient: {
      ready: tradingClientReady,
      message: tradingClientReady
        ? 'Trading client initialized'
        : 'Trading client not initialized',
    },
  };

  // Add circuit breaker checks if provided
  if (circuitBreakerMetrics) {
    for (const metric of circuitBreakerMetrics) {
      checks[`circuitBreaker_${metric.name}`] = {
        ready: metric.state !== 'open',
        message:
          metric.state === 'open'
            ? `Circuit breaker open (${metric.failures} failures)`
            : `Circuit breaker ${metric.state}`,
      };
    }
  }

  // Overall readiness requires all checks to pass
  const ready = Object.values(checks).every((c) => c.ready);

  return {
    ready,
    timestamp: new Date().toISOString(),
    checks,
  };
}
