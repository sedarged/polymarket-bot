/**
 * Signal Catalog Implementation
 * 
 * Manages versioned signal/feature definitions for reproducible ML workflows.
 * Provides registry of signal schemas with metadata for tracking provenance.
 * 
 * Features:
 * - Versioned signal definitions
 * - Signal metadata (owner, feature group, input fields)
 * - Query by name, version, feature group
 * - Immutable once created (new versions for changes)
 * 
 * Design follows REPORTS/LEARNING_SYSTEM.md specification.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import type { SignalDefinition, SignalDefinitionRow } from './types';

export interface SignalCatalogConfig {
  path?: string;
  readonly?: boolean;
}

export interface SignalQueryOptions {
  signalName?: string;
  featureGroup?: 'market' | 'liquidity' | 'volatility' | 'strategy' | 'risk';
  version?: string;
}

export class SignalCatalog {
  private db: Database.Database;

  constructor(config: SignalCatalogConfig = {}) {
    const dbPath = config.path || path.join(process.cwd(), 'data', 'signals.db');
    
    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created signal catalog directory', { dir });
    }
    
    this.db = new Database(dbPath, { readonly: config.readonly ?? false });
    logger.info('Signal catalog initialized', { path: dbPath });

    if (!config.readonly) {
      this.initializeSchema();
    }
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // Create signal definitions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signal_definitions (
        signal_name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        feature_group TEXT NOT NULL,
        input_fields TEXT NOT NULL,
        output_type TEXT NOT NULL,
        default_window TEXT,
        owner TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (signal_name, version)
      )
    `);

    // Indexes for efficient queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_signals_name 
      ON signal_definitions(signal_name)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_signals_group 
      ON signal_definitions(feature_group)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_signals_owner 
      ON signal_definitions(owner)
    `);

    logger.info('Signal catalog schema initialized');
  }

  /**
   * Register a new signal definition
   * Creates a new version - existing versions are immutable
   */
  registerSignal(definition: Omit<SignalDefinition, 'createdAt' | 'updatedAt'>): void {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO signal_definitions (
        signal_name, version, description, feature_group, input_fields,
        output_type, default_window, owner, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        definition.signalName,
        definition.version,
        definition.description,
        definition.featureGroup,
        JSON.stringify(definition.inputFields),
        definition.outputType,
        definition.defaultWindow || null,
        definition.owner,
        now,
        now
      );

      logger.info('Signal registered', {
        signalName: definition.signalName,
        version: definition.version,
        featureGroup: definition.featureGroup,
      });
    } catch (error) {
      // If signal+version already exists, this is an error
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        logger.warn('Signal version already exists', {
          signalName: definition.signalName,
          version: definition.version,
        });
        throw new Error(
          `Signal ${definition.signalName} version ${definition.version} already exists`
        );
      }
      throw error;
    }
  }

  /**
   * Get signal definition by name and version
   */
  getSignal(signalName: string, version: string): SignalDefinition | null {
    const stmt = this.db.prepare(`
      SELECT * FROM signal_definitions 
      WHERE signal_name = ? AND version = ?
    `);

    const row = stmt.get(signalName, version) as SignalDefinitionRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToDefinition(row);
  }

  /**
   * Get latest version of a signal
   * Uses semver-aware comparison for correct version ordering
   */
  getLatestSignal(signalName: string): SignalDefinition | null {
    const stmt = this.db.prepare(`
      SELECT * FROM signal_definitions 
      WHERE signal_name = ?
    `);

    const rows = stmt.all(signalName) as SignalDefinitionRow[];

    if (rows.length === 0) {
      return null;
    }

    // Sort by semver in JavaScript to handle versions like 10.0.0 vs 2.0.0 correctly
    rows.sort((a, b) => {
      const aParts = a.version.split('.').map(Number);
      const bParts = b.version.split('.').map(Number);
      
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) {
          return bVal - aVal; // Descending order
        }
      }
      return 0;
    });

    return this.rowToDefinition(rows[0]);
  }

  /**
   * List all versions of a signal
   */
  listSignalVersions(signalName: string): SignalDefinition[] {
    const stmt = this.db.prepare(`
      SELECT * FROM signal_definitions 
      WHERE signal_name = ? 
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(signalName) as SignalDefinitionRow[];
    return rows.map((row) => this.rowToDefinition(row));
  }

  /**
   * Query signals with filters
   */
  querySignals(options: SignalQueryOptions = {}): SignalDefinition[] {
    let sql = 'SELECT * FROM signal_definitions WHERE 1=1';
    const params: unknown[] = [];

    if (options.signalName) {
      sql += ' AND signal_name = ?';
      params.push(options.signalName);
    }

    if (options.featureGroup) {
      sql += ' AND feature_group = ?';
      params.push(options.featureGroup);
    }

    if (options.version) {
      sql += ' AND version = ?';
      params.push(options.version);
    }

    sql += ' ORDER BY signal_name, created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as SignalDefinitionRow[];

    return rows.map((row) => this.rowToDefinition(row));
  }

  /**
   * List all signal names (unique)
   */
  listSignalNames(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT signal_name 
      FROM signal_definitions 
      ORDER BY signal_name
    `);

    const rows = stmt.all() as Array<{ signal_name: string }>;
    return rows.map((row) => row.signal_name);
  }

  /**
   * Get catalog stats for monitoring
   */
  getStats(): {
    totalSignals: number;
    totalVersions: number;
    signalsByGroup: Record<string, number>;
  } {
    const totalVersionsStmt = this.db.prepare('SELECT COUNT(*) as count FROM signal_definitions');
    const totalVersionsRow = totalVersionsStmt.get() as { count: number };

    const totalSignalsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT signal_name) as count FROM signal_definitions
    `);
    const totalSignalsRow = totalSignalsStmt.get() as { count: number };

    const groupStmt = this.db.prepare(`
      SELECT feature_group, COUNT(DISTINCT signal_name) as count 
      FROM signal_definitions 
      GROUP BY feature_group
    `);
    const groupRows = groupStmt.all() as Array<{ feature_group: string; count: number }>;
    
    const signalsByGroup: Record<string, number> = {};
    for (const row of groupRows) {
      signalsByGroup[row.feature_group] = row.count;
    }

    return {
      totalSignals: totalSignalsRow.count,
      totalVersions: totalVersionsRow.count,
      signalsByGroup,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Signal catalog closed');
  }

  /**
   * Convert database row to SignalDefinition
   */
  private rowToDefinition(row: SignalDefinitionRow): SignalDefinition {
    return {
      signalName: row.signal_name,
      description: row.description,
      featureGroup: row.feature_group as SignalDefinition['featureGroup'],
      inputFields: JSON.parse(row.input_fields) as string[],
      outputType: row.output_type as 'number' | 'boolean' | 'string',
      defaultWindow: row.default_window || undefined,
      version: row.version,
      owner: row.owner,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
