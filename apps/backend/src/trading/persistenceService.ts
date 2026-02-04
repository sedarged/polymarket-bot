import Database from 'better-sqlite3';
import { Order, Fill, Position } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { initializeDatabase, closeDatabase } from '../utils/database';

/**
 * Persistence service for managing all trading state in the database
 * Addresses gap PA-001: No persistence layer
 */
export class PersistenceService {
  private db: Database.Database;

  constructor(dbPath?: string) {
    this.db = initializeDatabase({ path: dbPath });
  }

  /**
   * Save or update an order
   */
  saveOrder(order: Order): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO orders (
          id, client_order_id, token_id, side, price, size, 
          filled_size, remaining_size, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        order.orderId,
        order.clientOrderId || null,
        order.tokenId,
        order.side,
        order.price,
        order.size,
        order.filledSize || '0',
        order.remainingSize || order.size,
        order.status,
        order.createdAt,
        Date.now()
      );

      logger.debug('Order persisted', { orderId: order.orderId });
    } catch (error) {
      logger.error('Failed to persist order', { 
        orderId: order.orderId, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get all orders, optionally filtered
   */
  getOrders(filters?: {
    tokenId?: string;
    status?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Order[] {
    try {
      let query = 'SELECT * FROM orders WHERE 1=1';
      const params: (string | number)[] = [];

      if (filters?.tokenId) {
        query += ' AND token_id = ?';
        params.push(filters.tokenId);
      }

      if (filters?.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }

      if (filters?.startTime) {
        query += ' AND created_at >= ?';
        params.push(filters.startTime);
      }

      if (filters?.endTime) {
        query += ' AND created_at <= ?';
        params.push(filters.endTime);
      }

      query += ' ORDER BY created_at DESC';

      if (filters?.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => ({
        orderId: row.id,
        clientOrderId: row.client_order_id,
        tokenId: row.token_id,
        side: row.side as 'BUY' | 'SELL',
        price: row.price,
        size: row.size,
        status: row.status as 'OPEN' | 'PARTIALLY_FILLED' | 'MATCHED' | 'CANCELLED',
        createdAt: row.created_at,
        filledSize: row.filled_size,
        remainingSize: row.remaining_size,
      }));
    } catch (error) {
      logger.error('Failed to get orders', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Save a fill
   */
  saveFill(fill: Fill): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO fills (
          order_id, token_id, side, price, size, fee, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        fill.orderId,
        fill.tokenId,
        fill.side,
        fill.price,
        fill.size,
        fill.fee || null,
        fill.timestamp
      );

      logger.debug('Fill persisted', { orderId: fill.orderId });
    } catch (error) {
      logger.error('Failed to persist fill', { 
        orderId: fill.orderId, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get fills for a specific order or token
   */
  getFills(filters?: {
    orderId?: string;
    tokenId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Fill[] {
    try {
      let query = 'SELECT * FROM fills WHERE 1=1';
      const params: (string | number)[] = [];

      if (filters?.orderId) {
        query += ' AND order_id = ?';
        params.push(filters.orderId);
      }

      if (filters?.tokenId) {
        query += ' AND token_id = ?';
        params.push(filters.tokenId);
      }

      if (filters?.startTime) {
        query += ' AND timestamp >= ?';
        params.push(filters.startTime);
      }

      if (filters?.endTime) {
        query += ' AND timestamp <= ?';
        params.push(filters.endTime);
      }

      query += ' ORDER BY timestamp DESC';

      if (filters?.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => ({
        orderId: row.order_id,
        tokenId: row.token_id,
        side: row.side as 'BUY' | 'SELL',
        price: row.price,
        size: row.size,
        timestamp: row.timestamp,
        fee: row.fee,
        fillId: String(row.id),
      }));
    } catch (error) {
      logger.error('Failed to get fills', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
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
   * Record an order lifecycle event
   */
  recordOrderEvent(orderId: string, eventType: string, details?: string): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO order_events (order_id, event_type, timestamp, details)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(orderId, eventType, Date.now(), details || null);

      logger.debug('Order event recorded', { orderId, eventType });
    } catch (error) {
      logger.error('Failed to record order event', { 
        orderId, 
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw here - event recording failures shouldn't break order flow
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    closeDatabase(this.db);
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
