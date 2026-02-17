/**
 * Configuration Management API Handlers (GAP-003)
 * 
 * Provides REST API endpoints for configuration management with:
 * - GET /config - Get current configuration
 * - GET /config/:type - Get specific config file (markets, strategy)
 * - PUT /config/:type - Update specific config file
 * - DELETE /config/:type - Delete specific config file
 * - POST /config/validate/:type - Validate config without saving
 * - POST /config/reload - Manually trigger config reload
 * - GET /config/watching - Get file watching status
 * - POST /config/watching/start - Start file watching
 * - POST /config/watching/stop - Stop file watching
 * 
 * All endpoints require admin authentication (ADMIN_TOKEN).
 */

import http from 'http';
import { ConfigManager } from '../config/configManager';
import { logger } from '../utils/logger';

const configManager = ConfigManager.getInstance();

/**
 * Parse request body as JSON
 */
async function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    req.on('error', reject);
  });
}

/**
 * GET /config - Get current configuration
 * Returns the full current configuration (sensitive values masked)
 */
export async function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const config = configManager.getConfig();
    
    // Mask sensitive values
    const sanitizedConfig = {
      ...config,
      privateKey: config.privateKey ? '***REDACTED***' : undefined,
      adminToken: config.adminToken ? '***REDACTED***' : undefined,
      encryptionKey: config.encryptionKey ? '***REDACTED***' : undefined,
      telegramBotToken: config.telegramBotToken ? '***REDACTED***' : undefined,
      awsSecretName: config.awsSecretName ? '***REDACTED***' : undefined,
      vaultToken: config.vaultToken ? '***REDACTED***' : undefined,
      backupS3AccessKeyId: config.backupS3AccessKeyId ? '***REDACTED***' : undefined,
      backupS3SecretAccessKey: config.backupS3SecretAccessKey ? '***REDACTED***' : undefined,
      backupAzureConnectionString: config.backupAzureConnectionString ? '***REDACTED***' : undefined,
      backupAzureAccountKey: config.backupAzureAccountKey ? '***REDACTED***' : undefined,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: sanitizedConfig }));
    
    logger.info('Configuration retrieved via API', { category: 'config' });
  } catch (error) {
    logger.error('Failed to get configuration', {
      category: 'config',
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to retrieve configuration',
    }));
  }
}

/**
 * GET /config/:type - Get specific configuration file
 * :type can be 'markets' or 'strategy'
 */
export async function handleGetConfigFile(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  type: string,
): Promise<void> {
  try {
    if (type !== 'markets' && type !== 'strategy') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Invalid config type: ${type}. Must be 'markets' or 'strategy'`,
      }));
      return;
    }

    const configFile = await configManager.getConfigFile(type);
    
    if (!configFile) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Configuration file not found for type: ${type}`,
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: configFile }));
    
    logger.info('Configuration file retrieved via API', { category: 'config', type });
  } catch (error) {
    logger.error('Failed to get configuration file', {
      category: 'config',
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to retrieve configuration file',
    }));
  }
}

/**
 * PUT /config/:type - Update specific configuration file
 * :type can be 'markets' or 'strategy'
 * Request body should contain the new configuration
 */
export async function handleUpdateConfigFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  type: string,
): Promise<void> {
  try {
    if (type !== 'markets' && type !== 'strategy') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Invalid config type: ${type}. Must be 'markets' or 'strategy'`,
      }));
      return;
    }

    const body = await parseJsonBody(req);
    const result = await configManager.updateConfigFile(type, body);

    const statusCode = result.success ? 200 : 400;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    
    if (result.success) {
      logger.info('Configuration file updated via API', { category: 'config', type });
    }
  } catch (error) {
    logger.error('Failed to update configuration file', {
      category: 'config',
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: `Failed to update configuration: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}

/**
 * DELETE /config/:type - Delete specific configuration file
 * :type can be 'markets' or 'strategy'
 */
export async function handleDeleteConfigFile(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  type: string,
): Promise<void> {
  try {
    if (type !== 'markets' && type !== 'strategy') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Invalid config type: ${type}. Must be 'markets' or 'strategy'`,
      }));
      return;
    }

    const result = await configManager.deleteConfigFile(type);

    const statusCode = result.success ? 200 : 400;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    
    if (result.success) {
      logger.info('Configuration file deleted via API', { category: 'config', type });
    }
  } catch (error) {
    logger.error('Failed to delete configuration file', {
      category: 'config',
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: `Failed to delete configuration: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}

/**
 * POST /config/validate/:type - Validate configuration without saving
 * :type can be 'markets' or 'strategy'
 * Request body should contain the configuration to validate
 */
export async function handleValidateConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  type: string,
): Promise<void> {
  try {
    if (type !== 'markets' && type !== 'strategy') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Invalid config type: ${type}. Must be 'markets' or 'strategy'`,
      }));
      return;
    }

    const body = await parseJsonBody(req);
    const result = configManager.validateConfig(type, body);

    const statusCode = result.success ? 200 : 400;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    
    logger.info('Configuration validated via API', { category: 'config', type, valid: result.success });
  } catch (error) {
    logger.error('Failed to validate configuration', {
      category: 'config',
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: `Failed to validate configuration: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}

/**
 * POST /config/reload - Manually trigger configuration reload
 */
export async function handleReloadConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    await configManager.reloadConfig();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Configuration reloaded successfully',
    }));
    
    logger.info('Configuration manually reloaded via API', { category: 'config' });
  } catch (error) {
    logger.error('Failed to reload configuration', {
      category: 'config',
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: `Failed to reload configuration: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}

/**
 * GET /config/watching - Get file watching status
 */
export async function handleGetWatchingStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const isWatching = configManager.isWatchingActive();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: { watching: isWatching },
    }));
    
    logger.debug('Watching status retrieved via API', { category: 'config', watching: isWatching });
  } catch (error) {
    logger.error('Failed to get watching status', {
      category: 'config',
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to retrieve watching status',
    }));
  }
}

/**
 * POST /config/watching/start - Start file watching
 */
export async function handleStartWatching(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    await configManager.startWatching();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'File watching started successfully',
    }));
    
    logger.info('File watching started via API', { category: 'config' });
  } catch (error) {
    logger.error('Failed to start file watching', {
      category: 'config',
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: `Failed to start file watching: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}

/**
 * POST /config/watching/stop - Stop file watching
 */
export async function handleStopWatching(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    await configManager.stopWatching();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'File watching stopped successfully',
    }));
    
    logger.info('File watching stopped via API', { category: 'config' });
  } catch (error) {
    logger.error('Failed to stop file watching', {
      category: 'config',
      error: error instanceof Error ? error.message : String(error),
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: `Failed to stop file watching: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}
