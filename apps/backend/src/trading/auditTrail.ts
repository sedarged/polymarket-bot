import Database from 'better-sqlite3';
import { Order, Fill } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { initializeDatabase, closeDatabase } from '../utils/database';

/**
 * Audit trail service for storing and querying order/fill history
 */
export class AuditTrail {
  protected db: Database.Database;

  constructor(dbPath?: string) {
    this.db = initializeDatabase({ path: dbPath });
  }

  /**
   * Record an order in the audit trail
   */
  recordOrder(order: Order): void {
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

      logger.debug('Order recorded to audit trail', { orderId: order.orderId });
    } catch (error) {
      logger.error('Failed to record order to audit trail', { 
        orderId: order.orderId, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Record a fill in the audit trail
   */
  recordFill(fill: Fill): void {
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

      logger.debug('Fill recorded to audit trail', { orderId: fill.orderId });
    } catch (error) {
      logger.error('Failed to record fill to audit trail', { 
        orderId: fill.orderId, 
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
      logger.error('Failed to query orders', { 
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
      logger.error('Failed to query fills', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get order lifecycle events
   */
  getOrderEvents(orderId: string): Array<{
    eventType: string;
    timestamp: number;
    details: string | null;
  }> {
    try {
      const stmt = this.db.prepare(`
        SELECT event_type, timestamp, details
        FROM order_events
        WHERE order_id = ?
        ORDER BY timestamp ASC
      `);

      const rows = stmt.all(orderId) as any[];

      return rows.map(row => ({
        eventType: row.event_type,
        timestamp: row.timestamp,
        details: row.details,
      }));
    } catch (error) {
      logger.error('Failed to query order events', { 
        orderId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get trading statistics
   */
  getStatistics(filters?: {
    tokenId?: string;
    startTime?: number;
    endTime?: number;
  }): {
    totalOrders: number;
    totalFills: number;
    totalVolume: number;
    ordersByStatus: Record<string, number>;
  } {
    try {
      let whereClause = '1=1';
      const params: (string | number)[] = [];

      if (filters?.tokenId) {
        whereClause += ' AND token_id = ?';
        params.push(filters.tokenId);
      }

      if (filters?.startTime) {
        whereClause += ' AND created_at >= ?';
        params.push(filters.startTime);
      }

      if (filters?.endTime) {
        whereClause += ' AND created_at <= ?';
        params.push(filters.endTime);
      }

      // Total orders
      const totalOrdersStmt = this.db.prepare(
        `SELECT COUNT(*) as count FROM orders WHERE ${whereClause}`
      );
      const totalOrders = (totalOrdersStmt.get(...params) as any).count;

      // Orders by status
      const ordersByStatusStmt = this.db.prepare(
        `SELECT status, COUNT(*) as count FROM orders WHERE ${whereClause} GROUP BY status`
      );
      const statusRows = ordersByStatusStmt.all(...params) as any[];
      const ordersByStatus: Record<string, number> = {};
      for (const row of statusRows) {
        ordersByStatus[row.status] = row.count;
      }

      // Total fills and volume
      let fillWhereClause = '1=1';
      const fillParams: (string | number)[] = [];

      if (filters?.tokenId) {
        fillWhereClause += ' AND token_id = ?';
        fillParams.push(filters.tokenId);
      }

      if (filters?.startTime) {
        fillWhereClause += ' AND timestamp >= ?';
        fillParams.push(filters.startTime);
      }

      if (filters?.endTime) {
        fillWhereClause += ' AND timestamp <= ?';
        fillParams.push(filters.endTime);
      }

      const fillStatsStmt = this.db.prepare(
        `SELECT 
          COUNT(*) as count,
          SUM(CAST(size as REAL)) as volume
         FROM fills 
         WHERE ${fillWhereClause}`
      );
      const fillStats = fillStatsStmt.get(...fillParams) as any;

      return {
        totalOrders,
        totalFills: fillStats.count || 0,
        totalVolume: fillStats.volume || 0,
        ordersByStatus,
      };
    } catch (error) {
      logger.error('Failed to get statistics', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    closeDatabase(this.db);
  }
}
