import { Position } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { AuditTrail } from './auditTrail';

/**
 * Persistence service for managing all trading state in the database
 * Addresses gap PA-001: No persistence layer
 * 
 * This class extends AuditTrail to add position and balance persistence
 * while reusing the existing order/fill audit trail functionality.
 */
export class PersistenceService extends AuditTrail {
  constructor(dbPath?: string) {
    super(dbPath);
  }

  /**
   * Save a position
   */
  savePosition(position: Position): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO positions (
          token_id, size, average_price, updated_at
        ) VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        position.tokenId,
        position.size,
        position.averagePrice,
        Date.now()
      );

      logger.debug('Position persisted', { tokenId: position.tokenId });
    } catch (error) {
      logger.error('Failed to persist position', { 
        tokenId: position.tokenId, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM positions');
      const rows = stmt.all() as any[];

      return rows.map(row => ({
        tokenId: row.token_id,
        size: row.size,
        averagePrice: row.average_price,
      }));
    } catch (error) {
      logger.error('Failed to get positions', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Delete a position (when size is zero)
   */
  deletePosition(tokenId: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM positions WHERE token_id = ?');
      stmt.run(tokenId);
      logger.debug('Position deleted', { tokenId });
    } catch (error) {
      logger.error('Failed to delete position', { 
        tokenId, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Save balance state
   */
  saveBalance(balance: number, initialBalance: number, realizedPnl: number): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO balances (
          id, balance, initial_balance, realized_pnl, updated_at
        ) VALUES (1, ?, ?, ?, ?)
      `);

      stmt.run(
        String(balance),
        String(initialBalance),
        String(realizedPnl),
        Date.now()
      );

      logger.debug('Balance persisted', { balance, realizedPnl });
    } catch (error) {
      logger.error('Failed to persist balance', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get balance state
   */
  getBalance(): { balance: number; initialBalance: number; realizedPnl: number } | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM balances WHERE id = 1');
      const row = stmt.get() as any;

      if (!row) {
        return null;
      }

      return {
        balance: Number(row.balance),
        initialBalance: Number(row.initial_balance),
        realizedPnl: Number(row.realized_pnl),
      };
    } catch (error) {
      logger.error('Failed to get balance', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    super.close();
  }

  /**
   * Clear all state (for testing)
   */
  clearAllState(): void {
    try {
      // Delete in order to respect foreign key constraints
      // Fills reference orders, so delete fills first
      this.db.exec('DELETE FROM order_events');
      this.db.exec('DELETE FROM fills');
      this.db.exec('DELETE FROM orders');
      this.db.exec('DELETE FROM positions');
      this.db.exec('DELETE FROM balances');
      logger.info('All state cleared from database');
    } catch (error) {
      logger.error('Failed to clear state', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
