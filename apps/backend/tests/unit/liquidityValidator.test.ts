import { describe, it, expect, beforeEach } from 'vitest';
import { LiquidityValidator, LiquidityValidatorConfig } from '../../src/trading/liquidityValidator';
import { Orderbook } from '@polymarket/shared';

describe('LiquidityValidator', () => {
  let validator: LiquidityValidator;

  beforeEach(() => {
    validator = new LiquidityValidator({
      minLiquidityMultiplier: 1.0,
      maxPriceLevels: 10,
      maxOrderbookAgeMs: 5000,
    });
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const defaultValidator = new LiquidityValidator();
      const config = defaultValidator.getConfig();
      
      expect(config.minLiquidityMultiplier).toBe(1.0);
      expect(config.maxPriceLevels).toBe(10);
      expect(config.maxOrderbookAgeMs).toBe(5000);
    });

    it('should initialize with custom config', () => {
      const customValidator = new LiquidityValidator({
        minLiquidityMultiplier: 1.5,
        maxPriceLevels: 5,
        maxOrderbookAgeMs: 3000,
      });
      const config = customValidator.getConfig();
      
      expect(config.minLiquidityMultiplier).toBe(1.5);
      expect(config.maxPriceLevels).toBe(5);
      expect(config.maxOrderbookAgeMs).toBe(3000);
    });

    it('should reject invalid minLiquidityMultiplier', () => {
      expect(() => new LiquidityValidator({ minLiquidityMultiplier: 0 })).toThrow();
      expect(() => new LiquidityValidator({ minLiquidityMultiplier: -1 })).toThrow();
      expect(() => new LiquidityValidator({ minLiquidityMultiplier: NaN })).toThrow();
      expect(() => new LiquidityValidator({ minLiquidityMultiplier: Infinity })).toThrow();
    });

    it('should reject invalid maxPriceLevels', () => {
      expect(() => new LiquidityValidator({ maxPriceLevels: 0 })).toThrow();
      expect(() => new LiquidityValidator({ maxPriceLevels: -1 })).toThrow();
      expect(() => new LiquidityValidator({ maxPriceLevels: NaN })).toThrow();
      expect(() => new LiquidityValidator({ maxPriceLevels: Infinity })).toThrow();
    });

    it('should reject invalid maxOrderbookAgeMs', () => {
      expect(() => new LiquidityValidator({ maxOrderbookAgeMs: 0 })).toThrow();
      expect(() => new LiquidityValidator({ maxOrderbookAgeMs: -1 })).toThrow();
      expect(() => new LiquidityValidator({ maxOrderbookAgeMs: NaN })).toThrow();
      expect(() => new LiquidityValidator({ maxOrderbookAgeMs: Infinity })).toThrow();
    });
  });

  describe('checkLiquidity - input validation', () => {
    const mockOrderbook: Orderbook = {
      market: '0xmarket',
      asset_id: '0xtoken123',
      bids: [{ price: '0.50', size: '100' }],
      asks: [{ price: '0.51', size: '100' }],
      timestamp: Date.now(),
    };

    it('should reject empty tokenId', () => {
      const result = validator.checkLiquidity('', 'BUY', '10', mockOrderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid tokenId');
    });

    it('should reject invalid order size', () => {
      const result = validator.checkLiquidity('0xtoken123', 'BUY', 'invalid', mockOrderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid order size');
    });

    it('should reject negative order size', () => {
      const result = validator.checkLiquidity('0xtoken123', 'BUY', '-10', mockOrderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid order size');
    });

    it('should reject zero order size', () => {
      const result = validator.checkLiquidity('0xtoken123', 'BUY', '0', mockOrderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid order size');
    });
  });

  describe('checkLiquidity - missing orderbook', () => {
    it('should reject when orderbook is null', () => {
      const result = validator.checkLiquidity('0xtoken123', 'BUY', '10', null);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Orderbook data missing');
    });

    it('should reject when orderbook is undefined', () => {
      const result = validator.checkLiquidity('0xtoken123', 'BUY', '10', null);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Orderbook data missing');
    });
  });

  describe('checkLiquidity - stale orderbook', () => {
    it('should reject when orderbook is too old', () => {
      const staleTimestamp = Date.now() - 10000; // 10 seconds ago
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: staleTimestamp,
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '10', orderbook, staleTimestamp);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('stale');
    });

    it('should allow when orderbook is fresh', () => {
      const freshTimestamp = Date.now() - 1000; // 1 second ago
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: freshTimestamp,
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '10', orderbook, freshTimestamp);
      expect(result.allowed).toBe(true);
    });

    it('should allow when timestamp is not provided', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '10', orderbook);
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkLiquidity - empty orderbook side', () => {
    it('should reject BUY order when asks are empty', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '10', orderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No liquidity available');
      expect(result.reason).toContain('ask');
    });

    it('should reject SELL order when bids are empty', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'SELL', '10', orderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No liquidity available');
      expect(result.reason).toContain('bid');
    });
  });

  describe('checkLiquidity - sufficient liquidity', () => {
    it('should allow BUY order with sufficient ask liquidity', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '50', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.availableLiquidity).toBe('100');
      expect(result.bestPrice).toBe('0.51');
    });

    it('should allow SELL order with sufficient bid liquidity', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'SELL', '50', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.availableLiquidity).toBe('100');
      expect(result.bestPrice).toBe('0.50');
    });

    it('should allow order exactly at liquidity threshold', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '100', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.availableLiquidity).toBe('100');
    });
  });

  describe('checkLiquidity - insufficient liquidity', () => {
    it('should reject BUY order with insufficient ask liquidity', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '50' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '100', orderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient liquidity');
      expect(result.availableLiquidity).toBe('50');
      expect(result.requiredLiquidity).toBe('100');
    });

    it('should reject SELL order with insufficient bid liquidity', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '50' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'SELL', '100', orderbook);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient liquidity');
      expect(result.availableLiquidity).toBe('50');
      expect(result.requiredLiquidity).toBe('100');
    });
  });

  describe('checkLiquidity - multiple price levels', () => {
    it('should aggregate liquidity across multiple ask levels', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [
          { price: '0.51', size: '30' },
          { price: '0.52', size: '30' },
          { price: '0.53', size: '40' },
        ],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '80', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.availableLiquidity).toBe('100'); // 30 + 30 + 40
    });

    it('should aggregate liquidity across multiple bid levels', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [
          { price: '0.50', size: '30' },
          { price: '0.49', size: '30' },
          { price: '0.48', size: '40' },
        ],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'SELL', '80', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.availableLiquidity).toBe('100'); // 30 + 30 + 40
    });

    it('should respect maxPriceLevels limit', () => {
      const limitedValidator = new LiquidityValidator({
        minLiquidityMultiplier: 1.0,
        maxPriceLevels: 2,
      });

      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [
          { price: '0.51', size: '30' },
          { price: '0.52', size: '30' },
          { price: '0.53', size: '100' }, // This level should not be counted
        ],
        timestamp: Date.now(),
      };

      const result = limitedValidator.checkLiquidity('0xtoken123', 'BUY', '80', orderbook);
      expect(result.allowed).toBe(false); // Only 60 available (30 + 30)
      expect(result.availableLiquidity).toBe('60');
    });
  });

  describe('checkLiquidity - liquidity multiplier', () => {
    it('should require 1.5x liquidity when multiplier is 1.5', () => {
      const strictValidator = new LiquidityValidator({
        minLiquidityMultiplier: 1.5,
      });

      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '120' }],
        timestamp: Date.now(),
      };

      // Order size 80 requires 120 liquidity (80 * 1.5)
      const result = strictValidator.checkLiquidity('0xtoken123', 'BUY', '80', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.requiredLiquidity).toBe('120');
    });

    it('should reject when liquidity is below multiplier threshold', () => {
      const strictValidator = new LiquidityValidator({
        minLiquidityMultiplier: 2.0,
      });

      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '150' }],
        timestamp: Date.now(),
      };

      // Order size 100 requires 200 liquidity (100 * 2.0)
      const result = strictValidator.checkLiquidity('0xtoken123', 'BUY', '100', orderbook);
      expect(result.allowed).toBe(false);
      expect(result.availableLiquidity).toBe('150');
      expect(result.requiredLiquidity).toBe('200');
    });
  });

  describe('checkLiquidity - edge cases', () => {
    it('should handle very small order sizes', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '0.001' }],
        asks: [{ price: '0.51', size: '0.001' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '0.0001', orderbook);
      expect(result.allowed).toBe(true);
    });

    it('should handle very large order sizes', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '1000000' }],
        asks: [{ price: '0.51', size: '1000000' }],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '999999', orderbook);
      expect(result.allowed).toBe(true);
    });

    it('should skip invalid price levels with non-numeric size', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [
          { price: '0.51', size: '50' },
          { price: '0.52', size: 'invalid' as any }, // Invalid size should be skipped
          { price: '0.53', size: '50' },
        ],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '90', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.availableLiquidity).toBe('100'); // 50 + 0 + 50
    });

    it('should skip price levels with zero or negative size', () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.50', size: '100' }],
        asks: [
          { price: '0.51', size: '50' },
          { price: '0.52', size: '0' },
          { price: '0.53', size: '-10' },
          { price: '0.54', size: '50' },
        ],
        timestamp: Date.now(),
      };

      const result = validator.checkLiquidity('0xtoken123', 'BUY', '90', orderbook);
      expect(result.allowed).toBe(true);
      expect(result.availableLiquidity).toBe('100'); // 50 + 0 + 0 + 50
    });
  });

  describe('updateConfig', () => {
    it('should update minLiquidityMultiplier', () => {
      validator.updateConfig({ minLiquidityMultiplier: 2.0 });
      const config = validator.getConfig();
      expect(config.minLiquidityMultiplier).toBe(2.0);
    });

    it('should update maxPriceLevels', () => {
      validator.updateConfig({ maxPriceLevels: 5 });
      const config = validator.getConfig();
      expect(config.maxPriceLevels).toBe(5);
    });

    it('should update maxOrderbookAgeMs', () => {
      validator.updateConfig({ maxOrderbookAgeMs: 3000 });
      const config = validator.getConfig();
      expect(config.maxOrderbookAgeMs).toBe(3000);
    });

    it('should update multiple config values at once', () => {
      validator.updateConfig({
        minLiquidityMultiplier: 1.5,
        maxPriceLevels: 7,
      });
      const config = validator.getConfig();
      expect(config.minLiquidityMultiplier).toBe(1.5);
      expect(config.maxPriceLevels).toBe(7);
    });

    it('should reject invalid minLiquidityMultiplier update', () => {
      expect(() => validator.updateConfig({ minLiquidityMultiplier: 0 })).toThrow();
      expect(() => validator.updateConfig({ minLiquidityMultiplier: -1 })).toThrow();
      expect(() => validator.updateConfig({ minLiquidityMultiplier: NaN })).toThrow();
    });

    it('should reject invalid maxPriceLevels update', () => {
      expect(() => validator.updateConfig({ maxPriceLevels: 0 })).toThrow();
      expect(() => validator.updateConfig({ maxPriceLevels: -1 })).toThrow();
      expect(() => validator.updateConfig({ maxPriceLevels: NaN })).toThrow();
    });

    it('should reject invalid maxOrderbookAgeMs update', () => {
      expect(() => validator.updateConfig({ maxOrderbookAgeMs: 0 })).toThrow();
      expect(() => validator.updateConfig({ maxOrderbookAgeMs: -1 })).toThrow();
      expect(() => validator.updateConfig({ maxOrderbookAgeMs: NaN })).toThrow();
    });
  });
});
