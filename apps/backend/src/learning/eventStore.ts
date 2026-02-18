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
import crypto from 'crypto';
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
        partition_key TEXT NOT NULL,
        dedupe_key TEXT
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

    // Migration: add dedupe_key column if the DB predates this field (GAP-021).
    // Used for idempotent writes so retries do not create duplicate events.
    this.ensureDedupeKeySupport();

    logger.info('Event store schema initialized');
  }

  /**
   * Ensure `dedupe_key` exists and is uniquely indexed when present.
   * This function is safe to call on new and existing databases.
   */
  private ensureDedupeKeySupport(): void {
    try {
      const cols = this.db
        .prepare(`PRAGMA table_info(events)`)
        .all() as Array<{ name: string }>;
      const hasDedupeKey = cols.some((c) => c.name === 'dedupe_key');

      if (!hasDedupeKey) {
        this.db.exec(`ALTER TABLE events ADD COLUMN dedupe_key TEXT`);
        logger.info('Event store migrated: added dedupe_key column');
      }

      // Partial unique index: only enforces uniqueness when dedupe_key is non-null.
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedupe_key
        ON events(dedupe_key)
        WHERE dedupe_key IS NOT NULL
      `);
    } catch (error) {
      logger.error('Failed to ensure dedupe_key support in event store', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Compute a stable SHA-256 hash for payloads to help form idempotency keys.
   * Note: This uses JSON.stringify, so callers should provide stable key order
   * if they need cross-process determinism.
   */
  static hashPayload(payload: unknown): string {
    const raw = JSON.stringify(payload);
    return crypto.createHash('sha256').update(raw).digest('hex');
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
        market_id, source, payload, partition_key, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        partitionKey,
        null
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
   * Write one or more events idempotently using `dedupe_key`.
   *
   * - Uses `INSERT OR IGNORE` so duplicates (same dedupe_key) are ignored.
   * - Writes are executed inside a single transaction for throughput.
   */
  writeEventsIdempotent(
    events: Array<{
      eventType: EventType;
      marketId: string;
      source: EventSource;
      payload: unknown;
      occurredAt?: string;
      eventVersion?: number;
      dedupeKey?: string;
    }>
  ): { inserted: number; deduped: number } {
    if (events.length === 0) {
      return { inserted: 0, deduped: 0 };
    }

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO events (
        event_id, event_type, event_version, occurred_at, received_at,
        market_id, source, payload, partition_key, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const runTxn = this.db.transaction((batch) => {
      let inserted = 0;
      let deduped = 0;
      const receivedAt = new Date().toISOString();

      for (const e of batch as typeof events) {
        const eventId = uuidv4();
        const occurred = e.occurredAt || receivedAt;
        const partitionKey = `${e.marketId}_${occurred.split('T')[0]}`;
        const payloadJson = JSON.stringify(e.payload);

        const info = stmt.run(
          eventId,
          e.eventType,
          e.eventVersion ?? 1,
          occurred,
          receivedAt,
          e.marketId,
          e.source,
          payloadJson,
          partitionKey,
          e.dedupeKey ?? null
        );

        if (info.changes === 1) {
          inserted++;
        } else {
          deduped++;
        }
      }

      return { inserted, deduped };
    });

    try {
      return runTxn(events);
    } catch (error) {
      logger.error('Failed to write events idempotently', {
        count: events.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convenience wrapper for single-event idempotent writes.
   */
  writeEventIdempotent<T>(
    eventType: EventType,
    marketId: string,
    source: EventSource,
    payload: T,
    dedupeKey: string,
    occurredAt?: string,
    eventVersion: number = 1
  ): { inserted: boolean } {
    const result = this.writeEventsIdempotent([
      { eventType, marketId, source, payload, occurredAt, eventVersion, dedupeKey },
    ]);
    return { inserted: result.inserted === 1 };
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
