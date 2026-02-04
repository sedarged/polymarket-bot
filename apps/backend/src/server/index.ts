import http from 'http';
import { getHealthStatus, getReadinessStatus } from './health';
import { logger } from '../utils/logger';
import { config } from '../config';
import { marketFeedService } from './marketFeedService';
import { calculateOrderbookSummary } from '../utils/orderbook';
import { tradingClient } from '../clients/tradingClient';
import { isLiveTradingEnabled } from '../utils/liveTrading';
import { PaperTradingEngine } from '../trading/paperTradingEngine';
import { RiskManager } from '../trading/riskManager';

// Singleton instances for paper trading
let paperEngine: PaperTradingEngine | null = null;
let riskManager: RiskManager | null = null;

/**
 * Get CORS headers for a request
 * Returns headers with appropriate Access-Control-Allow-Origin based on config
 */
const getCorsHeaders = (req: http.IncomingMessage): Record<string, string> => {
  const origin = req.headers.origin || '';
  const allowedOrigins = config.allowedOrigins;
  
  // Check if wildcard is configured (only allowed in dev)
  if (allowedOrigins.includes('*')) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }
  
  // If no origin header, allow request but don't set CORS origin
  // This handles same-origin requests and direct server calls
  if (!origin) {
    return {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }
  
  // Check if the request origin is in the allowed list
  const isAllowed = allowedOrigins.some(allowed => {
    // Normalize both URLs and compare their origins
    try {
      const originUrl = new URL(origin);
      const allowedUrl = new URL(allowed);
      return originUrl.origin === allowedUrl.origin;
    } catch {
      // If URL parsing fails, do exact string match
      return origin === allowed;
    }
  });
  
  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  
  // Origin not allowed - return restrictive headers (no CORS origin)
  return {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
};

const respondJson = (res: http.ServerResponse, statusCode: number, payload: unknown, req?: http.IncomingMessage): void => {
  const body = JSON.stringify(payload);
  const headers: Record<string, string | number> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  };
  
  // Add CORS headers if request is provided
  if (req) {
    Object.assign(headers, getCorsHeaders(req));
  }
  
  res.writeHead(statusCode, headers);
  res.end(body);
};

/**
 * Validate admin token from Authorization header
 */
const validateAdminToken = (req: http.IncomingMessage): boolean => {
  if (!config.adminToken || config.adminToken.trim() === '') {
    logger.error('ADMIN_TOKEN is not configured; admin endpoints are disabled');
    return false;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return false;
  }

  // Support both "Bearer <token>" and plain token
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;

  return token === config.adminToken;
};

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      const corsHeaders = getCorsHeaders(req);
      res.writeHead(200, corsHeaders);
      res.end();
      return;
    }

    if (method === 'GET' && url === '/health') {
      const health = getHealthStatus();
      respondJson(res, 200, health, req);
      logger.info('Health check', { path: '/health', status: health.status });
      return;
    }

    // Readiness probe endpoint
    if (method === 'GET' && url === '/ready') {
      const cbMetrics = marketFeedService.getCircuitBreakerMetrics();
      const circuitBreakerMetrics = cbMetrics ? [cbMetrics] : [];
      
      const readiness = getReadinessStatus(
        marketFeedService.isConnected(),
        tradingClient.isInitialized(),
        circuitBreakerMetrics
      );
      
      const statusCode = readiness.ready ? 200 : 503;
      respondJson(res, statusCode, readiness, req);
      logger.info('Readiness check', { path: '/ready', ready: readiness.ready });
      return;
    }

    // Metrics endpoint for monitoring
    if (method === 'GET' && url === '/metrics') {
      const cbMetrics = marketFeedService.getCircuitBreakerMetrics();
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        trading: {
          liveTrading: isLiveTradingEnabled(),
          initialized: tradingClient.isInitialized(),
        },
        marketFeed: {
          connected: marketFeedService.isConnected(),
          cachedOrderbooks: marketFeedService.getAllOrderbooks().size,
          tokenIds: config.tokenIds.length,
        },
        circuitBreakers: cbMetrics ? [cbMetrics] : [],
      };
      respondJson(res, 200, metrics, req);
      logger.info('Metrics retrieved');
      return;
    }

    // Get all cached orderbooks
    if (method === 'GET' && url === '/orderbooks') {
      const orderbooks = marketFeedService.getAllOrderbooks();
      const result = Array.from(orderbooks.entries()).map(([tokenId, orderbook]) => ({
        tokenId,
        market: orderbook.market,
        bids: orderbook.bids.length,
        asks: orderbook.asks.length,
        timestamp: orderbook.timestamp,
        summary: calculateOrderbookSummary(orderbook),
      }));
      respondJson(res, 200, result, req);
      logger.info('Orderbooks retrieved', { count: result.length });
      return;
    }

    // Get specific orderbook by token ID
    if (method === 'GET' && url.startsWith('/orderbook/')) {
      const tokenId = url.substring('/orderbook/'.length);
      const orderbook = marketFeedService.getOrderbook(tokenId);
      
      if (!orderbook) {
        respondJson(res, 404, { error: 'Orderbook not found', tokenId }, req);
        return;
      }

      const summary = calculateOrderbookSummary(orderbook);
      respondJson(res, 200, {
        tokenId,
        market: orderbook.market,
        bids: orderbook.bids,
        asks: orderbook.asks,
        timestamp: orderbook.timestamp,
        summary,
      }, req);
      logger.info('Orderbook retrieved', { tokenId });
      return;
    }

    // Market feed status
    if (method === 'GET' && url === '/feed/status') {
      const status = {
        connected: marketFeedService.isConnected(),
        tokenIds: config.tokenIds,
        cachedOrderbooks: marketFeedService.getAllOrderbooks().size,
      };
      respondJson(res, 200, status, req);
      logger.info('Market feed status retrieved');
      return;
    }

    // ============================================================================
    // Trading Endpoints
    // WARNING: These endpoints lack authentication and should be protected in
    // production deployments. Consider adding API key validation, session tokens,
    // or other authentication mechanisms before exposing to untrusted networks.
    // ============================================================================

    // Trading status
    if (method === 'GET' && url === '/status') {
      const status = {
        liveTrading: isLiveTradingEnabled(),
        tradingClientInitialized: tradingClient.isInitialized(),
        walletAddress: tradingClient.getAddress(),
        marketFeedConnected: marketFeedService.isConnected(),
        timestamp: Date.now(),
      };
      respondJson(res, 200, status, req);
      logger.info('Trading status retrieved');
      return;
    }

    // Trading state (orders, positions, balances)
    if (method === 'GET' && url === '/state') {
      try {
        const state = tradingClient.getState();
        respondJson(res, 200, state, req);
        logger.info('Trading state retrieved');
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to get state',
        }, req);
      }
      return;
    }

    // Get orders
    if (method === 'GET' && url === '/orders') {
      try {
        const state = tradingClient.getState();
        respondJson(res, 200, { orders: state.orders }, req);
        logger.info('Orders retrieved', { count: state.orders.length });
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to get orders',
        }, req);
      }
      return;
    }

    // Get fills
    if (method === 'GET' && url === '/fills') {
      try {
        const state = tradingClient.getState();
        respondJson(res, 200, { fills: state.fills }, req);
        logger.info('Fills retrieved', { count: state.fills.length });
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to get fills',
        }, req);
      }
      return;
    }

    // Kill switch - cancel all orders (legacy endpoint, requires auth)
    if (method === 'POST' && url === '/kill-switch') {
      // Validate admin token (same as /kill endpoint)
      if (!validateAdminToken(req)) {
        respondJson(res, 401, { error: 'Unauthorized: invalid or missing admin token' }, req);
        logger.warn('Legacy kill-switch endpoint access denied: invalid admin token');
        return;
      }

      try {
        // Cancel orders in both live and paper trading
        if (isLiveTradingEnabled() && tradingClient.isInitialized()) {
          await tradingClient.cancelAllOrders();
        }
        if (paperEngine) {
          paperEngine.cancelAllOrders();
        }
        if (riskManager) {
          riskManager.kill();
        }

        respondJson(res, 200, { success: true, message: 'Kill switch activated: all orders cancelled' }, req);
        logger.warn('Kill switch activated via API (legacy endpoint)');
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to activate kill switch',
        }, req);
      }
      return;
    }

    // Kill endpoint with admin token auth (as per requirements)
    if (method === 'POST' && url === '/kill') {
      // Validate admin token
      if (!validateAdminToken(req)) {
        respondJson(res, 401, { error: 'Unauthorized: invalid or missing admin token' }, req);
        logger.warn('Kill endpoint access denied: invalid admin token');
        return;
      }

      try {
        // Cancel orders in both live and paper trading
        if (isLiveTradingEnabled() && tradingClient.isInitialized()) {
          await tradingClient.cancelAllOrders();
        }
        if (paperEngine) {
          paperEngine.cancelAllOrders();
        }
        if (riskManager) {
          riskManager.kill();
        }

        respondJson(res, 200, { 
          success: true, 
          message: 'Kill switch activated: all orders cancelled, trading disabled',
          riskManager: riskManager ? riskManager.getMetrics() : null,
        }, req);
        logger.error('Kill switch activated via /kill endpoint');
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to activate kill switch',
        }, req);
      }
      return;
    }

    respondJson(res, 404, { error: 'Not Found' }, req);
  });
}

export async function startServer(): Promise<http.Server> {
  const server = createServer();
  
  // Start market feed service
  marketFeedService.start();
  
  // Initialize paper trading engine (paper mode only)
  if (!isLiveTradingEnabled()) {
    paperEngine = new PaperTradingEngine({
      slippage: config.paperTradingSlippage,
      maxSlippage: config.paperTradingMaxSlippage,
      feeRate: config.paperTradingFeeRate,
    });

    logger.info('Paper trading mode enabled');
  }

  // Initialize risk manager (applies to both paper and live trading)
  riskManager = new RiskManager({
    maxExposurePerMarket: config.riskMaxExposurePerMarket,
    maxOpenOrders: config.riskMaxOpenOrders,
    maxDrawdown: config.riskMaxDrawdown,
    errorRateThreshold: config.riskErrorRateThreshold,
    errorRateWindow: config.riskErrorRateWindow,
  });
  logger.info('Risk manager initialized');
  
  // Restore kill switch state from disk before enabling trading
  // CRITICAL: This must happen before any trading logic is enabled
  // This is awaited to ensure state is loaded before proceeding
  try {
    await riskManager.restoreState();
  } catch (error) {
    logger.error('Failed to restore kill switch state', {
      error: error instanceof Error ? error.message : String(error),
    });
    logger.warn('WARNING: Kill switch state restoration failed - kill switch state UNKNOWN (default is kill switch ACTIVE due to fail-closed behavior). Manually verify state before proceeding.');
  }
  
  // Initialize trading client if live trading is enabled
  if (isLiveTradingEnabled()) {
    tradingClient.initialize().catch((error) => {
      logger.error('Failed to initialize trading client', {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn('Server will continue without trading capabilities');
    });
  }
  
  server.listen(config.port, () => {
    logger.info('Server listening', { port: config.port });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down server...');
    marketFeedService.stop();
    
    // Cancel all orders before shutdown if trading is enabled
    if (isLiveTradingEnabled() && tradingClient.isInitialized()) {
      tradingClient.cancelAllOrders().catch((error) => {
        logger.error('Failed to cancel orders during shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
      }).finally(() => {
        server.close(() => {
          logger.info('Server stopped');
          process.exit(0);
        });
      });
    } else {
      server.close(() => {
        logger.info('Server stopped');
        process.exit(0);
      });
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}
