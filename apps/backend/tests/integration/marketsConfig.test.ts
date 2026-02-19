import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseConfig } from '../../src/config';
import { RiskManager } from '../../src/trading/riskManager';
import { Position } from '@polymarket/shared';
import fs from 'fs';
import path from 'path';

/**
 * Integration test for GAP-001: Wire MARKETS_CONFIG_PATH
 * 
 * Tests the end-to-end flow of:
 * 1. Loading per-market config from markets.json
 * 2. Passing it to RiskManager
 * 3. Using per-market limits in order validation
 */
describe('Markets Config Integration (GAP-001)', () => {
  let testDir: string;
  let marketsConfigPath: string;

  beforeEach(() => {
    // Create test directory for config files
    testDir = path.join(process.cwd(), '.test-config-integration');
    fs.mkdirSync(testDir, { recursive: true });
    marketsConfigPath = path.join(testDir, 'markets.json');
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.MARKETS_CONFIG_PATH;
  });

  it('should load markets config and apply per-market position limits', () => {
    // Create test markets config
    const marketsConfig = [
      {
        tokenId: '0xtoken-high-limit',
        maxPositionSize: 500,
        spread: 0.01,
      },
      {
        tokenId: '0xtoken-low-limit',
        maxPositionSize: 50,
        spread: 0.02,
      },
    ];
    fs.writeFileSync(marketsConfigPath, JSON.stringify(marketsConfig, null, 2));

    // Set environment variable
    process.env.MARKETS_CONFIG_PATH = marketsConfigPath;

    // Parse config (this should load markets.json)
    const config = parseConfig({
      MARKETS_CONFIG_PATH: marketsConfigPath,
    });

    // Verify markets were loaded
    expect(config.markets).toBeDefined();
    expect(config.markets).toHaveLength(2);
    expect(config.tokenIds).toEqual(['0xtoken-high-limit', '0xtoken-low-limit']);

    // Create RiskManager with global limit of 100
    const riskManager = new RiskManager({
      maxExposurePerMarket: 100, // Global default
      maxOpenOrders: 10,
      maxDrawdown: 0.2,
      errorRateThreshold: 0.1,
      errorRateWindow: 100,
      markets: config.markets,
    });

    // Test 1: Market with high limit (500) should allow order that exceeds global limit (100)
    const highLimitPositions: Position[] = [
      {
        tokenId: '0xtoken-high-limit',
        size: '400',
        averagePrice: '0.50',
      },
    ];

    const highLimitResult = riskManager.checkOrder(
      '0xtoken-high-limit',
      'BUY',
      '50',
      [],
      highLimitPositions
    );

    // Should pass: 400 + 50 = 450, which is < 500 (market limit)
    expect(highLimitResult.allowed).toBe(true);

    // Test 2: Market with low limit (50) should reject order
    const lowLimitPositions: Position[] = [
      {
        tokenId: '0xtoken-low-limit',
        size: '40',
        averagePrice: '0.50',
      },
    ];

    const lowLimitResult = riskManager.checkOrder(
      '0xtoken-low-limit',
      'BUY',
      '20',
      [],
      lowLimitPositions
    );

    // Should fail: 40 + 20 = 60, which is > 50 (market limit)
    expect(lowLimitResult.allowed).toBe(false);
    expect(lowLimitResult.reason).toContain('Max exposure per market exceeded');
    expect(lowLimitResult.reason).toContain('60 > 50');

    // Test 3: Market without specific config should use global limit (100)
    const noConfigPositions: Position[] = [
      {
        tokenId: '0xtoken-no-config',
        size: '90',
        averagePrice: '0.50',
      },
    ];

    const noConfigResult = riskManager.checkOrder(
      '0xtoken-no-config',
      'BUY',
      '20',
      [],
      noConfigPositions
    );

    // Should fail: 90 + 20 = 110, which is > 100 (global limit)
    expect(noConfigResult.allowed).toBe(false);
    expect(noConfigResult.reason).toContain('Max exposure per market exceeded');
    expect(noConfigResult.reason).toContain('110 > 100');
  });

  it('should handle relative paths from process.cwd()', () => {
    // Create config in subdirectory relative to cwd
    const relativePath = '.test-config-integration/markets.json';
    const marketsConfig = [
      {
        tokenId: '0xtoken123',
        maxPositionSize: 200,
      },
    ];
    fs.writeFileSync(marketsConfigPath, JSON.stringify(marketsConfig, null, 2));

    // Parse with relative path
    const config = parseConfig({
      MARKETS_CONFIG_PATH: relativePath,
    });

    expect(config.markets).toBeDefined();
    expect(config.markets).toHaveLength(1);
    expect(config.markets![0].tokenId).toBe('0xtoken123');
  });

  it('should fallback to TOKEN_IDS when markets config fails to load', () => {
    // Set invalid path
    process.env.MARKETS_CONFIG_PATH = '/nonexistent/markets.json';
    process.env.TOKEN_IDS = '0xtoken1,0xtoken2';

    const config = parseConfig({
      MARKETS_CONFIG_PATH: '/nonexistent/markets.json',
      TOKEN_IDS: '0xtoken1,0xtoken2',
    });

    // Should fall back to TOKEN_IDS
    expect(config.tokenIds).toEqual(['0xtoken1', '0xtoken2']);
    expect(config.markets).toBeUndefined();
  });

  it('should filter out invalid entries from markets config', () => {
    // Create config with mixed valid/invalid entries
    const mixedConfig = [
      {
        tokenId: '0xvalid1',
        maxPositionSize: 100,
      },
      {
        // missing tokenId - should be filtered out
        maxPositionSize: 200,
      },
      {
        tokenId: '0xvalid2',
        maxPositionSize: 150,
      },
    ];
    fs.writeFileSync(marketsConfigPath, JSON.stringify(mixedConfig, null, 2));

    const config = parseConfig({
      MARKETS_CONFIG_PATH: marketsConfigPath,
      TOKEN_IDS: '0xfallback', // This won't be used if markets config loads
    });

    // Should only include entries with valid tokenId in tokenIds array
    // But all entries are preserved in markets array (even if missing tokenId)
    expect(config.tokenIds).toEqual(['0xvalid1', '0xvalid2']);
    expect(config.markets).toHaveLength(3); // All entries preserved
  });

  it('should extract tokenIds from markets config', () => {
    const marketsConfig = [
      { tokenId: '0xtoken1', maxPositionSize: 100 },
      { tokenId: '0xtoken2', maxPositionSize: 200 },
      { tokenId: '0xtoken3', maxPositionSize: 150 },
    ];
    fs.writeFileSync(marketsConfigPath, JSON.stringify(marketsConfig, null, 2));

    const config = parseConfig({
      MARKETS_CONFIG_PATH: marketsConfigPath,
    });

    expect(config.tokenIds).toEqual(['0xtoken1', '0xtoken2', '0xtoken3']);
    expect(config.markets).toHaveLength(3);
  });
});
