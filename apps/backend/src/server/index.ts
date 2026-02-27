import http from 'http';
import crypto from 'crypto';
import { getHealthStatus, getReadinessStatus } from './health';
import { logger } from '../utils/logger';
import { config } from '../config';
import { ConfigManager } from '../config/configManager';
import { marketFeedService } from './marketFeedService';
import { dataPipelineService } from './dataPipelineService';
import { calculateOrderbookSummary } from '../utils/orderbook';
import { tradingClient } from '../clients/tradingClient';
import { isLiveTradingEnabled } from '../utils/liveTrading';
import { PaperTradingEngine } from '../trading/paperTradingEngine';
import { RiskManager } from '../trading/riskManager';
import { getMetrics, getContentType } from '../utils/metrics';
import { RateLimiter } from '../utils/rateLimiter';
import type { Order, Orderbook } from '@polymarket/shared';
import { initializeAlerting } from '../utils/alerting';
import { MeanReversionStrategy } from '../trading/strategies/MeanReversionStrategy';
import { registerStrategies, StrategyFactory } from '../trading/strategies';
import type { MarketContext, IStrategy } from '../trading/strategies/types';
import { StrategyOrchestrator } from '../trading/strategies/StrategyOrchestrator';
import { LiquidityValidator } from '../trading/liquidityValidator';
import { BanditAllocator } from '../learning/banditAllocator';
import type { StrategyPerformance } from '../learning/types';
import {
  handleGetExperiments,
  handleGetStrategies,
  handleGetBestStrategy,
  handleGetLearningStatus,
} from './learningApiHandlers';
import {
  handleGetConfig,
  handleGetConfigFile,
  handleUpdateConfigFile,
  handleDeleteConfigFile,
  handleValidateConfig,
  handleReloadConfig,
  handleGetWatchingStatus,
  handleStartWatching,
  handleStopWatching,
} from './configApiHandlers';

// Singleton instances for paper trading
let paperEngine: PaperTradingEngine | null = null;
let riskManager: RiskManager | null = null;
let paperStrategy: IStrategy | null = null;
let paperStrategyType: string = 'mean-reversion';
let liquidityValidator: LiquidityValidator | null = null;
// GAP-013: StrategyOrchestrator manages all active strategies in parallel
let strategyOrchestrator: StrategyOrchestrator | null = null;
// GAP-044: BanditAllocator — ML-driven capital allocation across strategies
let banditAllocator: BanditAllocator | null = null;
// Per-strategy performance tracker for bandit allocation
const strategyPerfTracker = new Map<string, { tradeCount: number; pnl: number; wins: number; errors: number }>();
let allocationCache = new Map<string, number>(); // strategyId → capital fraction (0..1)
let allocationCounter = 0;
const REALLOCATION_INTERVAL = 50; // Re-run bandit allocator every 50 trades

// Rate limiter instance (Audit Finding A-008)
let rateLimiter: RateLimiter | null = null;

const configManager = ConfigManager.getInstance();

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
 * Extract token from Authorization header
 * Supports both "Bearer <token>" (case-insensitive) and raw token header values.
 */
const extractAdminTokenFromHeader = (
  authHeader: string | string[] | undefined,
): string | null => {
  if (!authHeader) {
    return null;
  }

  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const trimmedHeader = headerValue.trim();
  if (!trimmedHeader) {
    return null;
  }

  const bearerMatch = /^bearer\s+(.+)$/i.exec(trimmedHeader);
  const token = bearerMatch ? bearerMatch[1].trim() : trimmedHeader;
  return token || null;
};

/**
 * Validate admin token from Authorization header
 */
const validateAdminToken = (req: http.IncomingMessage): boolean => {
  // Read the latest config so ADMIN_TOKEN can be rotated without downtime (GAP-038).
  const runtimeConfig = configManager.getConfig();
  const adminToken = runtimeConfig.adminToken;
  const adminTokenNext = runtimeConfig.adminTokenNext;

  const hasAdminToken = !!adminToken && adminToken.trim() !== '';
  const hasAdminTokenNext = !!adminTokenNext && adminTokenNext.trim() !== '';

  if (!hasAdminToken && !hasAdminTokenNext) {
    logger.error('ADMIN_TOKEN is not configured; admin endpoints are disabled');
    return false;
  }

  const token = extractAdminTokenFromHeader(req.headers['authorization']);
  if (!token) {
    return false;
  }

  // Only compare against valid tokens to prevent empty string matches.
  const validTokens: string[] = [];
  if (hasAdminToken) validTokens.push(adminToken);
  if (hasAdminTokenNext) validTokens.push(adminTokenNext);

  // SECURITY FIX: constant-time comparison by hashing inputs to fixed-length buffers first.
  const tokenDigest = crypto.createHash('sha256').update(token, 'utf8').digest();

  // Use non-short-circuit evaluation to avoid leaking which token matched in dual-token rotation windows.
  let isValid = false;
  for (const candidate of validTokens) {
    const candidateDigest = crypto.createHash('sha256').update(candidate, 'utf8').digest();
    const matched = crypto.timingSafeEqual(candidateDigest, tokenDigest);
    isValid = isValid || matched;
  }

  return isValid;
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
      } catch {
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


/**
 * Normalizes shutdown handler arguments from process signals/events into numeric exit codes.
 * `process.on('SIGTERM', handler)` passes the signal string into the handler.
 */
export function normalizeShutdownExitCode(
  value: number | NodeJS.Signals | undefined,
  fallback: number,
): number {
  return typeof value === 'number' ? value : fallback;
}

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

    // Market feed reconnect — triggered by dashboard "Reconnect" button
    if (method === 'POST' && url === '/api/reconnect') {
      if (!requireAdminAuth(req, res, 'Reconnect')) return;
      try {
        logger.info('Manual market feed reconnect requested');
        await marketFeedService.stop();
        marketFeedService.start();
        respondJson(res, 200, { message: 'Market feed reconnection initiated', connected: marketFeedService.isConnected() }, req);
        logger.info('Market feed reconnect initiated');
      } catch (err) {
        logger.error('Market feed reconnect failed', { error: err instanceof Error ? err.message : String(err) });
        respondJson(res, 500, { error: err instanceof Error ? err.message : 'Reconnect failed' }, req);
      }
      return;
    }

    // Data pipeline status (GAP-021) - requires authentication
    if (method === 'GET' && url === '/api/ingestion/status') {
      if (!requireAdminAuth(req, res, 'Ingestion Status')) return;
      respondJson(res, 200, dataPipelineService.getStatus(), req);
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
        paperStrategyType: !isLiveTradingEnabled() ? paperStrategyType : null,
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

        // Perform risk checks for each order (GAP-019)
        if (riskManager) {
          // Get current state for risk checks
          const currentOrders = tradingClient.getState().orders;
          const currentPositions = tradingClient.getState().positions;
          
          for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            
            // Check order against risk limits including fee rate
            const riskCheck = riskManager.checkOrder(
              order.tokenId,
              order.side,
              order.size,
              currentOrders,
              currentPositions,
              order.feeRateBps // Fee rate from order request (optional)
            );
            
            if (!riskCheck.allowed) {
              logger.warn('Order rejected by risk manager', {
                orderIndex: i,
                tokenId: order.tokenId,
                reason: riskCheck.reason,
                category: 'ORDER_FLOW',
              });
              
              respondJson(res, 403, {
                error: 'Order rejected by risk manager',
                reason: riskCheck.reason,
                orderIndex: i,
              }, req);
              return;
            }
          }
        }

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

    // Learning System API endpoints (admin auth required)
    if (url === '/api/learning/experiments' && method === 'GET') {
      if (!requireAdminAuth(req, res, 'Learning Experiments')) return;
      await handleGetExperiments(req, res);
      return;
    }

    if (url === '/api/learning/strategies' && method === 'GET') {
      if (!requireAdminAuth(req, res, 'Learning Strategies')) return;
      await handleGetStrategies(req, res);
      return;
    }

    if (url === '/api/learning/best' && method === 'GET') {
      if (!requireAdminAuth(req, res, 'Learning Best Strategy')) return;
      await handleGetBestStrategy(req, res);
      return;
    }

    if (url === '/api/learning/status' && method === 'GET') {
      if (!requireAdminAuth(req, res, 'Learning Status')) return;
      await handleGetLearningStatus(req, res);
      return;
    }

    // Paper trading strategy picker endpoints (paper mode only, admin auth required)
    if (url === '/api/paper/strategy' && method === 'GET') {
      if (!requireAdminAuth(req, res, 'Paper Strategy')) return;
      respondJson(res, 200, {
        type: paperStrategyType,
        available: StrategyFactory.getRegisteredTypes(),
        isPaperMode: !isLiveTradingEnabled(),
      }, req);
      return;
    }

    if (url === '/api/paper/strategy' && method === 'POST') {
      if (!requireAdminAuth(req, res, 'Paper Strategy Switch')) return;
      if (isLiveTradingEnabled()) {
        respondJson(res, 400, { error: 'Strategy switching is only available in paper trading mode' }, req);
        return;
      }
      try {
        const body = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk; });
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        const { type } = JSON.parse(body) as { type: string };
        if (!type || typeof type !== 'string') {
          respondJson(res, 400, { error: 'Missing required field: type' }, req);
          return;
        }
        if (!StrategyFactory.isRegistered(type)) {
          respondJson(res, 400, {
            error: `Unknown strategy type: ${type}. Available: ${StrategyFactory.getRegisteredTypes().join(', ')}`,
          }, req);
          return;
        }
        // Create and initialise the new strategy using the factory's default config
        const strategyId = `paper-${type}-${Date.now()}`;
        const registration = StrategyFactory.getRegistration(type)!;
        const newStrategy = registration.factory();
        await newStrategy.initialize({
          ...(registration.defaultConfig as { strategyId: string; type: string; enabled: boolean; params: Record<string, unknown> }),
          strategyId,
          type,
          enabled: true,
        });

        // GAP-013: Remove old strategy from orchestrator and add the new one
        if (strategyOrchestrator && paperStrategy) {
          const oldConfig = paperStrategy.getConfig();
          await strategyOrchestrator.removeStrategy(oldConfig.strategyId);
        } else if (paperStrategy?.cleanup) {
          await paperStrategy.cleanup();
        }
        if (strategyOrchestrator) {
          await strategyOrchestrator.addStrategy(newStrategy);
        }

        paperStrategy = newStrategy;
        paperStrategyType = type;
        logger.info('Paper trading strategy switched', { type, strategyId });
        respondJson(res, 200, { type, strategyId, message: `Strategy switched to ${type}` }, req);
      } catch (err) {
        logger.error('Failed to switch paper strategy', { error: err instanceof Error ? err.message : String(err) });
        respondJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to switch strategy' }, req);
      }
      return;
    }

    // Configuration Management API endpoints (GAP-003, admin auth required)
    // Helper function to parse URL and extract pathname without query params
    const getPathname = (url: string): string => {
      const queryIndex = url.indexOf('?');
      return queryIndex === -1 ? url : url.substring(0, queryIndex);
    };
    
    // Helper to extract and validate config type from URL path
    // Returns null if path has extra segments (only allows optional trailing slash)
    const getConfigType = (pathname: string, prefix: string): string | null => {
      const remainder = pathname.substring(prefix.length);
      
      // Remove optional trailing slash
      const normalized = remainder.endsWith('/') ? remainder.slice(0, -1) : remainder;
      
      // If there's still a slash, there are extra path segments
      if (normalized.includes('/')) {
        return null;
      }
      
      return normalized || null;
    };
    
    const pathname = getPathname(url);
    
    if (pathname === '/api/config' && method === 'GET') {
      if (!requireAdminAuth(req, res, 'Get Configuration')) return;
      await handleGetConfig(req, res);
      return;
    }

    if (pathname.startsWith('/api/config/') && method === 'GET' && !pathname.includes('/watching')) {
      if (!requireAdminAuth(req, res, 'Get Config File')) return;
      const type = getConfigType(pathname, '/api/config/');
      if (!type) {
        respondJson(res, 400, { error: 'Invalid config path. Expected /api/config/:type' }, req);
        return;
      }
      await handleGetConfigFile(req, res, type);
      return;
    }

    if (pathname.startsWith('/api/config/') && method === 'PUT' && !pathname.includes('/watching')) {
      if (!requireAdminAuth(req, res, 'Update Config File')) return;
      const type = getConfigType(pathname, '/api/config/');
      if (!type) {
        respondJson(res, 400, { error: 'Invalid config path. Expected /api/config/:type' }, req);
        return;
      }
      await handleUpdateConfigFile(req, res, type);
      return;
    }

    if (pathname.startsWith('/api/config/') && method === 'DELETE' && !pathname.includes('/watching')) {
      if (!requireAdminAuth(req, res, 'Delete Config File')) return;
      const type = getConfigType(pathname, '/api/config/');
      if (!type) {
        respondJson(res, 400, { error: 'Invalid config path. Expected /api/config/:type' }, req);
        return;
      }
      await handleDeleteConfigFile(req, res, type);
      return;
    }

    if (pathname.startsWith('/api/config/validate/') && method === 'POST') {
      if (!requireAdminAuth(req, res, 'Validate Config')) return;
      const type = getConfigType(pathname, '/api/config/validate/');
      if (!type) {
        respondJson(res, 400, { error: 'Invalid config path. Expected /api/config/validate/:type' }, req);
        return;
      }
      await handleValidateConfig(req, res, type);
      return;
    }

    if (pathname === '/api/config/reload' && method === 'POST') {
      if (!requireAdminAuth(req, res, 'Reload Config')) return;
      await handleReloadConfig(req, res);
      return;
    }

    if (pathname === '/api/config/watching' && method === 'GET') {
      if (!requireAdminAuth(req, res, 'Get Watching Status')) return;
      await handleGetWatchingStatus(req, res);
      return;
    }

    if (pathname === '/api/config/watching/start' && method === 'POST') {
      if (!requireAdminAuth(req, res, 'Start Watching')) return;
      await handleStartWatching(req, res);
      return;
    }

    if (pathname === '/api/config/watching/stop' && method === 'POST') {
      if (!requireAdminAuth(req, res, 'Stop Watching')) return;
      await handleStopWatching(req, res);
      return;
    }

    respondJson(res, 404, { error: 'Not Found' }, req);
  });
}

// Used by shutdown to clear periodic timers (Research §9.7, §10.1)
let banStatusInterval: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let metricsUpdateInterval: NodeJS.Timeout | null = null;

export async function startServer(): Promise<http.Server> {
  const server = createServer();
  
  // Initialize alerting service if configured
  // This must be initialized before other services that may need to send alerts
  if (config.telegramBotToken && config.telegramChatId) {
    initializeAlerting({
      telegramBotToken: config.telegramBotToken,
      telegramChatId: config.telegramChatId,
      thresholds: {
        errorRatePercent: config.alertErrorRateThreshold,
        circuitBreakerTrips: config.alertCircuitBreakerTrips,
      },
    });
  } else {
    logger.info('Alerting service not configured - alerts will only be logged');
  }
  
  // Heartbeat to external monitor (Research §9.7, §10.6): GET every 1 min; if missed 5 min, external alert
  if (config.heartbeatUrl) {
    const HEARTBEAT_MS = 60_000;
    heartbeatInterval = setInterval(() => {
      fetch(config.heartbeatUrl!, { method: 'GET', signal: AbortSignal.timeout(10_000) })
        .then(() => logger.debug('Heartbeat ping OK'))
        .catch((err) => logger.warn('Heartbeat ping failed', { error: err instanceof Error ? err.message : String(err) }));
    }, HEARTBEAT_MS);
    heartbeatInterval.unref();
    logger.info('Heartbeat started', { intervalMs: HEARTBEAT_MS, research: '§9.7' });
  }

  // Start data pipeline (GAP-021) before market feed so we don't miss early snapshots.
  dataPipelineService.start();

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
    
    // A-027: Start periodic unrealized PnL metric updates for paper trading
    // Update every 60 seconds with current market prices
    const METRICS_UPDATE_INTERVAL_MS = 60_000; // 1 minute
    metricsUpdateInterval = setInterval(() => {
      if (paperEngine) {
        const orderbooks = marketFeedService.getAllOrderbooks();
        if (orderbooks.size > 0) {
          paperEngine.updatePnlMetrics(orderbooks);
        }
      }
    }, METRICS_UPDATE_INTERVAL_MS);
    metricsUpdateInterval.unref(); // Don't prevent process exit
    logger.info('Paper trading metrics update scheduled', {
      intervalMs: METRICS_UPDATE_INTERVAL_MS,
      audit: 'A-027',
    });
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
    maxFeeRateBps: config.riskMaxFeeRateBps,
    markets: config.markets, // GAP-001: Pass per-market config
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
  
  // ============================================================================
  // Paper Trading Loop
  // Connects real Polymarket market data to the paper trading engine.
  //
  // Flow on every orderbook update:
  //   marketFeedService (WebSocket) → strategy.evaluate() → paperEngine.createOrder()
  //                                                        → paperEngine.tryFillOrder()
  //
  // Also retries filling any existing open orders against the new orderbook.
  // ============================================================================
  if (!isLiveTradingEnabled() && paperEngine) {
    // Register all built-in strategies so the factory knows about them
    registerStrategies();

    // Initialize pre-trade liquidity validator (GAP-014 for paper trading path)
    liquidityValidator = new LiquidityValidator();
    logger.info('Liquidity validator initialized for paper trading');

    // GAP-013: Initialize StrategyOrchestrator for multi-strategy support
    strategyOrchestrator = new StrategyOrchestrator({
      maxStrategies: 10,
      enableConflictDetection: true,
      conflictResolution: 'highest-confidence',
    });

    // GAP-044: Initialize BanditAllocator for ML-driven capital allocation
    banditAllocator = new BanditAllocator({
      algorithm: config.banditAlgorithm,
      totalCapital: 1000,
      explorationFactor: config.banditExplorationFactor,
      minTradeCount: config.banditMinTradeCount,
    });

    // Initialize the default strategy used for automated paper trading.
    paperStrategyType = 'mean-reversion';
    paperStrategy = new MeanReversionStrategy();
    await paperStrategy.initialize({
      strategyId: 'paper-mean-reversion',
      type: 'mean-reversion',
      enabled: true,
      params: {
        lookbackPeriod: 20,
        minSpread: 0.01,
        maxPositionSize: 50,
        entryThreshold: 2.0,
        exitThreshold: 0.5,
        cooldownPeriod: 60000,
      },
    });
    // Add default strategy to the orchestrator (GAP-013)
    await strategyOrchestrator.addStrategy(paperStrategy);
    logger.info('Paper trading strategy initialised and added to orchestrator', { strategy: paperStrategy.name });

    // Helper: convert a real Polymarket orderbook to the MarketContext shape strategies expect
    const buildContext = (tokenId: string, ob: Orderbook): MarketContext => {
      const bestBid = parseFloat(ob.bids[0]?.price ?? '0');
      const bestAsk = parseFloat(ob.asks[0]?.price ?? '1');
      return {
        marketId: ob.market,
        tokenId,
        bestBid,
        bestAsk,
        mid: (bestBid + bestAsk) / 2,
        spread: bestAsk - bestBid,
        liquidity: {
          bidSize: parseFloat(ob.bids[0]?.size ?? '0'),
          askSize: parseFloat(ob.asks[0]?.size ?? '0'),
        },
        timestamp: new Date().toISOString(),
        orderBook: {
          bids: ob.bids.map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
          asks: ob.asks.map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
        },
      };
    };

    // Helper: build a positions map keyed by tokenId for the orchestrator
    const buildPositionsMap = () => {
      const positionsMap = new Map<string, { tokenId: string; size: number; avgPrice: number; unrealizedPnl: number; realizedPnl: number }>();
      for (const pos of paperEngine!.getPositions()) {
        positionsMap.set(pos.tokenId, {
          tokenId: pos.tokenId,
          size: parseFloat(pos.size),
          avgPrice: parseFloat(pos.averagePrice),
          unrealizedPnl: parseFloat(pos.unrealizedPnl ?? '0'),
          realizedPnl: 0,
        });
      }
      return positionsMap;
    };

    // Helper: refresh bandit allocation if enough trades have accumulated (GAP-044)
    const maybeReallocate = () => {
      if (!banditAllocator || strategyPerfTracker.size === 0) return;
      if (++allocationCounter % REALLOCATION_INTERVAL !== 0) return;

      const performances: StrategyPerformance[] = Array.from(strategyPerfTracker.entries()).map(
        ([strategyId, perf]) => ({
          strategyId,
          pnl: perf.pnl,
          sharpe: perf.pnl > 0 ? Math.min(perf.pnl / 10, 2.0) : Math.max(perf.pnl / 10, -2.0),
          maxDrawdown: 0.1, // simplified — full drawdown tracking would require price history
          winRate: perf.tradeCount > 0 ? perf.wins / perf.tradeCount : 0,
          errorRate: perf.tradeCount > 0 ? perf.errors / perf.tradeCount : 0,
          tradeCount: perf.tradeCount,
          lastUpdated: new Date().toISOString(),
        }),
      );

      const allocations = banditAllocator.allocate(performances);
      allocationCache = new Map(allocations.map(a => [a.strategyId, a.allocation]));
      logger.debug('Bandit allocation updated', {
        allocations: allocations.map(a => ({ strategyId: a.strategyId, fraction: a.allocation, capital: a.capitalAmount })),
      });
    };

    // Main handler: called on every real-time orderbook update from Polymarket
    const onOrderbookUpdate = async (tokenId: string, ob: Orderbook): Promise<void> => {
      if (!paperEngine || !riskManager) return;
      if (riskManager.isKilled()) return;

      // 1. Try to fill any existing open orders against the updated orderbook
      const openOrders = paperEngine.getOrders().filter(
        o => (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED') && o.tokenId === tokenId,
      );
      for (const o of openOrders) {
        paperEngine.tryFillOrder(o.orderId, ob);
      }

      // 2. Ask strategies whether to trade — use StrategyOrchestrator (GAP-013)
      const context = buildContext(tokenId, ob);
      let winningStrategyId: string | undefined;
      let decision;

      if (strategyOrchestrator && strategyOrchestrator.getStrategyCount() > 0) {
        // GAP-013: Parallel evaluation across all registered strategies
        let evalResults;
        try {
          evalResults = await strategyOrchestrator.evaluateAll(context, buildPositionsMap());
        } catch (err) {
          logger.warn('Orchestrator evaluation error', {
            tokenId,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        // Pick the highest-confidence non-hold result
        const actionable = evalResults
          .filter(r => !r.error && r.decision.action !== 'hold' && r.decision.action !== 'cancel')
          .sort((a, b) => (b.decision.confidence ?? 0) - (a.decision.confidence ?? 0));
        if (actionable.length === 0) return;
        decision = actionable[0].decision;
        winningStrategyId = actionable[0].strategyId;
      } else if (paperStrategy) {
        // Fallback: single strategy (backward-compat path)
        const position = paperEngine.getPositions().find(p => p.tokenId === tokenId);
        const stratPosition = position
          ? { tokenId: position.tokenId, size: parseFloat(position.size), avgPrice: parseFloat(position.averagePrice), unrealizedPnl: parseFloat(position.unrealizedPnl ?? '0'), realizedPnl: 0 }
          : undefined;
        try {
          decision = await paperStrategy.evaluate(context, stratPosition);
        } catch (err) {
          logger.warn('Strategy evaluation error', { tokenId, error: err instanceof Error ? err.message : String(err) });
          return;
        }
        winningStrategyId = paperStrategyType;
      } else {
        return;
      }

      if (decision.action === 'hold' || decision.action === 'cancel') return;
      if (!decision.price || !decision.size || !decision.side) return;

      // GAP-044: Scale order size by BanditAllocator's capital fraction for this strategy
      let orderSize = decision.size;
      if (winningStrategyId && allocationCache.has(winningStrategyId)) {
        const fraction = allocationCache.get(winningStrategyId)!;
        orderSize = decision.size * fraction;
        if (orderSize < 0.01) {
          logger.debug('Order skipped: bandit allocation too small', { winningStrategyId, fraction });
          return;
        }
      }

      // 3. Risk check before placing
      const currentOrders = paperEngine.getOrders();
      const currentPositions = paperEngine.getPositions();
      const riskCheck = riskManager.checkOrder(
        tokenId,
        decision.side,
        String(orderSize),
        currentOrders,
        currentPositions,
      );
      if (!riskCheck.allowed) {
        logger.debug('Paper order blocked by risk manager', { tokenId, reason: riskCheck.reason });
        // Record error for this strategy in the performance tracker (GAP-044)
        if (winningStrategyId) {
          const perf = strategyPerfTracker.get(winningStrategyId) ?? { tradeCount: 0, pnl: 0, wins: 0, errors: 0 };
          perf.errors++;
          strategyPerfTracker.set(winningStrategyId, perf);
        }
        return;
      }

      // 4. Pre-trade liquidity validation (GAP-014 — paper trading path)
      if (liquidityValidator) {
        const liquidityCheck = liquidityValidator.checkLiquidity(
          tokenId,
          decision.side,
          String(orderSize),
          ob,
          ob.timestamp,
        );
        if (!liquidityCheck.allowed) {
          logger.debug('Paper order blocked by liquidity validator', {
            tokenId,
            reason: liquidityCheck.reason,
            available: liquidityCheck.availableLiquidity,
            required: liquidityCheck.requiredLiquidity,
          });
          return;
        }
      }

      // 5. Place the paper order and immediately attempt a fill against real prices
      try {
        const order = paperEngine.createOrder(
          tokenId,
          decision.side,
          String(decision.price),
          String(orderSize),
        );
        const filled = paperEngine.tryFillOrder(order.orderId, ob);

        // GAP-044: Record trade outcome in the performance tracker
        if (winningStrategyId) {
          const perf = strategyPerfTracker.get(winningStrategyId) ?? { tradeCount: 0, pnl: 0, wins: 0, errors: 0 };
          perf.tradeCount++;
          if (filled) {
            perf.wins++;
            // Approximate PnL contribution (positive for buys below mid, sells above mid)
            const mid = (parseFloat(ob.bids[0]?.price ?? '0') + parseFloat(ob.asks[0]?.price ?? '1')) / 2;
            const pnlContrib = decision.side === 'BUY'
              ? (mid - decision.price) * orderSize
              : (decision.price - mid) * orderSize;
            perf.pnl += pnlContrib;
          }
          strategyPerfTracker.set(winningStrategyId, perf);
        }

        // Periodically re-run bandit allocator (GAP-044)
        maybeReallocate();
      } catch (err) {
        logger.warn('Paper order creation failed', {
          tokenId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Wire the real-time events — both initial snapshots and incremental updates
    marketFeedService.on('snapshot', (tokenId: string, ob: Orderbook) => {
      onOrderbookUpdate(tokenId, ob).catch((err: unknown) => {
        logger.error('Paper trading loop error on snapshot', {
          tokenId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    marketFeedService.on('update', (tokenId: string, ob: Orderbook) => {
      onOrderbookUpdate(tokenId, ob).catch((err: unknown) => {
        logger.error('Paper trading loop error on update', {
          tokenId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    logger.info('Paper trading loop wired to market feed');
  }

  // Initialize trading client if live trading is enabled
  if (isLiveTradingEnabled()) {
    tradingClient.initialize()
      .then(() => {
        if (!tradingClient.isInitialized()) return;

        // MIN_BALANCE check at startup (Research §9.1)
        if (config.minBalanceUsdc > 0) {
          const balance = tradingClient.getUsdcBalance();
          if (balance !== null && balance < config.minBalanceUsdc) {
            logger.error('Startup aborted: USDC balance below MIN_BALANCE_USDC', {
              balance,
              minBalanceUsdc: config.minBalanceUsdc,
              research: '§9.1',
            });
            // Invoke graceful shutdown before exit so servers/connections close cleanly
            shutdown(1);
            return;
          }
        }

        // Start periodic reconciliation after successful initialization (Gap RE-001)
        tradingClient.startPeriodicReconciliation();
        logger.info('Periodic reconciliation started', {
          intervalSeconds: config.reconciliationIntervalSeconds,
          gap: 'RE-001',
        });

        // Periodic ban-status check (Research §10.1, §9.2)
        if (config.banStatusCheckIntervalMs > 0) {
          banStatusInterval = setInterval(() => {
            tradingClient.runBanStatusCheck().catch((err) => {
              logger.warn('Ban-status check interval error', {
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }, config.banStatusCheckIntervalMs);
          banStatusInterval.unref();
          logger.info('Ban-status periodic check scheduled', {
            intervalMs: config.banStatusCheckIntervalMs,
            research: '§10.1',
          });
        }
      })
      .catch((error) => {
        if (error instanceof Error && error.message.includes('Startup aborted')) {
          logger.error('Startup aborted (ban-status cert_required)', {
            message: error.message,
          });
          shutdown(1);
          return;
        }
        
        logger.error('Failed to initialize trading client', {
          error: error instanceof Error ? error.message : String(error),
          audit: 'A-012',
        });
        
        // A-012: Fail startup when trading client init fails with live trading enabled
        // This prevents the server from running in a degraded state without clear indication
        // Since we're inside isLiveTradingEnabled() block, always fail in this context
        logger.error('CRITICAL: Trading client initialization failed with live trading enabled', {
          nodeEnv: process.env.NODE_ENV,
          liveTradingEnabled: true,
          audit: 'A-012',
        });
        logger.error('Server cannot start without trading capabilities when live trading is enabled');
        shutdown(1);
        return;
      });
  }
  
  server.listen(config.port, () => {
    logger.info('Server listening', { port: config.port });
  });

  // Dedicated metrics server on METRICS_PORT when different from PORT (Research §7 Day 6, §9.1)
  let metricsServer: http.Server | null = null;
  if (config.metricsPort !== config.port) {
    metricsServer = http.createServer(async (req, res) => {
      const method = req.method ?? 'GET';
      const url = req.url ?? '/';
      if (method === 'GET' && (url === '/metrics' || url === '/')) {
        try {
          const metricsOutput = await getMetrics();
          res.writeHead(200, {
            'Content-Type': getContentType(),
            'Content-Length': Buffer.byteLength(metricsOutput),
          });
          res.end(metricsOutput);
        } catch (error) {
          logger.error('Failed to get metrics (metrics server)', {
            error: error instanceof Error ? error.message : String(error),
          });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to get metrics' }));
        }
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });
    metricsServerForTesting = metricsServer;
    metricsServer.on('error', (err) => {
      logger.error('Metrics server bind error (degrading to single-port metrics)', {
        error: err instanceof Error ? err.message : String(err),
        port: config.metricsPort,
      });
      metricsServer = null;
    });
    metricsServer.listen(config.metricsPort, () => {
      logger.info('Metrics server listening', { port: config.metricsPort, research: '§7 Day 6' });
    });
  }

  // Graceful shutdown handler
  // Addresses Audit Finding A-017: properly await all cleanup operations
  const shutdown = async (exitCodeOrSignal?: number | NodeJS.Signals) => {
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
      
      // A-017: Await market feed service stop for proper WebSocket cleanup
      // This ensures WebSocket connections are fully closed before server shutdown
      // marketFeedService.stop() awaits client.close() which properly cleans up timers (A-016)
      await dataPipelineService.stop();
      await marketFeedService.stop();
      logger.info('Market feed service stopped', { audit: 'A-017' });
      
      // Stop periodic ban-status check (Research §10.1)
      if (banStatusInterval) {
        clearInterval(banStatusInterval);
        banStatusInterval = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      // Stop metrics update interval (A-027)
      if (metricsUpdateInterval) {
        clearInterval(metricsUpdateInterval);
        metricsUpdateInterval = null;
      }

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
      
      // Close metrics server first (if running)
      if (metricsServer) {
        await new Promise<void>((resolve) => {
          metricsServer!.close(() => {
            logger.info('Metrics server stopped');
            resolve();
          });
        });
        metricsServer = null;
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
      process.exit(normalizeShutdownExitCode(exitCodeOrSignal, 0));
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      clearTimeout(shutdownTimeout);
      process.exit(normalizeShutdownExitCode(exitCodeOrSignal, 1));
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}

/** Exposed for tests only: when METRICS_PORT !== PORT, returns the dedicated metrics server so tests can close it. */
let metricsServerForTesting: http.Server | null = null;
export function getMetricsServerForTesting(): http.Server | null {
  return metricsServerForTesting;
}
