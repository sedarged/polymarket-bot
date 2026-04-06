/**
 * Market Synchronization Manager (GAP-004)
 * 
 * Orchestrates synchronization between local bot state and remote market data.
 * Coordinates discrepancy detection, recovery procedures, and state consistency.
 * 
 * Features:
 * - Periodic state reconciliation
 * - Automated discrepancy detection
 * - Recovery procedure execution
 * - Comprehensive audit logging
 * - State snapshot versioning
 * 
 * Integration points:
 * - TradingClient for orders, fills, positions, balances
 * - MarketFeedClient for orderbook data
 * - DataApiClient for position/trade verification
 */

import { Order, Fill, Position, Balance, Orderbook } from '@polymarket/shared';
import {
  SyncResult,
  SyncConfig,
  StateSnapshot,
  SyncStats,
  DiscrepancyType,
  DiscrepancySeverity,
  Discrepancy,
  RecoveryAction,
} from './types';
import { DiscrepancyDetector } from './discrepancyDetector';
import { RecoveryProcedures } from './recoveryProcedures';
import { systemLogger, databaseLogger } from '../utils/logger';

const logger = systemLogger;

/**
 * Data source interface for fetching remote state
 */
export interface SyncDataSource {
  getOrders(): Promise<Order[]>;
  getFills(): Promise<Fill[]>;
  getPositions(): Promise<Position[]>;
  getBalances(): Promise<Balance[]>;
  getOrderbooks(): Promise<Map<string, Orderbook>>;
}

/**
 * Main synchronization manager
 */
export class SyncManager {
  private detector: DiscrepancyDetector;
  private recovery: RecoveryProcedures;
  private syncTimer: NodeJS.Timeout | null = null;
  private consecutiveSyncFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 5;
  private snapshots: StateSnapshot[] = [];
  private stats: SyncStats;
  private isRunning: boolean = false;
  private maxSnapshots: number = 100; // Keep last 100 snapshots

  constructor(
    private config: SyncConfig,
    private dataSource: SyncDataSource
  ) {
    this.detector = new DiscrepancyDetector(config);
    this.recovery = new RecoveryProcedures(config);
    this.stats = this.initializeStats();
  }

  /**
   * Start periodic synchronization
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('SyncManager already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting SyncManager', {
      syncIntervalMs: this.config.syncIntervalMs,
      autoRecoveryEnabled: this.config.autoRecoveryEnabled,
    });

    // Perform initial sync
    this.sync().catch(error => {
      logger.error('Initial sync failed', { error: error.message });
    });

    // Schedule periodic syncs with consecutive failure tracking
    this.syncTimer = setInterval(() => {
      this.sync()
        .then(result => {
          if (result.success) {
            this.consecutiveSyncFailures = 0;
          } else {
            this.consecutiveSyncFailures++;
          }
        })
        .catch(error => {
          this.consecutiveSyncFailures++;
          logger.error('Periodic sync failed', {
            error: error.message,
            consecutiveFailures: this.consecutiveSyncFailures,
          });
          if (this.consecutiveSyncFailures >= SyncManager.MAX_CONSECUTIVE_FAILURES) {
            logger.error('CRITICAL: Multiple consecutive sync failures detected', {
              consecutiveFailures: this.consecutiveSyncFailures,
            });
          }
        });
    }, this.config.syncIntervalMs);
  }

  /**
   * Stop periodic synchronization
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('SyncManager not running');
      return;
    }

    this.isRunning = false;
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    logger.info('SyncManager stopped');
  }

  /**
   * Perform a full synchronization cycle
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      timestamp: startTime,
      discrepancies: [],
      recoveryActions: [],
    };

    logger.info('Starting sync cycle');

    try {
      // Fetch remote state
      const remoteState = await this.fetchRemoteState();
      
      // Create snapshot of current state
      const snapshot = await this.createSnapshot(remoteState);
      this.addSnapshot(snapshot);

      // Detect discrepancies
      const discrepancies = await this.detectDiscrepancies(remoteState);
      result.discrepancies = discrepancies;

      logger.info('Discrepancies detected', {
        count: discrepancies.length,
        byType: this.groupDiscrepanciesByType(discrepancies),
        bySeverity: this.groupDiscrepanciesBySeverity(discrepancies),
      });

      // Log each discrepancy
      for (const discrepancy of discrepancies) {
        this.logDiscrepancy(discrepancy);
      }

      // Execute recovery procedures
      const recoveryActions: RecoveryAction[] = [];
      for (const discrepancy of discrepancies) {
        const action = await this.recovery.recover(discrepancy);
        recoveryActions.push(action);
        this.logRecoveryAction(action);
      }
      result.recoveryActions = recoveryActions;

      result.success = true;
      
      // Reset recovery attempts after successful sync to prevent memory leak
      this.recovery.resetAttempts();
      
      // Update statistics (only after successful sync)
      this.updateStats(result, Date.now() - startTime);
      
      logger.info('Sync cycle completed', {
        durationMs: Date.now() - startTime,
        discrepancies: discrepancies.length,
        recoveryActions: recoveryActions.length,
      });

    } catch (error) {
      result.success = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors = [errorMessage];
      const durationMs = Date.now() - startTime;
      logger.error('Sync cycle failed', {
        error: errorMessage,
        durationMs,
      });
      this.stats.failedSyncs++;

      // FIX: Calculate average duration before incrementing totalSyncs to avoid race condition
      const prevTotalDuration = this.stats.averageSyncDurationMs * this.stats.totalSyncs;
      this.stats.totalSyncs++;
      this.stats.averageSyncDurationMs = (prevTotalDuration + durationMs) / this.stats.totalSyncs;
    }

    this.stats.lastSyncTime = Date.now();
    return result;
  }

  /**
   * Fetch all remote state data
   */
  private async fetchRemoteState(): Promise<{
    orders: Order[];
    fills: Fill[];
    positions: Position[];
    balances: Balance[];
    orderbooks: Map<string, Orderbook>;
  }> {
    logger.debug('Fetching remote state');

    const [orders, fills, positions, balances, orderbooks] = await Promise.all([
      this.config.syncOrdersEnabled ? this.dataSource.getOrders() : Promise.resolve([]),
      this.config.syncOrdersEnabled ? this.dataSource.getFills() : Promise.resolve([]),
      this.config.syncPositionsEnabled ? this.dataSource.getPositions() : Promise.resolve([]),
      this.config.syncBalancesEnabled ? this.dataSource.getBalances() : Promise.resolve([]),
      this.config.syncOrderbooksEnabled ? this.dataSource.getOrderbooks() : Promise.resolve(new Map()),
    ]);

    logger.debug('Remote state fetched', {
      orders: orders.length,
      fills: fills.length,
      positions: positions.length,
      balances: balances.length,
      orderbooks: orderbooks.size,
    });

    return { orders, fills, positions, balances, orderbooks };
  }

  /**
   * Detect all types of discrepancies
   */
  private async detectDiscrepancies(remoteState: {
    orders: Order[];
    fills: Fill[];
    positions: Position[];
    balances: Balance[];
    orderbooks: Map<string, Orderbook>;
  }): Promise<Discrepancy[]> {
    const discrepancies: Discrepancy[] = [];

    // AUDIT FIX: Log that local state is not yet integrated with TradingClient.
    // This comparison uses empty local state, meaning all remote state is flagged as discrepancies.
    // When TradingClient exposes getOpenOrders/getPositions/getBalances, wire them here.
    // Until then, the sync cycle serves as a remote state audit log.
    const localOrders: Order[] = [];
    const localFills: Fill[] = [];
    const localPositions: Position[] = [];
    const localBalances: Balance[] = [];

    // Detect order discrepancies
    if (this.config.syncOrdersEnabled) {
      discrepancies.push(...this.detector.compareOrders(localOrders, remoteState.orders));
      discrepancies.push(...this.detector.detectMissedFills(localFills, remoteState.fills));
    }

    // Detect position discrepancies
    if (this.config.syncPositionsEnabled) {
      discrepancies.push(...this.detector.comparePositions(localPositions, remoteState.positions));
    }

    // Detect balance discrepancies
    if (this.config.syncBalancesEnabled) {
      discrepancies.push(...this.detector.compareBalances(localBalances, remoteState.balances));
    }

    // Check orderbook freshness
    if (this.config.syncOrderbooksEnabled) {
      discrepancies.push(...this.detector.checkOrderbookFreshness(remoteState.orderbooks));
    }

    return discrepancies;
  }

  /**
   * Create a state snapshot
   */
  private async createSnapshot(remoteState: {
    orders: Order[];
    fills: Fill[];
    positions: Position[];
    balances: Balance[];
    orderbooks: Map<string, Orderbook>;
  }): Promise<StateSnapshot> {
    const version = this.snapshots.length + 1;
    
    return {
      timestamp: Date.now(),
      version,
      // Create shallow copies to ensure snapshot immutability
      orders: [...remoteState.orders],
      fills: [...remoteState.fills],
      positions: [...remoteState.positions],
      balances: [...remoteState.balances],
      orderbooks: new Map(remoteState.orderbooks),
    };
  }

  /**
   * Add snapshot and maintain max limit
   */
  private addSnapshot(snapshot: StateSnapshot): void {
    this.snapshots.push(snapshot);
    
    // Trim old snapshots if needed
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
      databaseLogger.debug('Trimmed old snapshots', {
        kept: this.snapshots.length,
        maxSnapshots: this.maxSnapshots,
      });
    }
  }

  /**
   * Log discrepancy with appropriate severity
   */
  private logDiscrepancy(discrepancy: Discrepancy): void {
    const logData = {
      type: discrepancy.type,
      severity: discrepancy.severity,
      description: discrepancy.description,
      metadata: discrepancy.metadata,
    };

    switch (discrepancy.severity) {
      case DiscrepancySeverity.CRITICAL:
        logger.error('CRITICAL discrepancy detected', logData);
        break;
      case DiscrepancySeverity.HIGH:
        logger.error('HIGH severity discrepancy detected', logData);
        break;
      case DiscrepancySeverity.MEDIUM:
        logger.warn('MEDIUM severity discrepancy detected', logData);
        break;
      case DiscrepancySeverity.LOW:
        logger.info('LOW severity discrepancy detected', logData);
        break;
    }
  }

  /**
   * Log recovery action
   */
  private logRecoveryAction(action: RecoveryAction): void {
    logger.info('Recovery action', {
      type: action.type,
      executed: action.executed,
      success: action.success,
      description: action.description,
      discrepancyType: action.discrepancyType,
      metadata: action.metadata,
      error: action.error,
    });
  }

  /**
   * Update sync statistics
   */
  private updateStats(result: SyncResult, durationMs: number): void {
    // Calculate average duration before incrementing totalSyncs for correct math
    const prevTotalDuration = this.stats.averageSyncDurationMs * this.stats.totalSyncs;
    this.stats.totalSyncs++;

    if (result.success) {
      this.stats.successfulSyncs++;
    }

    this.stats.totalDiscrepancies += result.discrepancies.length;

    // Update discrepancies by type
    for (const discrepancy of result.discrepancies) {
      const count = this.stats.discrepanciesByType[discrepancy.type] || 0;
      this.stats.discrepanciesByType[discrepancy.type] = count + 1;
    }

    // Update recovery action stats
    this.stats.totalRecoveryActions += result.recoveryActions.length;
    this.stats.successfulRecoveryActions += result.recoveryActions.filter(a => a.success).length;

    // Update average duration (running average)
    this.stats.averageSyncDurationMs = (prevTotalDuration + durationMs) / this.stats.totalSyncs;
  }

  /**
   * Initialize statistics object
   */
  private initializeStats(): SyncStats {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      totalDiscrepancies: 0,
      discrepanciesByType: {} as Record<DiscrepancyType, number>,
      totalRecoveryActions: 0,
      successfulRecoveryActions: 0,
      lastSyncTime: 0,
      averageSyncDurationMs: 0,
    };
  }

  /**
   * Group discrepancies by type for reporting
   */
  private groupDiscrepanciesByType(discrepancies: Discrepancy[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    for (const d of discrepancies) {
      grouped[d.type] = (grouped[d.type] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Group discrepancies by severity for reporting
   */
  private groupDiscrepanciesBySeverity(discrepancies: Discrepancy[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    for (const d of discrepancies) {
      grouped[d.severity] = (grouped[d.severity] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Get current sync statistics
   */
  getStats(): SyncStats {
    return { ...this.stats };
  }

  /**
   * Get recent state snapshots
   */
  getSnapshots(limit?: number): StateSnapshot[] {
    if (limit) {
      return this.snapshots.slice(-limit);
    }
    return [...this.snapshots];
  }

  /**
   * Check if sync is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
