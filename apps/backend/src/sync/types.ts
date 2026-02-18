/**
 * Types for Market Synchronization Module (GAP-004)
 * 
 * Defines data structures for state synchronization, discrepancy detection,
 * and recovery procedures.
 */

import { Order, Fill, Position, Balance, Orderbook } from '@polymarket/shared';

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean;
  timestamp: number;
  discrepancies: Discrepancy[];
  recoveryActions: RecoveryAction[];
  errors?: string[];
}

/**
 * Types of state discrepancies that can be detected
 */
export enum DiscrepancyType {
  MISSING_ORDER = 'MISSING_ORDER',           // Local has order that remote doesn't
  EXTRA_ORDER = 'EXTRA_ORDER',               // Remote has order that local doesn't
  ORDER_STATUS_MISMATCH = 'ORDER_STATUS_MISMATCH', // Order status differs
  POSITION_MISMATCH = 'POSITION_MISMATCH',   // Position size/value differs
  BALANCE_MISMATCH = 'BALANCE_MISMATCH',     // Balance differs beyond threshold
  ORDERBOOK_STALE = 'ORDERBOOK_STALE',       // Orderbook not updated recently
  MISSED_FILL = 'MISSED_FILL',               // Fill exists remotely but not locally
}

/**
 * Severity levels for discrepancies
 */
export enum DiscrepancySeverity {
  LOW = 'LOW',       // Minor inconsistency, can be ignored or auto-fixed
  MEDIUM = 'MEDIUM', // Noticeable inconsistency, should be logged
  HIGH = 'HIGH',     // Significant inconsistency, requires action
  CRITICAL = 'CRITICAL', // Critical inconsistency, may require trading halt
}

/**
 * Represents a detected discrepancy between local and remote state
 */
export interface Discrepancy {
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  timestamp: number;
  description: string;
  localState?: unknown;
  remoteState?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Types of recovery actions that can be taken
 */
export enum RecoveryActionType {
  SYNC_ORDER = 'SYNC_ORDER',           // Sync order from remote
  CANCEL_ORPHAN_ORDER = 'CANCEL_ORPHAN_ORDER', // Cancel local order not on remote
  UPDATE_POSITION = 'UPDATE_POSITION', // Update position from remote data
  UPDATE_BALANCE = 'UPDATE_BALANCE',   // Update balance from remote
  RESYNC_ORDERBOOK = 'RESYNC_ORDERBOOK', // Re-fetch orderbook from API
  FETCH_MISSED_FILLS = 'FETCH_MISSED_FILLS', // Fetch fills that were missed
  MANUAL_INTERVENTION = 'MANUAL_INTERVENTION', // Requires manual review
}

/**
 * Represents a recovery action taken or recommended
 */
export interface RecoveryAction {
  type: RecoveryActionType;
  timestamp: number;
  discrepancyType: DiscrepancyType;
  executed: boolean;
  success?: boolean;
  description: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Configuration for sync operations
 */
export interface SyncConfig {
  // Sync interval in milliseconds (default: 5 minutes)
  syncIntervalMs: number;
  
  // Thresholds for discrepancy detection
  balanceDriftThresholdPercent: number; // e.g., 1% = 1.0
  balanceDriftThresholdAbsolute: number; // e.g., $10 = 10.0
  orderbookStaleThresholdMs: number; // e.g., 30 seconds
  
  // Recovery settings
  autoRecoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  
  // Feature flags
  syncOrdersEnabled: boolean;
  syncPositionsEnabled: boolean;
  syncBalancesEnabled: boolean;
  syncOrderbooksEnabled: boolean;
}

/**
 * Snapshot of system state at a point in time
 */
export interface StateSnapshot {
  timestamp: number;
  version: number;
  orders: Order[];
  fills: Fill[];
  positions: Position[];
  balances: Balance[];
  orderbooks: Map<string, Orderbook>;
}

/**
 * Statistics about sync operations
 */
export interface SyncStats {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  totalDiscrepancies: number;
  discrepanciesByType: Record<DiscrepancyType, number>;
  totalRecoveryActions: number;
  successfulRecoveryActions: number;
  lastSyncTime: number;
  averageSyncDurationMs: number;
}
