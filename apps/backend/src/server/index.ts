import http from 'http';
import { getHealthStatus } from './health';
import { logger } from '../utils/logger';
import { config } from '../config';
import { marketFeedService } from './marketFeedService';
import { calculateOrderbookSummary } from '../utils/orderbook';
import { tradingClient } from '../clients/tradingClient';
import { isLiveTradingEnabled } from '../utils/liveTrading';

const respondJson = (res: http.ServerResponse, statusCode: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
};

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (method === 'GET' && url === '/health') {
      const health = getHealthStatus();
      respondJson(res, 200, health);
      logger.info('Health check', { path: '/health' });
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
      respondJson(res, 200, result);
      logger.info('Orderbooks retrieved', { count: result.length });
      return;
    }

    // Get specific orderbook by token ID
    if (method === 'GET' && url.startsWith('/orderbook/')) {
      const tokenId = url.substring('/orderbook/'.length);
      const orderbook = marketFeedService.getOrderbook(tokenId);
      
      if (!orderbook) {
        respondJson(res, 404, { error: 'Orderbook not found', tokenId });
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
      });
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
      respondJson(res, 200, status);
      logger.info('Market feed status retrieved');
      return;
    }

    // Trading status
    if (method === 'GET' && url === '/status') {
      const status = {
        liveTrading: isLiveTradingEnabled(),
        tradingClientInitialized: tradingClient.isInitialized(),
        walletAddress: tradingClient.getAddress(),
        marketFeedConnected: marketFeedService.isConnected(),
        timestamp: Date.now(),
      };
      respondJson(res, 200, status);
      logger.info('Trading status retrieved');
      return;
    }

    // Trading state (orders, positions, balances)
    if (method === 'GET' && url === '/state') {
      try {
        const state = tradingClient.getState();
        respondJson(res, 200, state);
        logger.info('Trading state retrieved');
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to get state',
        });
      }
      return;
    }

    // Get orders
    if (method === 'GET' && url === '/orders') {
      try {
        const state = tradingClient.getState();
        respondJson(res, 200, { orders: state.orders });
        logger.info('Orders retrieved', { count: state.orders.length });
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to get orders',
        });
      }
      return;
    }

    // Get fills
    if (method === 'GET' && url === '/fills') {
      try {
        const state = tradingClient.getState();
        respondJson(res, 200, { fills: state.fills });
        logger.info('Fills retrieved', { count: state.fills.length });
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to get fills',
        });
      }
      return;
    }

    // Kill switch - cancel all orders
    if (method === 'POST' && url === '/kill-switch') {
      try {
        await tradingClient.cancelAllOrders();
        respondJson(res, 200, { success: true, message: 'All orders cancelled' });
        logger.warn('Kill switch activated via API');
      } catch (error) {
        respondJson(res, 500, {
          error: error instanceof Error ? error.message : 'Failed to cancel orders',
        });
      }
      return;
    }

    respondJson(res, 404, { error: 'Not Found' });
  });
}

export function startServer(): http.Server {
  const server = createServer();
  
  // Start market feed service
  marketFeedService.start();
  
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
