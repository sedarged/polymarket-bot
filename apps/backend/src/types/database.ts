/**
 * Database row types for better-sqlite3
 * 
 * These types replace unsafe `as any` casts with proper TypeScript types.
 * Addresses Audit Finding A-005 (Unsafe Type Coercion).
 * 
 * better-sqlite3 returns database rows as plain objects with properties
 * matching the column names. All numeric types in SQLite are returned as
 * JavaScript numbers, and all TEXT types are returned as strings.
 */

/**
 * Order table row type
 */
export interface OrderRow {
  id: string;
  client_order_id: string | null;
  token_id: string;
  side: string;
  price: string;
  size: string;
  filled_size: string;
  remaining_size: string;
  status: string;
  created_at: number;
  updated_at: number | null;
}

/**
 * Fill table row type
 */
export interface FillRow {
  id: number;
  order_id: string;
  token_id: string;
  side: string;
  price: string;
  size: string;
  fee: string | null;
  timestamp: number;
}

/**
 * Order event table row type
 */
export interface OrderEventRow {
  id: number;
  order_id: string;
  event_type: string;
  timestamp: number;
  details: string | null;
}

/**
 * Position table row type
 */
export interface PositionRow {
  token_id: string;
  size: string;
  average_price: string;
  updated_at: number;
}

/**
 * Balance table row type
 */
export interface BalanceRow {
  id: number;
  balance: string;
  initial_balance: string;
  realized_pnl: string;
  updated_at: number;
}

/**
 * Result type for COUNT(*) queries
 */
export interface StatCountResult {
  count: number;
}

/**
 * Result type for status grouping queries
 */
export interface StatusCountResult {
  status: string;
  count: number;
}

/**
 * Result type for fill statistics queries
 */
export interface FillStatsResult {
  count: number | null;
  volume: number | null;
}
