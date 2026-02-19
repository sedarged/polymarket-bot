/**
 * Integration tests for Fee Rate Checking (GAP-019)
 * 
 * Tests the fee rate validation with RiskManager to ensure:
 * - Fee rates are properly validated during order checks
 * - Orders are rejected when fees exceed configured limits
 * - Integration with risk manager's order checking flow
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager } from '../../src/trading/riskManager';
import { Order, Position } from '@polymarket/shared';

describe('Fee Rate Checking Integration (GAP-019)', () => {
  let riskManager: RiskManager;

  beforeEach(() => {
    riskManager = new RiskManager({
      maxExposurePerMarket: 1000,
      maxOpenOrders: 50,
      maxDrawdown: 0.20,
      errorRateThreshold: 0.10,
      errorRateWindow: 100,
      maxFeeRateBps: 50, // 0.5% maximum fee rate
    });
  });

  describe('Order placement with fee rate checks', () => {
    it('should allow order with acceptable fee rate', () => {
      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '100',
        [],
        [],
        25 // 0.25% fee rate - acceptable
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject order with excessive fee rate', () => {
      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '100',
        [],
        [],
        100 // 1.0% fee rate - too high
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('Fee rate');
      expect(result.reason).toContain('100 bps');
      expect(result.reason).toContain('exceeds maximum');
      expect(result.reason).toContain('50 bps');
    });

    it('should allow order with no fee', () => {
      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '100',
        [],
        [],
        0 // No fee
      );

      expect(result.allowed).toBe(true);
    });

    it('should allow order when fee rate is not specified (undefined)', () => {
      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '100',
        [],
        [],
        undefined // No fee rate specified
      );

      expect(result.allowed).toBe(true);
    });

    it('should reject order with negative fee rate', () => {
      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '100',
        [],
        [],
        -10 // Invalid negative fee
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid fee rate');
      expect(result.reason).toContain('must be non-negative');
    });
  });

  describe('Fee rate checking with other risk checks', () => {
    it('should check fee rate before other risk checks', () => {
      // Set up a scenario where max open orders would be exceeded
      const orders: Order[] = Array.from({ length: 50 }, (_, i) => ({
        orderId: `order-${i}`,
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.50',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
      }));

      // But fee rate is also too high
      const result = riskManager.checkOrder(
        '0xtoken456',
        'BUY',
        '100',
        orders,
        [],
        100 // Excessive fee rate
      );

      // Should fail on fee rate check (checked first)
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Fee rate');
    });

    it('should allow order when fee is acceptable and within other limits', () => {
      const orders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: '0xtoken123',
          side: 'BUY',
          price: '0.50',
          size: '10',
          status: 'OPEN',
          createdAt: Date.now(),
        },
      ];

      const positions: Position[] = [
        {
          tokenId: '0xtoken123',
          size: '100',
          averagePrice: '0.50',
        },
      ];

      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '50',
        orders,
        positions,
        30 // Acceptable 0.3% fee rate
      );

      expect(result.allowed).toBe(true);
    });

    it('should reject order when fee is acceptable but exposure limit exceeded', () => {
      const positions: Position[] = [
        {
          tokenId: '0xtoken123',
          size: '900', // Near limit
          averagePrice: '0.50',
        },
      ];

      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '200', // Would exceed 1000 limit
        [],
        positions,
        30 // Fee rate is acceptable
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Max exposure');
    });
  });

  describe('Fee rate validator access', () => {
    it('should provide access to fee rate validator', () => {
      const validator = riskManager.getFeeRateValidator();
      expect(validator).toBeDefined();
      expect(validator.getMaxFeeRateBps()).toBe(50);
    });

    it('should allow standalone fee rate checks via validator', () => {
      const validator = riskManager.getFeeRateValidator();
      
      const result1 = validator.checkFeeRate(25, '0xtoken123');
      expect(result1.allowed).toBe(true);

      const result2 = validator.checkFeeRate(100, '0xtoken123');
      expect(result2.allowed).toBe(false);
    });

    it('should allow updating max fee rate dynamically', () => {
      const validator = riskManager.getFeeRateValidator();
      
      // Initially 50 bps
      expect(validator.checkFeeRate(75).allowed).toBe(false);
      
      // Update to 100 bps
      validator.setMaxFeeRateBps(100);
      expect(validator.getMaxFeeRateBps()).toBe(100);
      
      // Now 75 bps should be allowed
      expect(validator.checkFeeRate(75).allowed).toBe(true);
    });
  });

  describe('Realistic trading scenarios', () => {
    it('should handle high-volume trading with varying fee rates', () => {
      const testCases = [
        { feeRateBps: 10, shouldAllow: true, desc: '0.1% fee' },
        { feeRateBps: 25, shouldAllow: true, desc: '0.25% fee' },
        { feeRateBps: 50, shouldAllow: true, desc: '0.5% fee (at limit)' },
        { feeRateBps: 51, shouldAllow: false, desc: '0.51% fee (over limit)' },
        { feeRateBps: 100, shouldAllow: false, desc: '1.0% fee' },
        { feeRateBps: 200, shouldAllow: false, desc: '2.0% fee' },
      ];

      testCases.forEach(({ feeRateBps, shouldAllow, desc }) => {
        const result = riskManager.checkOrder(
          '0xtoken123',
          'BUY',
          '100',
          [],
          [],
          feeRateBps
        );

        expect(result.allowed).toBe(shouldAllow);
        if (!shouldAllow) {
          expect(result.reason).toContain('Fee rate');
        }
      });
    });

    it('should protect against fee spikes in volatile markets', () => {
      // Simulate a scenario where market conditions cause fee spikes
      const normalFee = 20; // 0.2% - normal conditions
      const spikedFee = 150; // 1.5% - volatile conditions

      // Normal conditions - order should pass
      const normalResult = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '100',
        [],
        [],
        normalFee
      );
      expect(normalResult.allowed).toBe(true);

      // Spiked fee - order should be rejected for protection
      const spikedResult = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '100',
        [],
        [],
        spikedFee
      );
      expect(spikedResult.allowed).toBe(false);
      expect(spikedResult.reason).toContain('exceeds maximum');
    });
  });
});
