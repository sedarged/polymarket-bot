/**
 * Discrepancy Detector (GAP-004)
 * 
 * Compares local and remote state to detect inconsistencies.
 * Classifies discrepancies by type and severity for appropriate handling.
 */

import { Order, Fill, Position, Balance, Orderbook } from '@polymarket/shared';
import {
  Discrepancy,
  DiscrepancyType,
  DiscrepancySeverity,
  SyncConfig,
} from './types';

/**
 * Detects discrepancies between local and remote state
 */
export class DiscrepancyDetector {
  constructor(private config: SyncConfig) {}

  /**
   * Compare local and remote orders to detect discrepancies
   */
  compareOrders(localOrders: Order[], remoteOrders: Order[]): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];
    const remoteOrderMap = new Map(remoteOrders.map(o => [o.orderId, o]));
    const localOrderMap = new Map(localOrders.map(o => [o.orderId, o]));

    // Check for missing orders (exist locally but not remotely)
    for (const localOrder of localOrders) {
      if (!remoteOrderMap.has(localOrder.orderId)) {
        discrepancies.push({
          type: DiscrepancyType.MISSING_ORDER,
          severity: this.getOrderDiscrepancySeverity(localOrder),
          timestamp: Date.now(),
          description: `Order ${localOrder.orderId} exists locally but not on remote`,
          localState: localOrder,
          remoteState: null,
          metadata: {
            orderId: localOrder.orderId,
            status: localOrder.status,
          },
        });
      }
    }

    // Check for extra orders (exist remotely but not locally)
    for (const remoteOrder of remoteOrders) {
      if (!localOrderMap.has(remoteOrder.orderId)) {
        discrepancies.push({
          type: DiscrepancyType.EXTRA_ORDER,
          severity: DiscrepancySeverity.HIGH,
          timestamp: Date.now(),
          description: `Order ${remoteOrder.orderId} exists remotely but not locally`,
          localState: null,
          remoteState: remoteOrder,
          metadata: {
            orderId: remoteOrder.orderId,
            status: remoteOrder.status,
          },
        });
      }
    }

    // Check for status mismatches
    for (const localOrder of localOrders) {
      const remoteOrder = remoteOrderMap.get(localOrder.orderId);
      if (remoteOrder && localOrder.status !== remoteOrder.status) {
        discrepancies.push({
          type: DiscrepancyType.ORDER_STATUS_MISMATCH,
          severity: DiscrepancySeverity.MEDIUM,
          timestamp: Date.now(),
          description: `Order ${localOrder.orderId} status mismatch: local=${localOrder.status}, remote=${remoteOrder.status}`,
          localState: localOrder,
          remoteState: remoteOrder,
          metadata: {
            orderId: localOrder.orderId,
            localStatus: localOrder.status,
            remoteStatus: remoteOrder.status,
          },
        });
      }
    }

    return discrepancies;
  }

  /**
   * Compare local and remote positions to detect discrepancies
   */
  comparePositions(localPositions: Position[], remotePositions: Position[]): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];
    const remotePositionMap = new Map(remotePositions.map(p => [p.tokenId, p]));

    for (const localPos of localPositions) {
      const remotePos = remotePositionMap.get(localPos.tokenId);
      
      if (!remotePos) {
        // Position exists locally but not remotely
        discrepancies.push({
          type: DiscrepancyType.POSITION_MISMATCH,
          severity: DiscrepancySeverity.MEDIUM,
          timestamp: Date.now(),
          description: `Position for token ${localPos.tokenId} exists locally but not remotely`,
          localState: localPos,
          remoteState: null,
          metadata: {
            tokenId: localPos.tokenId,
            localSize: localPos.size,
          },
        });
        continue;
      }

      // Check if position sizes differ
      if (localPos.size !== remotePos.size) {
        discrepancies.push({
          type: DiscrepancyType.POSITION_MISMATCH,
          severity: DiscrepancySeverity.HIGH,
          timestamp: Date.now(),
          description: `Position size mismatch for token ${localPos.tokenId}: local=${localPos.size}, remote=${remotePos.size}`,
          localState: localPos,
          remoteState: remotePos,
          metadata: {
            tokenId: localPos.tokenId,
            localSize: localPos.size,
            remoteSize: remotePos.size,
            difference: String(Number(localPos.size) - Number(remotePos.size)),
          },
        });
      }
    }

    // Check for positions that exist remotely but not locally
    for (const remotePos of remotePositions) {
      const localPos = localPositions.find(p => p.tokenId === remotePos.tokenId);
      if (!localPos) {
        discrepancies.push({
          type: DiscrepancyType.POSITION_MISMATCH,
          severity: DiscrepancySeverity.HIGH,
          timestamp: Date.now(),
          description: `Position for token ${remotePos.tokenId} exists remotely but not locally`,
          localState: null,
          remoteState: remotePos,
          metadata: {
            tokenId: remotePos.tokenId,
            remoteSize: remotePos.size,
          },
        });
      }
    }

    return discrepancies;
  }

  /**
   * Compare local and remote balances to detect discrepancies
   */
  compareBalances(localBalances: Balance[], remoteBalances: Balance[]): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];
    const remoteBalanceMap = new Map(remoteBalances.map(b => [b.currency, b]));

    for (const localBalance of localBalances) {
      const remoteBalance = remoteBalanceMap.get(localBalance.currency);
      
      if (!remoteBalance) {
        // Balance exists locally but not remotely (unusual but possible)
        continue;
      }

      const localAmount = Number(localBalance.total);
      const remoteAmount = Number(remoteBalance.total);
      const difference = Math.abs(localAmount - remoteAmount);
      const percentDiff = remoteAmount > 0 ? (difference / remoteAmount) * 100 : 0;

      // Check if difference exceeds thresholds
      if (
        difference > this.config.balanceDriftThresholdAbsolute &&
        percentDiff > this.config.balanceDriftThresholdPercent
      ) {
        discrepancies.push({
          type: DiscrepancyType.BALANCE_MISMATCH,
          severity: this.getBalanceDiscrepancySeverity(difference, percentDiff),
          timestamp: Date.now(),
          description: `Balance mismatch for ${localBalance.currency}: local=${localBalance.total}, remote=${remoteBalance.total} (diff: ${difference.toFixed(2)}, ${percentDiff.toFixed(2)}%)`,
          localState: localBalance,
          remoteState: remoteBalance,
          metadata: {
            currency: localBalance.currency,
            localAmount: localBalance.total,
            remoteAmount: remoteBalance.total,
            difference: difference.toFixed(2),
            percentDiff: percentDiff.toFixed(2),
          },
        });
      }
    }

    return discrepancies;
  }

  /**
   * Check if orderbooks are stale
   */
  checkOrderbookFreshness(orderbooks: Map<string, Orderbook>): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];
    const now = Date.now();

    for (const [tokenId, orderbook] of orderbooks.entries()) {
      const age = now - orderbook.timestamp;
      
      if (age > this.config.orderbookStaleThresholdMs) {
        discrepancies.push({
          type: DiscrepancyType.ORDERBOOK_STALE,
          severity: this.getOrderbookStaleSeverity(age),
          timestamp: now,
          description: `Orderbook for token ${tokenId} is stale (age: ${(age / 1000).toFixed(1)}s)`,
          localState: { tokenId, timestamp: orderbook.timestamp, age },
          metadata: {
            tokenId,
            orderbookTimestamp: orderbook.timestamp,
            ageMs: age,
            ageSeconds: (age / 1000).toFixed(1),
          },
        });
      }
    }

    return discrepancies;
  }

  /**
   * Detect missed fills by comparing local fills with remote
   */
  detectMissedFills(localFills: Fill[], remoteFills: Fill[]): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];
    const localFillIds = new Set(localFills.map(f => f.fillId));

    for (const remoteFill of remoteFills) {
      if (!localFillIds.has(remoteFill.fillId)) {
        discrepancies.push({
          type: DiscrepancyType.MISSED_FILL,
          severity: DiscrepancySeverity.HIGH,
          timestamp: Date.now(),
          description: `Fill ${remoteFill.fillId} for order ${remoteFill.orderId} was missed locally`,
          localState: null,
          remoteState: remoteFill,
          metadata: {
            fillId: remoteFill.fillId,
            orderId: remoteFill.orderId,
            size: remoteFill.size,
            price: remoteFill.price,
          },
        });
      }
    }

    return discrepancies;
  }

  /**
   * Determine severity of an order discrepancy based on order status
   */
  private getOrderDiscrepancySeverity(order: Order): DiscrepancySeverity {
    switch (order.status) {
      case 'OPEN':
        return DiscrepancySeverity.HIGH; // Open orders should be on remote
      case 'PARTIALLY_FILLED':
        return DiscrepancySeverity.HIGH; // Partial fills are critical
      case 'MATCHED':
      case 'CANCELLED':
        return DiscrepancySeverity.LOW; // Completed orders less critical
      default:
        return DiscrepancySeverity.MEDIUM;
    }
  }

  /**
   * Determine severity of a balance discrepancy
   */
  private getBalanceDiscrepancySeverity(
    absoluteDiff: number,
    percentDiff: number
  ): DiscrepancySeverity {
    if (percentDiff > 10 || absoluteDiff > 1000) {
      return DiscrepancySeverity.CRITICAL;
    } else if (percentDiff > 5 || absoluteDiff > 100) {
      return DiscrepancySeverity.HIGH;
    } else {
      return DiscrepancySeverity.MEDIUM;
    }
  }

  /**
   * Determine severity based on orderbook staleness
   */
  private getOrderbookStaleSeverity(ageMs: number): DiscrepancySeverity {
    const ageSeconds = ageMs / 1000;
    
    if (ageSeconds > 300) { // 5 minutes
      return DiscrepancySeverity.HIGH;
    } else if (ageSeconds > 120) { // 2 minutes
      return DiscrepancySeverity.MEDIUM;
    } else {
      return DiscrepancySeverity.LOW;
    }
  }
}
