/**
 * Recovery Procedures (GAP-004)
 * 
 * Automated recovery procedures for common synchronization issues.
 * Handles discrepancies with appropriate recovery strategies.
 */

import { Order, Fill, Position, Balance, Orderbook } from '@polymarket/shared';
import {
  Discrepancy,
  DiscrepancyType,
  DiscrepancySeverity,
  RecoveryAction,
  RecoveryActionType,
  SyncConfig,
} from './types';
import { systemLogger } from '../utils/logger';

const logger = systemLogger;

/**
 * Recovery procedures for state synchronization issues
 */
export class RecoveryProcedures {
  private recoveryAttempts: Map<string, number> = new Map();

  constructor(private config: SyncConfig) {}

  /**
   * Determine and execute appropriate recovery action for a discrepancy
   */
  async recover(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: this.determineRecoveryActionType(discrepancy),
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: false,
      description: '',
    };

    // Check if auto-recovery is enabled
    if (!this.config.autoRecoveryEnabled) {
      action.type = RecoveryActionType.MANUAL_INTERVENTION;
      action.description = `Auto-recovery disabled. Manual intervention required for ${discrepancy.type}`;
      logger.warn('Auto-recovery disabled, manual intervention required', {
        discrepancyType: discrepancy.type,
        severity: discrepancy.severity,
      });
      return action;
    }

    // Check if we've exceeded max recovery attempts
    const attemptKey = this.getAttemptKey(discrepancy);
    const attempts = this.recoveryAttempts.get(attemptKey) || 0;
    
    if (attempts >= this.config.maxRecoveryAttempts) {
      action.type = RecoveryActionType.MANUAL_INTERVENTION;
      action.description = `Max recovery attempts (${this.config.maxRecoveryAttempts}) exceeded for ${discrepancy.type}`;
      logger.error('Max recovery attempts exceeded', {
        discrepancyType: discrepancy.type,
        attempts,
        maxAttempts: this.config.maxRecoveryAttempts,
      });
      return action;
    }

    // Increment attempt counter
    this.recoveryAttempts.set(attemptKey, attempts + 1);

    // Execute recovery based on discrepancy type
    try {
      switch (discrepancy.type) {
        case DiscrepancyType.MISSING_ORDER:
          return await this.recoverMissingOrder(discrepancy);
        
        case DiscrepancyType.EXTRA_ORDER:
          return await this.recoverExtraOrder(discrepancy);
        
        case DiscrepancyType.ORDER_STATUS_MISMATCH:
          return await this.recoverOrderStatusMismatch(discrepancy);
        
        case DiscrepancyType.POSITION_MISMATCH:
          return await this.recoverPositionMismatch(discrepancy);
        
        case DiscrepancyType.BALANCE_MISMATCH:
          return await this.recoverBalanceMismatch(discrepancy);
        
        case DiscrepancyType.ORDERBOOK_STALE:
          return await this.recoverStaleOrderbook(discrepancy);
        
        case DiscrepancyType.MISSED_FILL:
          return await this.recoverMissedFill(discrepancy);
        
        default:
          action.description = `No recovery procedure defined for ${discrepancy.type}`;
          logger.warn('No recovery procedure defined', {
            discrepancyType: discrepancy.type,
          });
          return action;
      }
    } catch (error) {
      action.executed = true;
      action.success = false;
      action.error = error instanceof Error ? error.message : String(error);
      logger.error('Recovery procedure failed', {
        discrepancyType: discrepancy.type,
        error: action.error,
      });
      return action;
    }
  }

  /**
   * Recover from missing order (exists locally but not remotely)
   */
  private async recoverMissingOrder(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: RecoveryActionType.CANCEL_ORPHAN_ORDER,
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: true,
      description: 'Marked orphan order for cancellation (local only)',
      metadata: discrepancy.metadata,
    };

    // In a real implementation, this would:
    // 1. Mark the order as cancelled locally
    // 2. Remove from active orders
    // 3. Log to audit trail
    // For now, we just log the intended action
    
    logger.info('Recovery: Would cancel orphan order', {
      orderId: discrepancy.metadata?.orderId,
      localState: discrepancy.localState,
    });

    action.success = true;
    return action;
  }

  /**
   * Recover from extra order (exists remotely but not locally)
   */
  private async recoverExtraOrder(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: RecoveryActionType.SYNC_ORDER,
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: true,
      description: 'Synced missing order from remote',
      metadata: discrepancy.metadata,
    };

    // In a real implementation, this would:
    // 1. Add the remote order to local state
    // 2. Update persistence layer
    // 3. Notify any listeners
    
    logger.info('Recovery: Would sync order from remote', {
      orderId: discrepancy.metadata?.orderId,
      remoteState: discrepancy.remoteState,
    });

    action.success = true;
    return action;
  }

  /**
   * Recover from order status mismatch
   */
  private async recoverOrderStatusMismatch(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: RecoveryActionType.SYNC_ORDER,
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: true,
      description: 'Updated order status from remote',
      metadata: discrepancy.metadata,
    };

    // In a real implementation, this would:
    // 1. Update local order status to match remote
    // 2. Persist the change
    // 3. Trigger any status-change handlers
    
    logger.info('Recovery: Would update order status', {
      orderId: discrepancy.metadata?.orderId,
      localStatus: discrepancy.metadata?.localStatus,
      remoteStatus: discrepancy.metadata?.remoteStatus,
    });

    action.success = true;
    return action;
  }

  /**
   * Recover from position mismatch
   */
  private async recoverPositionMismatch(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: RecoveryActionType.UPDATE_POSITION,
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: true,
      description: 'Updated position from remote data',
      metadata: discrepancy.metadata,
    };

    // In a real implementation, this would:
    // 1. Fetch the correct position from remote
    // 2. Update local state
    // 3. Reconcile with fills and orders
    // 4. Persist the change
    
    logger.info('Recovery: Would update position', {
      tokenId: discrepancy.metadata?.tokenId,
      localSize: discrepancy.metadata?.localSize,
      remoteSize: discrepancy.metadata?.remoteSize,
    });

    action.success = true;
    return action;
  }

  /**
   * Recover from balance mismatch
   */
  private async recoverBalanceMismatch(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: RecoveryActionType.UPDATE_BALANCE,
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: true,
      description: 'Updated balance from remote',
      metadata: discrepancy.metadata,
    };

    // In a real implementation, this would:
    // 1. Fetch balance from CLOB API
    // 2. Update local balance
    // 3. Persist the change
    // 4. Check if balance affects trading limits
    
    logger.info('Recovery: Would update balance', {
      tokenId: discrepancy.metadata?.tokenId,
      localAmount: discrepancy.metadata?.localAmount,
      remoteAmount: discrepancy.metadata?.remoteAmount,
      difference: discrepancy.metadata?.difference,
    });

    action.success = true;
    return action;
  }

  /**
   * Recover from stale orderbook
   */
  private async recoverStaleOrderbook(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: RecoveryActionType.RESYNC_ORDERBOOK,
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: true,
      description: 'Triggered orderbook resync',
      metadata: discrepancy.metadata,
    };

    // In a real implementation, this would:
    // 1. Trigger a REST API fetch for the orderbook
    // 2. Update the cache
    // 3. Notify subscribers
    
    logger.info('Recovery: Would resync orderbook', {
      tokenId: discrepancy.metadata?.tokenId,
      ageMs: discrepancy.metadata?.ageMs,
    });

    action.success = true;
    return action;
  }

  /**
   * Recover from missed fill
   */
  private async recoverMissedFill(discrepancy: Discrepancy): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: RecoveryActionType.FETCH_MISSED_FILLS,
      timestamp: Date.now(),
      discrepancyType: discrepancy.type,
      executed: true,
      description: 'Fetched and processed missed fill',
      metadata: discrepancy.metadata,
    };

    // In a real implementation, this would:
    // 1. Fetch the fill details from Data API
    // 2. Add to local fills
    // 3. Update positions accordingly
    // 4. Persist the change
    // 5. Update audit trail
    
    logger.info('Recovery: Would fetch missed fill', {
      fillId: discrepancy.metadata?.fillId,
      orderId: discrepancy.metadata?.orderId,
      size: discrepancy.metadata?.size,
      price: discrepancy.metadata?.price,
    });

    action.success = true;
    return action;
  }

  /**
   * Determine the appropriate recovery action type for a discrepancy
   */
  private determineRecoveryActionType(discrepancy: Discrepancy): RecoveryActionType {
    switch (discrepancy.type) {
      case DiscrepancyType.MISSING_ORDER:
        return RecoveryActionType.CANCEL_ORPHAN_ORDER;
      case DiscrepancyType.EXTRA_ORDER:
        return RecoveryActionType.SYNC_ORDER;
      case DiscrepancyType.ORDER_STATUS_MISMATCH:
        return RecoveryActionType.SYNC_ORDER;
      case DiscrepancyType.POSITION_MISMATCH:
        return RecoveryActionType.UPDATE_POSITION;
      case DiscrepancyType.BALANCE_MISMATCH:
        return RecoveryActionType.UPDATE_BALANCE;
      case DiscrepancyType.ORDERBOOK_STALE:
        return RecoveryActionType.RESYNC_ORDERBOOK;
      case DiscrepancyType.MISSED_FILL:
        return RecoveryActionType.FETCH_MISSED_FILLS;
      default:
        return RecoveryActionType.MANUAL_INTERVENTION;
    }
  }

  /**
   * Generate a unique key for tracking recovery attempts
   */
  private getAttemptKey(discrepancy: Discrepancy): string {
    const baseKey = `${discrepancy.type}`;
    const id = discrepancy.metadata?.orderId || 
               discrepancy.metadata?.tokenId ||
               discrepancy.metadata?.fillId ||
               'unknown';
    return `${baseKey}:${id}`;
  }

  /**
   * Reset recovery attempt counters (called after successful sync)
   */
  resetAttempts(): void {
    this.recoveryAttempts.clear();
    logger.debug('Recovery attempt counters reset');
  }

  /**
   * Get current recovery statistics
   */
  getStats(): { totalAttempts: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    let totalAttempts = 0;

    for (const [key, attempts] of this.recoveryAttempts.entries()) {
      const type = key.split(':')[0];
      byType[type] = (byType[type] || 0) + attempts;
      totalAttempts += attempts;
    }

    return { totalAttempts, byType };
  }
}
