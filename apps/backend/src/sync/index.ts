/**
 * Market Synchronization Module (GAP-004)
 * 
 * Provides state synchronization between local bot state and remote market data.
 * 
 * Main components:
 * - SyncManager: Orchestrates synchronization cycles
 * - DiscrepancyDetector: Detects inconsistencies in state
 * - RecoveryProcedures: Automated recovery for common issues
 * 
 * Usage:
 * ```typescript
 * import { SyncManager, createDefaultSyncConfig } from './sync';
 * 
 * const config = createDefaultSyncConfig();
 * const syncManager = new SyncManager(config, dataSource);
 * syncManager.start();
 * ```
 */

export * from './types';
export * from './syncManager';
export * from './discrepancyDetector';
export * from './recoveryProcedures';

import { SyncConfig } from './types';

/**
 * Create default sync configuration
 */
export function createDefaultSyncConfig(): SyncConfig {
  return {
    syncIntervalMs: 5 * 60 * 1000, // 5 minutes
    balanceDriftThresholdPercent: 1.0, // 1%
    balanceDriftThresholdAbsolute: 10.0, // $10
    orderbookStaleThresholdMs: 30 * 1000, // 30 seconds
    autoRecoveryEnabled: true,
    maxRecoveryAttempts: 3,
    syncOrdersEnabled: true,
    syncPositionsEnabled: true,
    syncBalancesEnabled: true,
    syncOrderbooksEnabled: true,
  };
}

/**
 * Parse integer from environment variable with validation
 */
function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float from environment variable with validation
 */
function parseFloatSafe(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from environment variable with consistent behavior
 * Only 'true' (case-insensitive) is treated as true, everything else is false
 */
function parseBooleanSafe(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Create sync configuration from environment variables
 */
export function createSyncConfigFromEnv(): SyncConfig {
  const defaults = createDefaultSyncConfig();
  
  return {
    syncIntervalMs: parseIntSafe(process.env.SYNC_INTERVAL_MS, defaults.syncIntervalMs),
    balanceDriftThresholdPercent: parseFloatSafe(process.env.BALANCE_DRIFT_THRESHOLD_PERCENT, defaults.balanceDriftThresholdPercent),
    balanceDriftThresholdAbsolute: parseFloatSafe(process.env.BALANCE_DRIFT_THRESHOLD_ABSOLUTE, defaults.balanceDriftThresholdAbsolute),
    orderbookStaleThresholdMs: parseIntSafe(process.env.ORDERBOOK_STALE_THRESHOLD_MS, defaults.orderbookStaleThresholdMs),
    autoRecoveryEnabled: parseBooleanSafe(process.env.AUTO_RECOVERY_ENABLED, defaults.autoRecoveryEnabled),
    maxRecoveryAttempts: parseIntSafe(process.env.MAX_RECOVERY_ATTEMPTS, defaults.maxRecoveryAttempts),
    syncOrdersEnabled: parseBooleanSafe(process.env.SYNC_ORDERS_ENABLED, defaults.syncOrdersEnabled),
    syncPositionsEnabled: parseBooleanSafe(process.env.SYNC_POSITIONS_ENABLED, defaults.syncPositionsEnabled),
    syncBalancesEnabled: parseBooleanSafe(process.env.SYNC_BALANCES_ENABLED, defaults.syncBalancesEnabled),
    syncOrderbooksEnabled: parseBooleanSafe(process.env.SYNC_ORDERBOOKS_ENABLED, defaults.syncOrderbooksEnabled),
  };
}
