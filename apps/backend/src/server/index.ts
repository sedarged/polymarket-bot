import http from 'http';
import { getHealthStatus } from './health';
import { logger } from '../utils/logger';
import { config } from '../config';

const respondJson = (res: http.ServerResponse, statusCode: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (method === 'GET' && url === '/health') {
      const health = getHealthStatus();
      respondJson(res, 200, health);
      logger.info('Health check', { path: '/health' });
      return;
    }

    respondJson(res, 404, { error: 'Not Found' });
  });
}

export function startServer(): http.Server {
  const server = createServer();
  server.listen(config.port, () => {
    logger.info('Server listening', { port: config.port });
  });
  return server;
}
