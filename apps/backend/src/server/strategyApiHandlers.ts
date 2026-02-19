/**
 * Strategy Management API Handlers
 * 
 * API endpoints for managing strategies with hot-reload:
 * - GET /api/strategies - List all loaded strategies
 * - GET /api/strategies/:id - Get strategy details
 * - POST /api/strategies/reload/:id - Reload a strategy
 * - POST /api/strategies/reload-all - Reload all strategies
 * - DELETE /api/strategies/:id - Unload a strategy
 * 
 * Design follows RESTful conventions.
 * 
 * ⚠️ SECURITY NOTE: These handlers are NOT integrated into the main server yet.
 * When integrating, these endpoints MUST be protected with authentication/authorization
 * as they allow administrative operations that can modify trading strategies.
 * See server/index.ts for the admin token authentication pattern.
 */

import http from 'http';
import { parse as parseUrl } from 'url';
import { logger } from '../utils/logger';
import type { StrategyManager } from '../trading/strategies/StrategyManager';

/**
 * Handle GET /api/strategies - List all loaded strategies
 */
export async function handleGetStrategiesInfo(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager
): Promise<void> {
  try {
    const instances = strategyManager.getAllStrategyInstances();
    
    const strategies = Array.from(instances.entries()).map(([id, instance]) => ({
      strategyId: id,
      type: instance.config.type,
      name: instance.strategy.name,
      version: instance.strategy.version,
      enabled: instance.config.enabled,
      loadedAt: instance.loadedAt.toISOString(),
      reloadCount: instance.reloadCount,
      metrics: instance.strategy.getMetrics ? instance.strategy.getMetrics() : null,
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: strategies.length,
      strategies,
    }));

    logger.info('Listed strategies', {
      category: 'api',
      endpoint: '/api/strategies',
      count: strategies.length,
    });
  } catch (error) {
    logger.error('Failed to list strategies', {
      category: 'api',
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Handle GET /api/strategies/:id - Get strategy details
 */
export async function handleGetStrategyInfo(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager,
  strategyId: string
): Promise<void> {
  try {
    const instance = strategyManager.getStrategyInstance(strategyId);
    
    if (!instance) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Strategy ${strategyId} not found`,
      }));
      return;
    }

    // Sanitize config to avoid exposing sensitive parameters
    const sanitizedConfig = {
      strategyId: instance.config.strategyId,
      type: instance.config.type,
      enabled: instance.config.enabled,
      // Only expose param keys, not values which may be sensitive
      params: instance.config.params ? Object.keys(instance.config.params) : [],
    };

    const response = {
      success: true,
      strategy: {
        strategyId,
        type: instance.config.type,
        name: instance.strategy.name,
        version: instance.strategy.version,
        description: instance.strategy.description,
        enabled: instance.config.enabled,
        config: sanitizedConfig,
        loadedAt: instance.loadedAt.toISOString(),
        reloadCount: instance.reloadCount,
        metrics: instance.strategy.getMetrics ? instance.strategy.getMetrics() : null,
        hasPreviousVersion: !!instance.previousInstance,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));

    logger.info('Got strategy info', {
      category: 'api',
      strategyId,
    });
  } catch (error) {
    logger.error('Failed to get strategy info', {
      category: 'api',
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Handle POST /api/strategies/reload/:id - Reload a strategy
 */
export async function handleReloadStrategy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager,
  strategyId: string
): Promise<void> {
  try {
    // Validate strategyId format
    if (!/^[a-zA-Z0-9-_]+$/.test(strategyId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid strategy ID format',
      }));
      return;
    }

    // Read request body with size limit (1MB for strategy config)
    const MAX_BODY_SIZE_BYTES = 1 * 1024 * 1024;
    let body = '';
    let bodySize = 0;

    for await (const chunk of req) {
      const chunkStr = chunk.toString();
      bodySize += Buffer.byteLength(chunkStr);

      if (bodySize > MAX_BODY_SIZE_BYTES) {
        logger.warn('Reload strategy request body too large', {
          category: 'api',
          strategyId,
          maxBytes: MAX_BODY_SIZE_BYTES,
        });

        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Payload too large',
        }));

        req.destroy();
        return;
      }

      body += chunkStr;
    }

    // Parse and validate config if provided
    let newConfig;
    if (body) {
      try {
        newConfig = JSON.parse(body);
        
        // Basic validation of config structure
        if (newConfig && typeof newConfig === 'object') {
          if (newConfig.strategyId && typeof newConfig.strategyId !== 'string') {
            throw new Error('strategyId must be a string');
          }
          if (newConfig.type && typeof newConfig.type !== 'string') {
            throw new Error('type must be a string');
          }
          if (newConfig.enabled !== undefined && typeof newConfig.enabled !== 'boolean') {
            throw new Error('enabled must be a boolean');
          }
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: `Invalid config: ${error instanceof Error ? error.message : String(error)}`,
        }));
        return;
      }
    }

    const strategy = await strategyManager.reloadStrategy(strategyId, newConfig);

    const instance = strategyManager.getStrategyInstance(strategyId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Strategy ${strategyId} reloaded successfully`,
      strategy: {
        strategyId,
        name: strategy.name,
        version: strategy.version,
        reloadCount: instance?.reloadCount,
      },
    }));

    logger.info('Strategy reloaded via API', {
      category: 'api',
      strategyId,
      reloadCount: instance?.reloadCount,
    });
  } catch (error) {
    logger.error('Failed to reload strategy', {
      category: 'api',
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Handle POST /api/strategies/reload-all - Reload all strategies
 */
export async function handleReloadAllStrategies(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager
): Promise<void> {
  try {
    const instances = strategyManager.getAllStrategyInstances();
    const results: Array<{ strategyId: string; success: boolean; error?: string }> = [];

    for (const [strategyId] of instances) {
      try {
        await strategyManager.reloadStrategy(strategyId);
        results.push({ strategyId, success: true });
      } catch (error) {
        results.push({
          strategyId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: failureCount === 0,
      message: `Reloaded ${successCount} of ${results.length} strategies`,
      successCount,
      failureCount,
      results,
    }));

    logger.info('All strategies reload requested', {
      category: 'api',
      successCount,
      failureCount,
    });
  } catch (error) {
    logger.error('Failed to reload all strategies', {
      category: 'api',
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Handle DELETE /api/strategies/:id - Unload a strategy
 */
export async function handleUnloadStrategy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager,
  strategyId: string
): Promise<void> {
  try {
    await strategyManager.unloadStrategy(strategyId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Strategy ${strategyId} unloaded successfully`,
    }));

    logger.info('Strategy unloaded via API', {
      category: 'api',
      strategyId,
    });
  } catch (error) {
    logger.error('Failed to unload strategy', {
      category: 'api',
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Handle GET /api/strategies/watching - Get watching status
 */
export async function handleGetWatchingStatus(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager
): Promise<void> {
  try {
    const isActive = strategyManager.isWatchingActive();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      watching: isActive,
    }));

    logger.debug('Strategy watching status queried', {
      category: 'api',
      watching: isActive,
    });
  } catch (error) {
    logger.error('Failed to get watching status', {
      category: 'api',
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Handle POST /api/strategies/watching/start - Start watching
 */
export async function handleStartWatching(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager
): Promise<void> {
  try {
    await strategyManager.startWatching();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Strategy file watching started',
    }));

    logger.info('Strategy watching started via API', {
      category: 'api',
    });
  } catch (error) {
    logger.error('Failed to start watching', {
      category: 'api',
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

/**
 * Handle POST /api/strategies/watching/stop - Stop watching
 */
export async function handleStopWatching(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  strategyManager: StrategyManager
): Promise<void> {
  try {
    await strategyManager.stopWatching();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Strategy file watching stopped',
    }));

    logger.info('Strategy watching stopped via API', {
      category: 'api',
    });
  } catch (error) {
    logger.error('Failed to stop watching', {
      category: 'api',
      error: error instanceof Error ? error.message : String(error),
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}
