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
 * Create sync configuration from environment variables
 */
export function createSyncConfigFromEnv(): SyncConfig {
  const defaults = createDefaultSyncConfig();
  
  return {
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || String(defaults.syncIntervalMs)),
    balanceDriftThresholdPercent: parseFloat(process.env.BALANCE_DRIFT_THRESHOLD_PERCENT || String(defaults.balanceDriftThresholdPercent)),
    balanceDriftThresholdAbsolute: parseFloat(process.env.BALANCE_DRIFT_THRESHOLD_ABSOLUTE || String(defaults.balanceDriftThresholdAbsolute)),
    orderbookStaleThresholdMs: parseInt(process.env.ORDERBOOK_STALE_THRESHOLD_MS || String(defaults.orderbookStaleThresholdMs)),
    autoRecoveryEnabled: process.env.AUTO_RECOVERY_ENABLED !== 'false',
    maxRecoveryAttempts: parseInt(process.env.MAX_RECOVERY_ATTEMPTS || String(defaults.maxRecoveryAttempts)),
    syncOrdersEnabled: process.env.SYNC_ORDERS_ENABLED !== 'false',
    syncPositionsEnabled: process.env.SYNC_POSITIONS_ENABLED !== 'false',
    syncBalancesEnabled: process.env.SYNC_BALANCES_ENABLED !== 'false',
    syncOrderbooksEnabled: process.env.SYNC_ORDERBOOKS_ENABLED !== 'false',
  };
}
