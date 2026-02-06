/**
 * Event Store Implementation
 * 
 * Provides append-only, timestamped, partitioned storage for learning system events.
 * Events are immutable once written and partitioned by market_id + date for efficient queries.
 * 
 * Features:
 * - Append-only writes (no updates/deletes)
 * - Automatic timestamping (receivedAt)
 * - Partitioning by market + date
 * - Query by time range, market, event type
 * - Schema versioning support
 * 
 * Design follows REPORTS/LEARNING_SYSTEM.md specification.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type {
  EventEnvelope,
  EventRow,
  EventType,
  EventSource,
} from './types';

export interface EventStoreConfig {
  path?: string;
  readonly?: boolean;
}

export interface QueryOptions {
  startDate?: string; // ISO timestamp
  endDate?: string; // ISO timestamp
  marketId?: string;
  eventType?: EventType;
  limit?: number;
  offset?: number;
}

export class EventStore {
  private db: Database.Database;

  constructor(config: EventStoreConfig = {}) {
    const dbPath = config.path || path.join(process.cwd(), 'data', 'events.db');
    
    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created event store directory', { dir });
    }
    
    this.db = new Database(dbPath, { readonly: config.readonly ?? false });
    logger.info('Event store initialized', { path: dbPath });

    if (!config.readonly) {
      this.initializeSchema();
    }
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    // Enable foreign keys and WAL mode for better concurrency
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // Create events table with partitioning support
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        event_version INTEGER NOT NULL DEFAULT 1,
        occurred_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        market_id TEXT NOT NULL,
        source TEXT NOT NULL,
        payload TEXT NOT NULL,
        partition_key TEXT NOT NULL
      )
    `);

    // Indexes for efficient queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_partition 
      ON events(partition_key)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_market_time 
      ON events(market_id, occurred_at)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_type 
      ON events(event_type)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_occurred_at 
      ON events(occurred_at)
    `);

    logger.info('Event store schema initialized');
  }

  /**
   * Write an event to the store
   * Events are immutable once written (append-only)
   */
  writeEvent<T>(
    eventType: EventType,
    marketId: string,
    source: EventSource,
    payload: T,
    occurredAt?: string,
    eventVersion: number = 1
  ): string {
    const eventId = uuidv4();
    const now = new Date().toISOString();
    const occurred = occurredAt || now;
    
    // Create partition key: marketId + date (YYYY-MM-DD)
    const partitionKey = `${marketId}_${occurred.split('T')[0]}`;

    const stmt = this.db.prepare(`
      INSERT INTO events (
        event_id, event_type, event_version, occurred_at, received_at,
        market_id, source, payload, partition_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        eventId,
        eventType,
        eventVersion,
        occurred,
        now,
        marketId,
        source,
        JSON.stringify(payload),
        partitionKey
      );

      logger.debug('Event written', {
        eventId,
        eventType,
        marketId,
        partitionKey,
      });

      return eventId;
    } catch (error) {
      logger.error('Failed to write event', {
        eventId,
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Query events with flexible filtering
   */
  queryEvents(options: QueryOptions = {}): EventEnvelope[] {
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params: unknown[] = [];

    if (options.startDate) {
      sql += ' AND occurred_at >= ?';
      params.push(options.startDate);
    }

    if (options.endDate) {
      sql += ' AND occurred_at <= ?';
      params.push(options.endDate);
    }

    if (options.marketId) {
      sql += ' AND market_id = ?';
      params.push(options.marketId);
    }

    if (options.eventType) {
      sql += ' AND event_type = ?';
      params.push(options.eventType);
    }

    sql += ' ORDER BY occurred_at ASC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EventRow[];

    return rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type as EventType,
      eventVersion: row.event_version,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      marketId: row.market_id,
      source: row.source as EventSource,
      payload: JSON.parse(row.payload),
    }));
  }

  /**
   * Get event count for monitoring and stats
   */
  getEventCount(options: QueryOptions = {}): number {
    let sql = 'SELECT COUNT(*) as count FROM events WHERE 1=1';
    const params: unknown[] = [];

    if (options.startDate) {
      sql += ' AND occurred_at >= ?';
      params.push(options.startDate);
    }

    if (options.endDate) {
      sql += ' AND occurred_at <= ?';
      params.push(options.endDate);
    }

    if (options.marketId) {
      sql += ' AND market_id = ?';
      params.push(options.marketId);
    }

    if (options.eventType) {
      sql += ' AND event_type = ?';
      params.push(options.eventType);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): EventEnvelope | null {
    const stmt = this.db.prepare('SELECT * FROM events WHERE event_id = ?');
    const row = stmt.get(eventId) as EventRow | undefined;

    if (!row) {
      return null;
    }

    return {
      eventId: row.event_id,
      eventType: row.event_type as EventType,
      eventVersion: row.event_version,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      marketId: row.market_id,
      source: row.source as EventSource,
      payload: JSON.parse(row.payload),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Event store closed');
  }

  /**
   * Get database stats for monitoring
   */
  getStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    dateRange: { earliest: string | null; latest: string | null };
  } {
    const totalEvents = this.getEventCount();

    // Events by type
    const typeStmt = this.db.prepare(`
      SELECT event_type, COUNT(*) as count 
      FROM events 
      GROUP BY event_type
    `);
    const typeRows = typeStmt.all() as Array<{ event_type: string; count: number }>;
    const eventsByType: Record<string, number> = {};
    for (const row of typeRows) {
      eventsByType[row.event_type] = row.count;
    }

    // Date range
    const rangeStmt = this.db.prepare(`
      SELECT 
        MIN(occurred_at) as earliest,
        MAX(occurred_at) as latest
      FROM events
    `);
    const range = rangeStmt.get() as { earliest: string | null; latest: string | null };

    return {
      totalEvents,
      eventsByType,
      dateRange: range,
    };
  }
}
