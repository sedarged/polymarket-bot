import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, closeDatabase } from '../src/utils/database';
import fs from 'fs';
import path from 'path';

describe('Database Utility - Audit Finding A-025', () => {
  const testDbPath = path.join(process.cwd(), 'data', 'test-audit.db');
  let db: ReturnType<typeof initializeDatabase>;

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (db) {
      try {
        closeDatabase(db);
      } catch (err) {
        // Database might already be closed
      }
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Database Initialization', () => {
    it('should create database file if it does not exist', () => {
      expect(fs.existsSync(testDbPath)).toBe(false);
      db = initializeDatabase({ path: testDbPath });
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should create parent directory if it does not exist', () => {
      const nestedPath = path.join(process.cwd(), 'data', 'nested', 'test-db.db');
      const parentDir = path.dirname(nestedPath);
      
      // Clean up first
      if (fs.existsSync(nestedPath)) {
        fs.unlinkSync(nestedPath);
      }
      if (fs.existsSync(parentDir)) {
        fs.rmSync(parentDir, { recursive: true });
      }

      expect(fs.existsSync(parentDir)).toBe(false);
      const nestedDb = initializeDatabase({ path: nestedPath });
      expect(fs.existsSync(parentDir)).toBe(true);
      expect(fs.existsSync(nestedPath)).toBe(true);

      closeDatabase(nestedDb);
      fs.unlinkSync(nestedPath);
      fs.rmSync(parentDir, { recursive: true });
    });

    it('should enable foreign keys', () => {
      db = initializeDatabase({ path: testDbPath });
      const result = db.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
    });

    it('should create orders table with correct schema', () => {
      db = initializeDatabase({ path: testDbPath });
      
      const tableInfo = db.prepare('PRAGMA table_info(orders)').all();
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('client_order_id');
      expect(columnNames).toContain('token_id');
      expect(columnNames).toContain('side');
      expect(columnNames).toContain('price');
      expect(columnNames).toContain('size');
      expect(columnNames).toContain('filled_size');
      expect(columnNames).toContain('remaining_size');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should create fills table with correct schema', () => {
      db = initializeDatabase({ path: testDbPath });
      
      const tableInfo = db.prepare('PRAGMA table_info(fills)').all();
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('order_id');
      expect(columnNames).toContain('token_id');
      expect(columnNames).toContain('side');
      expect(columnNames).toContain('price');
      expect(columnNames).toContain('size');
      expect(columnNames).toContain('fee');
      expect(columnNames).toContain('timestamp');
    });

    it('should create order_events table with correct schema', () => {
      db = initializeDatabase({ path: testDbPath });
      
      const tableInfo = db.prepare('PRAGMA table_info(order_events)').all();
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('order_id');
      expect(columnNames).toContain('event_type');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('details');
    });

    it('should create positions table with correct schema', () => {
      db = initializeDatabase({ path: testDbPath });
      
      const tableInfo = db.prepare('PRAGMA table_info(positions)').all();
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('token_id');
      expect(columnNames).toContain('size');
      expect(columnNames).toContain('average_price');
      expect(columnNames).toContain('updated_at');
    });

    it('should create balances table with correct schema', () => {
      db = initializeDatabase({ path: testDbPath });
      
      const tableInfo = db.prepare('PRAGMA table_info(balances)').all();
      const columnNames = tableInfo.map((col: any) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('balance');
      expect(columnNames).toContain('initial_balance');
      expect(columnNames).toContain('realized_pnl');
      expect(columnNames).toContain('updated_at');
    });

    it('should create all required indexes', () => {
      db = initializeDatabase({ path: testDbPath });
      
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
      const indexNames = indexes.map((idx: any) => idx.name);
      
      expect(indexNames).toContain('idx_orders_token_id');
      expect(indexNames).toContain('idx_orders_status');
      expect(indexNames).toContain('idx_orders_created_at');
      expect(indexNames).toContain('idx_fills_order_id');
      expect(indexNames).toContain('idx_fills_token_id');
      expect(indexNames).toContain('idx_fills_timestamp');
      expect(indexNames).toContain('idx_order_events_order_id');
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      db = initializeDatabase({ path: testDbPath });
    });

    it('should insert and retrieve order', () => {
      const order = {
        id: 'order-123',
        client_order_id: 'client-456',
        token_id: 'token-789',
        side: 'BUY',
        price: '0.55',
        size: '100',
        filled_size: '0',
        remaining_size: '100',
        status: 'OPEN',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      db.prepare(`
        INSERT INTO orders (id, client_order_id, token_id, side, price, size, filled_size, remaining_size, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        order.id,
        order.client_order_id,
        order.token_id,
        order.side,
        order.price,
        order.size,
        order.filled_size,
        order.remaining_size,
        order.status,
        order.created_at,
        order.updated_at
      );

      const retrieved = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      expect(retrieved).toMatchObject(order);
    });

    it('should insert and retrieve fill', () => {
      // First insert an order
      const orderId = 'order-123';
      db.prepare(`
        INSERT INTO orders (id, token_id, side, price, size, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, 'token-789', 'BUY', '0.55', '100', 'OPEN', Date.now());

      // Then insert a fill
      const fill = {
        order_id: orderId,
        token_id: 'token-789',
        side: 'BUY',
        price: '0.55',
        size: '50',
        fee: '0.01',
        timestamp: Date.now(),
      };

      const result = db.prepare(`
        INSERT INTO fills (order_id, token_id, side, price, size, fee, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        fill.order_id,
        fill.token_id,
        fill.side,
        fill.price,
        fill.size,
        fill.fee,
        fill.timestamp
      );

      expect(result.changes).toBe(1);

      const retrieved = db.prepare('SELECT * FROM fills WHERE order_id = ?').get(orderId);
      expect(retrieved).toMatchObject(fill);
    });

    it('should enforce foreign key constraint on fills', () => {
      const fill = {
        order_id: 'non-existent-order',
        token_id: 'token-789',
        side: 'BUY',
        price: '0.55',
        size: '50',
        timestamp: Date.now(),
      };

      expect(() => {
        db.prepare(`
          INSERT INTO fills (order_id, token_id, side, price, size, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          fill.order_id,
          fill.token_id,
          fill.side,
          fill.price,
          fill.size,
          fill.timestamp
        );
      }).toThrow();
    });

    it('should insert and retrieve order events', () => {
      // First insert an order
      const orderId = 'order-123';
      db.prepare(`
        INSERT INTO orders (id, token_id, side, price, size, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, 'token-789', 'BUY', '0.55', '100', 'OPEN', Date.now());

      // Then insert an event
      const event = {
        order_id: orderId,
        event_type: 'CREATED',
        timestamp: Date.now(),
        details: JSON.stringify({ source: 'test' }),
      };

      db.prepare(`
        INSERT INTO order_events (order_id, event_type, timestamp, details)
        VALUES (?, ?, ?, ?)
      `).run(event.order_id, event.event_type, event.timestamp, event.details);

      const retrieved = db.prepare('SELECT * FROM order_events WHERE order_id = ?').get(orderId);
      expect(retrieved).toMatchObject(event);
    });

    it('should query orders by token_id using index', () => {
      const tokenId = 'token-789';
      
      // Insert multiple orders
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO orders (id, token_id, side, price, size, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`order-${i}`, tokenId, 'BUY', '0.55', '100', 'OPEN', Date.now());
      }

      const orders = db.prepare('SELECT * FROM orders WHERE token_id = ?').all(tokenId);
      expect(orders).toHaveLength(5);
    });

    it('should query orders by status using index', () => {
      // Insert orders with different statuses
      db.prepare(`
        INSERT INTO orders (id, token_id, side, price, size, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('order-1', 'token-789', 'BUY', '0.55', '100', 'OPEN', Date.now());

      db.prepare(`
        INSERT INTO orders (id, token_id, side, price, size, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('order-2', 'token-789', 'BUY', '0.55', '100', 'FILLED', Date.now());

      const openOrders = db.prepare('SELECT * FROM orders WHERE status = ?').all('OPEN');
      expect(openOrders).toHaveLength(1);
      expect(openOrders[0].id).toBe('order-1');
    });
  });

  describe('Database Close', () => {
    it('should close database connection', () => {
      db = initializeDatabase({ path: testDbPath });
      expect(() => closeDatabase(db)).not.toThrow();
    });

    it('should not allow operations after close', () => {
      db = initializeDatabase({ path: testDbPath });
      closeDatabase(db);
      
      expect(() => {
        db.prepare('SELECT * FROM orders').all();
      }).toThrow();
    });
  });

  describe('Read-Only Mode', () => {
    it('should open database in read-only mode when specified', () => {
      // First create and populate database
      db = initializeDatabase({ path: testDbPath });
      db.prepare(`
        INSERT INTO orders (id, token_id, side, price, size, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('order-1', 'token-789', 'BUY', '0.55', '100', 'OPEN', Date.now());
      closeDatabase(db);

      // Now open in read-only mode
      db = initializeDatabase({ path: testDbPath, readonly: true });
      
      // Should be able to read
      const orders = db.prepare('SELECT * FROM orders').all();
      expect(orders).toHaveLength(1);

      // Should not be able to write
      expect(() => {
        db.prepare(`
          INSERT INTO orders (id, token_id, side, price, size, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('order-2', 'token-789', 'BUY', '0.55', '100', 'OPEN', Date.now());
      }).toThrow();
    });
  });
});
