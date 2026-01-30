import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

import { ClobClient } from './clients/clob';
import { GammaClient } from './clients/gamma';
import { config } from './config';
import { logger } from './utils/logger';

// Create singleton client instances to avoid overhead of per-request instantiation
const gammaClient = new GammaClient();
const clobClient = new ClobClient();

type JsonPayload = Record<string, unknown> | unknown[];

function sendJson(res: ServerResponse, statusCode: number, payload: JsonPayload): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function handleOptions(res: ServerResponse): void {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const path = requestUrl.pathname;

  if (path === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (path === '/api/markets') {
    const limitParam = requestUrl.searchParams.get('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    if (limitParam && (Number.isNaN(limit) || limit <= 0)) {
      sendJson(res, 400, { error: 'Invalid limit value' });
      return;
    }

    const markets = await gammaClient.getActiveMarkets(limit);
    sendJson(res, 200, markets);
    return;
  }

  if (path === '/api/orderbook') {
    const tokenId = requestUrl.searchParams.get('tokenId');
    if (!tokenId) {
      sendJson(res, 400, { error: 'Missing tokenId query parameter' });
      return;
    }

    const orderbook = await clobClient.getOrderbook(tokenId);
    sendJson(res, 200, orderbook);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

function handleAdminRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (requestUrl.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

const apiServer = http.createServer(async (req, res) => {
  try {
    await handleApiRequest(req, res);
  } catch (error) {
    logger.error('API server error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
});

const adminServer = http.createServer((req, res) => {
  try {
    handleAdminRequest(req, res);
  } catch (error) {
    logger.error('Admin server error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
});

apiServer.listen(config.backendPort, () => {
  logger.info(`API server running on port ${config.backendPort}`);
});

adminServer.listen(config.adminPort, () => {
  logger.info(`Admin server running on port ${config.adminPort}`);
});

function closeServer(server: http.Server, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Close all connections to ensure quick shutdown (Node.js 18.2.0+)
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    
    server.close((err?: Error) => {
      if (err) {
        logger.error(`${name} server failed to close`, err);
        reject(err);
      } else {
        logger.info(`${name} server closed`);
        resolve();
      }
    });
  });
}

function shutdown(): void {
  logger.info('Shutting down servers...');

  Promise.all([
    closeServer(apiServer, 'API'),
    closeServer(adminServer, 'Admin'),
  ])
    .then(() => {
      logger.info('All servers shut down gracefully. Exiting process.');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Error during server shutdown. Exiting process with error.', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
