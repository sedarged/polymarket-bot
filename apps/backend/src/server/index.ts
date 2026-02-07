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
import { getMetrics, getContentType } from '../utils/metrics';
import { RateLimiter } from '../utils/rateLimiter';
import type { Order } from '@polymarket/shared';
import { initializeAlerting } from '../utils/alerting';

// Singleton instances for paper trading
let paperEngine: PaperTradingEngine | null = null;
let riskManager: RiskManager | null = null;

// Rate limiter instance (Audit Finding A-008)
let rateLimiter: RateLimiter | null = null;

/**
 * Get the current rate limiter instance (for testing)
 */
export function getRateLimiter(): RateLimiter | null {
  return rateLimiter;
}

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

/**
 * Require admin authentication for an endpoint
 * Returns true if authenticated, false if not (and sends 401 response)
 */
const requireAdminAuth = (req: http.IncomingMessage, res: http.ServerResponse, endpointName: string): boolean => {
  if (!validateAdminToken(req)) {
    respondJson(res, 401, { error: 'Unauthorized: invalid or missing admin token' }, req);
    logger.warn(`${endpointName} endpoint access denied: invalid admin token`);
    return false;
  }
  return true;
};

/**
 * Extract client IP address from request
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) for accurate rate limiting
 * 
 * SECURITY: Only trusts proxy headers when RATE_LIMIT_TRUST_PROXY is enabled.
 * If proxy headers are trusted without a real proxy, clients can spoof IPs to bypass rate limiting.
 */
const getClientIp = (req: http.IncomingMessage): string => {
  // Only trust proxy headers if explicitly configured
  if (config.rateLimitTrustProxy) {
    // Check X-Forwarded-For header (proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      // X-Forwarded-For can be a comma-separated list: "client, proxy1, proxy2"
      // The first IP is the original client
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    // Check X-Real-IP header (nginx proxy)
    const realIp = req.headers['x-real-ip'];
    if (realIp && !Array.isArray(realIp)) {
      return realIp.trim();
    }
  }

  // Fall back to socket remote address (always used when proxy headers not trusted)
  return req.socket.remoteAddress || 'unknown';
};

/**
 * Parse JSON request body
 * Returns parsed JSON object or throws on invalid JSON
 * Limits body size to 1MB to prevent DoS attacks
 */
const parseRequestBody = (req: http.IncomingMessage): Promise<Record<string, any>> => {
  return new Promise((resolve, reject) => {
    let body = '';
    const maxBodySize = 1024 * 1024; // 1MB limit
    let settled = false;
    
    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    
    const onData = (chunk: Buffer | string) => {
      body += chunk.toString();
      
      // Prevent memory exhaustion from large requests
      if (body.length > maxBodySize) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('Request body too large (max 1MB)'));
        }
        req.destroy();
      }
    };
    
    const onEnd = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      
      // Handle empty body
      if (!body) {
        resolve({});
        return;
      }
      
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON in request body'));
      }
    };
    
    const onError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
};

export function createServer(): http.Server {
  // Initialize rate limiter if not already initialized (Audit Finding A-008)
  if (!rateLimiter) {
    rateLimiter = new RateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
    });
    logger.info('Rate limiter initialized', {
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
      audit: 'A-008',
    });
  }

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

    // Rate limiting check (Audit Finding A-008)
    // Applied to all endpoints to prevent DoS attacks and API abuse
    if (rateLimiter) {
      const clientIp = getClientIp(req);
      const limitCheck = rateLimiter.checkLimit(clientIp);

      if (!limitCheck.allowed) {
        const headers: Record<string, string | number> = {
          'Content-Type': 'application/json',
          'Retry-After': String(limitCheck.retryAfter || 60),
        };
        
        // Add CORS headers
        Object.assign(headers, getCorsHeaders(req));

        res.writeHead(429, headers);
        res.end(JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: limitCheck.retryAfter,
        }));
        return;
      }
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

    // Metrics endpoint for monitoring (Prometheus format)
    if (method === 'GET' && url === '/metrics') {
      try {
        const metricsOutput = await getMetrics();
        const headers: Record<string, string | number> = {
          'Content-Type': getContentType(),
          'Content-Length': Buffer.byteLength(metricsOutput),
        };
        
        // Add CORS headers
        Object.assign(headers, getCorsHeaders(req));
        
        res.writeHead(200, headers);
        res.end(metricsOutput);
        logger.debug('Prometheus metrics retrieved');
      } catch (error) {
        logger.error('Failed to get metrics', {
          error: error instanceof Error ? error.message : String(error),
        });
        respondJson(res, 500, { error: 'Failed to get metrics' }, req);
      }
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
    // Trading Endpoints - Audit Finding A-004
    // SECURED: All sensitive endpoints require admin authentication to prevent
    // unauthorized access to trading information, order management, and bot control.
    // Access requires valid ADMIN_TOKEN in Authorization header.
    // ============================================================================

    // Trading status - requires authentication (exposes wallet, trading mode)
    if (method === 'GET' && url === '/status') {
      if (!requireAdminAuth(req, res, 'Status')) return;

      // Get circuit breaker metrics if risk manager is initialized
      const circuitBreakerMetrics = riskManager ? {
        name: 'risk-manager',
        state: riskManager.getMetrics().circuitBreakerState,
        failures: riskManager.getMetrics().circuitBreakerMetrics.failures,
        successes: riskManager.getMetrics().circuitBreakerMetrics.successes,
        consecutiveFailures: riskManager.getMetrics().circuitBreakerMetrics.consecutiveFailures,
        consecutiveSuccesses: riskManager.getMetrics().circuitBreakerMetrics.consecutiveSuccesses,
      } : null;

      const status = {
        liveTrading: isLiveTradingEnabled(),
        tradingClientInitialized: tradingClient.isInitialized(),
        walletAddress: tradingClient.getAddress(),
        marketFeedConnected: marketFeedService.isConnected(),
        circuitBreakers: circuitBreakerMetrics ? [circuitBreakerMetrics] : [],
        timestamp: Date.now(),
      };
      respondJson(res, 200, status, req);
      logger.info('Trading status retrieved');
      return;
    }

    // Trading state (orders, positions, balances) - requires authentication
    if (method === 'GET' && url === '/state') {
      if (!requireAdminAuth(req, res, 'State')) return;

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

    // Get orders - requires authentication
    if (method === 'GET' && url === '/orders') {
      if (!requireAdminAuth(req, res, 'Orders')) return;

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

    // Batch order creation - requires authentication (PR-002)
    // Creates multiple orders in a single API call for improved efficiency
    // Limit: 15 orders per batch (Polymarket API constraint)
    if (method === 'POST' && url === '/orders') {
      if (!requireAdminAuth(req, res, 'Batch Orders')) return;

      try {
        const body = await parseRequestBody(req);
        
        // Validate request body
        if (!body || !Array.isArray(body.orders)) {
          respondJson(res, 400, {
            error: 'Invalid request: orders array required',
          }, req);
          return;
        }

        const { orders } = body;

        // Validate batch size
        if (orders.length === 0) {
          respondJson(res, 400, {
            error: 'Batch must contain at least one order',
          }, req);
          return;
        }

        if (orders.length > 15) {
          respondJson(res, 400, {
            error: 'Batch size exceeds maximum of 15 orders',
          }, req);
          return;
        }

        // Validate each order has required fields
        for (let i = 0; i < orders.length; i++) {
          const order = orders[i];
          if (!order.tokenId || !order.side || !order.price || !order.size) {
            respondJson(res, 400, {
              error: `Order at index ${i} missing required fields (tokenId, side, price, size)`,
            }, req);
            return;
          }
        }

        logger.info('Processing batch order creation', {
          batchSize: orders.length,
        });

        // Create batch orders
        const result = await tradingClient.createOrdersBatch(orders);

        respondJson(res, result.failed.length === 0 ? 201 : 207, {
          successful: result.successful,
          failed: result.failed,
          summary: {
            total: orders.length,
            successful: result.successful.length,
            failed: result.failed.length,
          },
        }, req);

        logger.info('Batch order creation completed', {
          total: orders.length,
          successful: result.successful.length,
          failed: result.failed.length,
        });
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to create batch orders',
        }, req);
      }
      return;
    }

    // Get fills - requires authentication
    if (method === 'GET' && url === '/fills') {
      if (!requireAdminAuth(req, res, 'Fills')) return;

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
      if (!requireAdminAuth(req, res, 'Legacy kill-switch')) return;

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
    // Enhanced to support selective cancellation (Issue #234, PR-006)
    if (method === 'POST' && (url === '/kill' || url.startsWith('/kill?'))) {
      if (!requireAdminAuth(req, res, 'Kill')) return;

      try {
        // Parse query parameters for selective cancellation
        const urlObj = new URL(url, `http://${req.headers.host}`);
        const tokenId = urlObj.searchParams.get('tokenId') || undefined;
        const assetId = urlObj.searchParams.get('assetId') || undefined;
        const scope = urlObj.searchParams.get('scope') || 'all'; // 'all', 'market', 'risk-only'

        // Validate scope parameter
        if (scope !== 'all' && scope !== 'market' && scope !== 'risk-only') {
          respondJson(res, 400, { 
            success: false,
            error: `Invalid scope parameter. Must be one of: 'all', 'market', 'risk-only'` 
          }, req);
          return;
        }

        let cancelledCount = 0;
        let message = '';

        if (scope === 'risk-only') {
          // Only trigger risk manager kill, don't cancel orders
          if (riskManager) {
            riskManager.kill();
            message = 'Risk manager killed, trading disabled';
          } else {
            message = 'No risk manager active';
          }
        } else if (scope === 'market') {
          // Validate that at least one identifier is provided for market-scoped cancellations
          if (!tokenId && !assetId) {
            respondJson(res, 400, {
              success: false,
              error: 'When scope is "market", either tokenId or assetId must be provided.',
            }, req);
            return;
          }

          // Cancel orders for specific market only
          if (isLiveTradingEnabled() && tradingClient.isInitialized()) {
            const beforeCount = tradingClient.getState().orders.filter(o => 
              o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
            ).length;
            
            await tradingClient.cancelMarketOrders(tokenId, assetId);
            
            const afterCount = tradingClient.getState().orders.filter(o => 
              o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
            ).length;
            
            cancelledCount = beforeCount - afterCount;
          }
          
          // Note: Paper engine doesn't support selective cancellation yet
          // It will cancel all orders regardless of market. This creates inconsistent
          // behavior between live and paper modes, but is documented here.
          let paperCancelledCount = 0;
          if (paperEngine) {
            const paperOrders = paperEngine.getOrders().filter((o: Order) => 
              o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
            );
            paperCancelledCount = paperOrders.length;
            paperEngine.cancelAllOrders();
          }
          
          const totalCancelled = cancelledCount + paperCancelledCount;
          message = `Cancelled ${totalCancelled} orders for market ${tokenId || assetId}${paperCancelledCount > 0 ? ` (note: paper engine cancelled all ${paperCancelledCount} orders due to lack of selective cancellation support)` : ''}`;
        } else {
          // Default: cancel all orders (original behavior)
          if (isLiveTradingEnabled() && tradingClient.isInitialized()) {
            const beforeCount = tradingClient.getState().orders.filter(o => 
              o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
            ).length;
            
            await tradingClient.cancelAllOrders();
            cancelledCount = beforeCount;
          }
          if (paperEngine) {
            paperEngine.cancelAllOrders();
          }
          if (riskManager) {
            riskManager.kill();
          }
          message = 'Kill switch activated: all orders cancelled, trading disabled';
        }

        respondJson(res, 200, { 
          success: true, 
          message,
          scope,
          tokenId,
          assetId,
          cancelledCount,
          riskManager: riskManager ? riskManager.getMetrics() : null,
        }, req);
        
        logger.error('Kill switch activated via /kill endpoint', {
          scope,
          tokenId,
          assetId,
          cancelledCount,
        });
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
  
  // Initialize alerting service if configured
  // This must be initialized before other services that may need to send alerts
  if (config.slackWebhookUrl || config.emailSmtpHost) {
    const emailConfig = config.emailSmtpHost && config.emailFromAddress && config.emailToAddresses.length > 0 ? {
      smtpHost: config.emailSmtpHost,
      smtpPort: config.emailSmtpPort,
      smtpSecure: config.emailSmtpSecure,
      smtpUser: config.emailSmtpUser || '',
      smtpPassword: config.emailSmtpPassword || '',
      fromAddress: config.emailFromAddress,
      toAddresses: config.emailToAddresses,
    } : undefined;
    
    initializeAlerting({
      slackWebhookUrl: config.slackWebhookUrl,
      emailConfig,
      thresholds: {
        errorRatePercent: config.alertErrorRateThreshold,
        circuitBreakerTrips: config.alertCircuitBreakerTrips,
      },
    });
    
    logger.info('Alerting service initialized', {
      hasSlack: !!config.slackWebhookUrl,
      hasEmail: !!emailConfig,
      thresholds: {
        errorRatePercent: config.alertErrorRateThreshold,
        circuitBreakerTrips: config.alertCircuitBreakerTrips,
      },
    });
  } else {
    logger.info('Alerting service not configured - alerts will only be logged');
  }
  
  // Start market feed service
  marketFeedService.start();
  
  // Initialize paper trading engine (paper mode only)
  if (!isLiveTradingEnabled()) {
    paperEngine = new PaperTradingEngine({
      slippage: config.paperTradingSlippage,
      maxSlippage: config.paperTradingMaxSlippage,
      feeRate: config.paperTradingFeeRate,
      partialFillRate: config.paperTradingPartialFillRate,
      minFillRatio: config.paperTradingMinFillRatio,
      maxFillRatio: config.paperTradingMaxFillRatio,
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
    circuitBreakerFailureThreshold: config.circuitBreakerFailureThreshold,
    circuitBreakerResetTimeoutMs: config.circuitBreakerResetTimeoutMs,
    circuitBreakerSuccessThreshold: config.circuitBreakerSuccessThreshold,
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
    tradingClient.initialize()
      .then(() => {
        // Start periodic reconciliation after successful initialization (Gap RE-001)
        if (tradingClient.isInitialized()) {
          tradingClient.startPeriodicReconciliation();
          logger.info('Periodic reconciliation started', {
            intervalSeconds: config.reconciliationIntervalSeconds,
            gap: 'RE-001',
          });
        }
      })
      .catch((error) => {
        logger.error('Failed to initialize trading client', {
          error: error instanceof Error ? error.message : String(error),
        });
        logger.warn('Server will continue without trading capabilities');
      });
  }
  
  server.listen(config.port, () => {
    logger.info('Server listening', { port: config.port });
  });

  // Graceful shutdown handler
  // Addresses Audit Finding A-017: properly await all cleanup operations
  const shutdown = async () => {
    logger.info('Shutting down server...');
    
    // Create shutdown timeout to prevent hanging (10 seconds)
    const shutdownTimeout = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 10000);
    
    try {
      // Stop rate limiter cleanup
      if (rateLimiter) {
        rateLimiter.stop();
      }
      
      // Await market feed service stop (A-017: proper WebSocket cleanup)
      await marketFeedService.stop();
      logger.info('Market feed service stopped');
      
      // Stop periodic reconciliation and clean up (Gap RE-001)
      if (isLiveTradingEnabled() && tradingClient.isInitialized()) {
        tradingClient.stopPeriodicReconciliation();
        
        // Cancel all orders BEFORE destroying the client
        try {
          await tradingClient.cancelAllOrders();
          logger.info('All orders cancelled');
        } catch (error) {
          logger.error('Failed to cancel orders during shutdown', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        
        // Now destroy the client after orders are cancelled
        try {
          tradingClient.destroy();
        } catch (error) {
          logger.error('Failed to destroy trading client during shutdown', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      // Close HTTP server
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('Server stopped');
          resolve();
        });
      });
      
      // Clear shutdown timeout and exit cleanly
      clearTimeout(shutdownTimeout);
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}
