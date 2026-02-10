/**
 * Learning System Tests - Signal Catalog
 * 
 * Tests for versioned signal definition management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignalCatalog } from '../../src/learning/signalCatalog';
import type { SignalDefinition } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('SignalCatalog', () => {
  let catalog: SignalCatalog;
  const testDbPath = path.join(process.cwd(), 'data', 'test-signals.db');

  const deleteTestDbFiles = () => {
    const dbFiles = [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`];
    for (const filePath of dbFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  };

  beforeEach(() => {
    // Clean up any existing test database (main file + WAL/SHM sidecars)
    deleteTestDbFiles();
    
    catalog = new SignalCatalog({ path: testDbPath });
  });

  afterEach(() => {
    catalog.close();
    
    // Clean up test database (main file + WAL/SHM sidecars)
    deleteTestDbFiles();
  });

  describe('initialization', () => {
    it('should initialize with correct schema', () => {
      expect(catalog).toBeDefined();
      const stats = catalog.getStats();
      expect(stats.totalSignals).toBe(0);
    });
  });

  describe('registerSignal', () => {
    it('should register a new signal definition', () => {
      const definition: Omit<SignalDefinition, 'createdAt' | 'updatedAt'> = {
        signalName: 'mid_price',
        description: 'Midpoint between best bid and ask',
        featureGroup: 'market',
        inputFields: ['bestBid', 'bestAsk'],
        outputType: 'number',
        version: '1.0.0',
        owner: 'system',
      };

      catalog.registerSignal(definition);

      const signal = catalog.getSignal('mid_price', '1.0.0');
      expect(signal).toBeDefined();
      expect(signal?.signalName).toBe('mid_price');
      expect(signal?.version).toBe('1.0.0');
      expect(signal?.featureGroup).toBe('market');
    });

    it('should register multiple versions of same signal', () => {
      const v1: Omit<SignalDefinition, 'createdAt' | 'updatedAt'> = {
        signalName: 'spread_bps',
        description: 'Spread in basis points',
        featureGroup: 'liquidity',
        inputFields: ['bestBid', 'bestAsk'],
        outputType: 'number',
        version: '1.0.0',
        owner: 'system',
      };

      const v2: Omit<SignalDefinition, 'createdAt' | 'updatedAt'> = {
        ...v1,
        version: '2.0.0',
        description: 'Spread in basis points (improved calculation)',
      };

      catalog.registerSignal(v1);
      catalog.registerSignal(v2);

      const versions = catalog.listSignalVersions('spread_bps');
      expect(versions).toHaveLength(2);
      expect(versions.map((v) => v.version).sort()).toEqual(['1.0.0', '2.0.0']);
    });

    it('should prevent duplicate signal+version', () => {
      const definition: Omit<SignalDefinition, 'createdAt' | 'updatedAt'> = {
        signalName: 'test_signal',
        description: 'Test',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '1.0.0',
        owner: 'test',
      };

      catalog.registerSignal(definition);
      
      expect(() => {
        catalog.registerSignal(definition);
      }).toThrow('already exists');
    });

    it('should support different feature groups', () => {
      const featureGroups: Array<SignalDefinition['featureGroup']> = [
        'market',
        'liquidity',
        'volatility',
        'strategy',
        'risk',
      ];

      for (const group of featureGroups) {
        catalog.registerSignal({
          signalName: `${group}_signal`,
          description: 'Test signal',
          featureGroup: group,
          inputFields: [],
          outputType: 'number',
          version: '1.0.0',
          owner: 'test',
        });
      }

      const stats = catalog.getStats();
      expect(stats.totalSignals).toBe(5);
      expect(Object.keys(stats.signalsByGroup)).toHaveLength(5);
    });
  });

  describe('getSignal', () => {
    beforeEach(() => {
      catalog.registerSignal({
        signalName: 'test_signal',
        description: 'Test',
        featureGroup: 'market',
        inputFields: ['input1'],
        outputType: 'number',
        version: '1.0.0',
        owner: 'test',
      });
    });

    it('should retrieve signal by name and version', () => {
      const signal = catalog.getSignal('test_signal', '1.0.0');
      expect(signal).toBeDefined();
      expect(signal?.signalName).toBe('test_signal');
      expect(signal?.version).toBe('1.0.0');
    });

    it('should return null for non-existent signal', () => {
      const signal = catalog.getSignal('nonexistent', '1.0.0');
      expect(signal).toBeNull();
    });

    it('should return null for non-existent version', () => {
      const signal = catalog.getSignal('test_signal', '2.0.0');
      expect(signal).toBeNull();
    });
  });

  describe('getLatestSignal', () => {
    it('should retrieve latest version', () => {
      catalog.registerSignal({
        signalName: 'evolving_signal',
        description: 'V1',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '1.0.0',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'evolving_signal',
        description: 'V2',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '2.0.0',
        owner: 'test',
      });

      const latest = catalog.getLatestSignal('evolving_signal');
      expect(latest).toBeDefined();
      expect(latest?.version).toBe('2.0.0');
      expect(latest?.description).toBe('V2');
    });

    it('should handle semver ordering correctly (10.0.0 > 2.0.0)', () => {
      catalog.registerSignal({
        signalName: 'semver_test',
        description: 'V2',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '2.0.0',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'semver_test',
        description: 'V10',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '10.0.0',
        owner: 'test',
      });

      const latest = catalog.getLatestSignal('semver_test');
      expect(latest).toBeDefined();
      expect(latest?.version).toBe('10.0.0');
      expect(latest?.description).toBe('V10');
    });

    it('should return null for non-existent signal', () => {
      const latest = catalog.getLatestSignal('nonexistent');
      expect(latest).toBeNull();
    });
  });

  describe('querySignals', () => {
    beforeEach(() => {
      catalog.registerSignal({
        signalName: 'market_signal_1',
        description: 'Market signal 1',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '1.0.0',
        owner: 'team_a',
      });

      catalog.registerSignal({
        signalName: 'market_signal_2',
        description: 'Market signal 2',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'boolean',
        version: '1.0.0',
        owner: 'team_b',
      });

      catalog.registerSignal({
        signalName: 'liquidity_signal',
        description: 'Liquidity signal',
        featureGroup: 'liquidity',
        inputFields: [],
        outputType: 'number',
        version: '1.0.0',
        owner: 'team_a',
      });
    });

    it('should query all signals', () => {
      const signals = catalog.querySignals();
      expect(signals).toHaveLength(3);
    });

    it('should filter by featureGroup', () => {
      const signals = catalog.querySignals({ featureGroup: 'market' });
      expect(signals).toHaveLength(2);
      expect(signals.every((s) => s.featureGroup === 'market')).toBe(true);
    });

    it('should filter by signalName', () => {
      const signals = catalog.querySignals({ signalName: 'market_signal_1' });
      expect(signals).toHaveLength(1);
      expect(signals[0].signalName).toBe('market_signal_1');
    });

    it('should filter by version', () => {
      catalog.registerSignal({
        signalName: 'market_signal_1',
        description: 'Market signal 1 v2',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '2.0.0',
        owner: 'team_a',
      });

      const signals = catalog.querySignals({
        signalName: 'market_signal_1',
        version: '2.0.0',
      });
      expect(signals).toHaveLength(1);
      expect(signals[0].version).toBe('2.0.0');
    });
  });

  describe('listSignalNames', () => {
    it('should list unique signal names', () => {
      catalog.registerSignal({
        signalName: 'signal_a',
        description: 'A',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '1.0.0',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'signal_a',
        description: 'A v2',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '2.0.0',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'signal_b',
        description: 'B',
        featureGroup: 'liquidity',
        inputFields: [],
        outputType: 'boolean',
        version: '1.0.0',
        owner: 'test',
      });

      const names = catalog.listSignalNames();
      expect(names).toHaveLength(2);
      expect(names.sort()).toEqual(['signal_a', 'signal_b']);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive stats', () => {
      catalog.registerSignal({
        signalName: 'market_sig',
        description: 'Market',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '1.0.0',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'market_sig',
        description: 'Market v2',
        featureGroup: 'market',
        inputFields: [],
        outputType: 'number',
        version: '2.0.0',
        owner: 'test',
      });

      catalog.registerSignal({
        signalName: 'liquidity_sig',
        description: 'Liquidity',
        featureGroup: 'liquidity',
        inputFields: [],
        outputType: 'boolean',
        version: '1.0.0',
        owner: 'test',
      });

      const stats = catalog.getStats();
      expect(stats.totalSignals).toBe(2); // unique signal names
      expect(stats.totalVersions).toBe(3); // total entries
      expect(stats.signalsByGroup['market']).toBe(1);
      expect(stats.signalsByGroup['liquidity']).toBe(1);
    });
  });
});
