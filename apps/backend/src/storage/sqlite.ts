import Database from 'better-sqlite3';
import { Fill, LogEntry, Order, PnlSnapshot } from '../types';
import { config } from '../config';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

export class SqliteStore {
  private db: InstanceType<typeof Database>;

  constructor() {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    this.db = new Database(config.databasePath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL,
        token_id TEXT,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        live INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fills (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        market_id TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        fee REAL NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pnl_snapshots (
        timestamp TEXT PRIMARY KEY,
        total_pnl REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        unrealized_pnl REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS errors (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT,
        timestamp TEXT NOT NULL
      );
    `);
  }

  upsertOrder(order: Order): void {
    const stmt = this.db.prepare(`
      INSERT INTO orders (id, market_id, token_id, side, price, size, status, created_at, updated_at, live)
      VALUES (@id, @marketId, @tokenId, @side, @price, @size, @status, @createdAt, @updatedAt, @live)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at,
        price = excluded.price,
        size = excluded.size,
        live = excluded.live
    `);
    stmt.run({
      id: order.id,
      marketId: order.marketId,
      tokenId: order.tokenId ?? null,
      side: order.side,
      price: order.price,
      size: order.size,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      live: order.live ? 1 : 0,
    });
  }

  insertFill(fill: Fill): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO fills (id, order_id, market_id, side, price, size, fee, timestamp)
      VALUES (@id, @orderId, @marketId, @side, @price, @size, @fee, @timestamp)
    `);
    stmt.run({
      id: fill.id,
      orderId: fill.orderId,
      marketId: fill.marketId,
      side: fill.side,
      price: fill.price,
      size: fill.size,
      fee: fill.fee,
      timestamp: fill.timestamp,
    });
  }

  insertPnlSnapshot(snapshot: PnlSnapshot): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pnl_snapshots (timestamp, total_pnl, realized_pnl, unrealized_pnl)
      VALUES (@timestamp, @totalPnl, @realizedPnl, @unrealizedPnl)
    `);
    stmt.run(snapshot);
  }

  insertLog(entry: LogEntry): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO errors (id, level, message, context, timestamp)
      VALUES (@id, @level, @message, @context, @timestamp)
    `);
    stmt.run({
      id: entry.id,
      level: entry.level,
      message: entry.message,
      context: entry.context ? JSON.stringify(entry.context) : null,
      timestamp: entry.timestamp,
    });
  }

  listOrders(): Order[] {
    return this.db
      .prepare('SELECT * FROM orders ORDER BY created_at DESC')
      .all()
      .map((row: any) => ({
        id: row.id,
        marketId: row.market_id,
        tokenId: row.token_id ?? undefined,
        side: row.side,
        price: row.price,
        size: row.size,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        live: Boolean(row.live),
      }));
  }

  listFills(): Fill[] {
    return this.db
      .prepare('SELECT * FROM fills ORDER BY timestamp DESC')
      .all()
      .map((row: any) => ({
        id: row.id,
        orderId: row.order_id,
        marketId: row.market_id,
        side: row.side,
        price: row.price,
        size: row.size,
        fee: row.fee,
        timestamp: row.timestamp,
      }));
  }

  listPnlSnapshots(): PnlSnapshot[] {
    return this.db
      .prepare('SELECT * FROM pnl_snapshots ORDER BY timestamp DESC')
      .all()
      .map((row: any) => ({
        timestamp: row.timestamp,
        totalPnl: row.total_pnl,
        realizedPnl: row.realized_pnl,
        unrealizedPnl: row.unrealized_pnl,
      }));
  }

  listLogs(limit = 100): LogEntry[] {
    return this.db
      .prepare('SELECT * FROM errors ORDER BY timestamp DESC LIMIT ?')
      .all(limit)
      .map((row: any) => ({
        id: row.id,
        level: row.level,
        message: row.message,
        context: row.context ? JSON.parse(row.context) : undefined,
        timestamp: row.timestamp,
      }));
  }
}
