import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

export interface DatabaseConfig {
  path?: string;
  readonly?: boolean;
}

/**
 * Initialize the audit trail database with schema
 */
export function initializeDatabase(config: DatabaseConfig = {}): Database.Database {
  const dbPath = config.path || path.join(process.cwd(), 'data', 'audit.db');
  
  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info('Created database directory', { dir });
  }
  
  const db = new Database(dbPath, { readonly: config.readonly ?? false });

  logger.info('Initializing audit trail database', { path: dbPath });

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      client_order_id TEXT,
      token_id TEXT NOT NULL,
      side TEXT NOT NULL,
      price TEXT NOT NULL,
      size TEXT NOT NULL,
      filled_size TEXT DEFAULT '0',
      remaining_size TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    )
  `);

  // Create index on token_id for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_token_id ON orders(token_id)
  `);

  // Create index on status for filtering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)
  `);

  // Create index on created_at for time-based queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)
  `);

  // Create fills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS fills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      side TEXT NOT NULL,
      price TEXT NOT NULL,
      size TEXT NOT NULL,
      fee TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Create index on order_id for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fills_order_id ON fills(order_id)
  `);

  // Create index on token_id for market-specific queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fills_token_id ON fills(token_id)
  `);

  // Create index on timestamp for time-based queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fills_timestamp ON fills(timestamp)
  `);

  // Create order_events table for lifecycle tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      details TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Create index on order_id for event history queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id)
  `);

  // Create positions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      token_id TEXT PRIMARY KEY,
      size TEXT NOT NULL,
      average_price TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create balances table
  db.exec(`
    CREATE TABLE IF NOT EXISTS balances (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance TEXT NOT NULL,
      initial_balance TEXT NOT NULL,
      realized_pnl TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  logger.info('Audit trail database initialized successfully');

  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(db: Database.Database): void {
  db.close();
  logger.info('Audit trail database closed');
}
