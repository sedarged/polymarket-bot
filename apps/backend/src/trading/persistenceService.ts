import path from 'path';
import fs from 'fs';
import { Position } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { AuditTrail } from './auditTrail';
import { PositionRow, BalanceRow } from '../types/database';

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
      const rows = stmt.all() as PositionRow[];

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
      const row = stmt.get() as BalanceRow | undefined;

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
   * Log a general audit event to the audit_log table (GAP-032).
   * Unlike recordOrderEvent (which is order-scoped), this accepts any key/value data.
   */
  logAuditEvent(eventType: string, data?: Record<string, unknown>): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO audit_log (event_type, timestamp, data)
        VALUES (?, ?, ?)
      `);
      stmt.run(eventType, Date.now(), data ? JSON.stringify(data) : null);
      logger.debug('Audit event logged', { eventType });
    } catch (error) {
      logger.error('Failed to log audit event', {
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw — audit logging failures must never interrupt trading flow
    }
  }

  /**
   * Get audit log entries, optionally filtered by event type (GAP-032).
   */
  getAuditLog(filters?: {
    eventType?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Array<{ id: number; eventType: string; timestamp: number; data: Record<string, unknown> | null }> {
    try {
      let query = 'SELECT id, event_type, timestamp, data FROM audit_log WHERE 1=1';
      const params: (string | number)[] = [];
      if (filters?.eventType) {
        query += ' AND event_type = ?';
        params.push(filters.eventType);
      }
      if (filters?.startTime) {
        query += ' AND timestamp >= ?';
        params.push(filters.startTime);
      }
      if (filters?.endTime) {
        query += ' AND timestamp <= ?';
        params.push(filters.endTime);
      }
      query += ' ORDER BY timestamp DESC, id DESC';
      if (filters?.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }
      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as Array<{ id: number; event_type: string; timestamp: number; data: string | null }>;
      return rows.map(r => ({
        id: r.id,
        eventType: r.event_type,
        timestamp: r.timestamp,
        data: r.data ? JSON.parse(r.data) : null,
      }));
    } catch (error) {
      logger.error('Failed to query audit log', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Create a full backup of the current database to destPath (GAP-032).
   * Uses better-sqlite3's online backup API — safe while the DB is in use.
   * Returns the resolved destination path.
   */
  async createBackup(destPath: string): Promise<string> {
    const resolved = path.resolve(destPath);
    // Ensure parent directory exists
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    try {
      // better-sqlite3 backup() returns a Promise — await it so callers see a complete file
      await this.db.backup(resolved);
      logger.info('Database backup created', { destPath: resolved });
      return resolved;
    } catch (error) {
      logger.error('Failed to create database backup', {
        destPath: resolved,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Restore all tables from a backup database file (GAP-032).
   * Clears current state and replaces it with the backup contents atomically.
   * WARNING: This is destructive — all current state will be replaced.
   */
  restoreFromBackup(srcPath: string): void {
    const resolved = path.resolve(srcPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Backup file not found: ${resolved}`);
    }
    // Validate path to prevent SQL injection via special characters (null bytes, etc.)
    if (resolved.includes('\0')) {
      throw new Error('Invalid backup path: path must not contain null bytes');
    }
    const escapedResolved = resolved.replace(/'/g, "''");
    try {
      // Use ATTACH + INSERT SELECT inside a transaction for atomicity
      this.db.exec(`ATTACH DATABASE '${escapedResolved}' AS backup_db`);
      try {
        const restore = this.db.transaction(() => {
          // Delete in foreign-key-safe order
          this.db.exec('DELETE FROM audit_log');
          this.db.exec('DELETE FROM order_events');
          this.db.exec('DELETE FROM fills');
          this.db.exec('DELETE FROM orders');
          this.db.exec('DELETE FROM positions');
          this.db.exec('DELETE FROM balances');
          // Copy from backup
          this.db.exec('INSERT OR IGNORE INTO orders SELECT * FROM backup_db.orders');
          this.db.exec('INSERT OR IGNORE INTO fills SELECT * FROM backup_db.fills');
          this.db.exec('INSERT OR IGNORE INTO order_events SELECT * FROM backup_db.order_events');
          this.db.exec('INSERT OR IGNORE INTO positions SELECT * FROM backup_db.positions');
          this.db.exec('INSERT OR IGNORE INTO balances SELECT * FROM backup_db.balances');
          this.db.exec('INSERT OR IGNORE INTO audit_log SELECT * FROM backup_db.audit_log');
        });
        restore();
        logger.info('Database restored from backup', { srcPath: resolved });
      } finally {
        // Always attempt to detach the backup database, even on failure
        try {
          this.db.exec('DETACH DATABASE backup_db');
        } catch (detachErr) {
          logger.warn('Failed to detach backup database during cleanup', {
            error: detachErr instanceof Error ? detachErr.message : String(detachErr),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to restore from backup', {
        srcPath: resolved,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
