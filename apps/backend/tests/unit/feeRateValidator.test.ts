import { describe, it, expect, beforeEach } from 'vitest';
import { FeeRateValidator } from '../../src/trading/feeRateValidator';

describe('FeeRateValidator', () => {
  let validator: FeeRateValidator;

  beforeEach(() => {
    validator = new FeeRateValidator(50); // 50 bps = 0.5%
  });

  describe('constructor', () => {
    it('should create validator with valid max fee rate', () => {
      expect(() => new FeeRateValidator(50)).not.toThrow();
      expect(() => new FeeRateValidator(0)).not.toThrow();
      expect(() => new FeeRateValidator(10000)).not.toThrow();
    });

    it('should reject negative max fee rate', () => {
      expect(() => new FeeRateValidator(-1)).toThrow(
        'maxFeeRateBps must be between 0 and 10000'
      );
    });

    it('should reject max fee rate above 10000 bps', () => {
      expect(() => new FeeRateValidator(10001)).toThrow(
        'maxFeeRateBps must be between 0 and 10000'
      );
    });
  });

  describe('checkFeeRate', () => {
    it('should allow fee rate below maximum', () => {
      const result = validator.checkFeeRate(25); // 0.25%
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.feeRateBps).toBe(25);
      expect(result.maxFeeRateBps).toBe(50);
    });

    it('should allow fee rate equal to maximum', () => {
      const result = validator.checkFeeRate(50); // 0.5%
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.feeRateBps).toBe(50);
    });

    it('should reject fee rate above maximum', () => {
      const result = validator.checkFeeRate(100); // 1.0%
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
      expect(result.reason).toContain('100 bps');
      expect(result.reason).toContain('1.00%');
      expect(result.reason).toContain('50 bps');
      expect(result.reason).toContain('0.50%');
      expect(result.feeRateBps).toBe(100);
      expect(result.maxFeeRateBps).toBe(50);
    });

    it('should treat undefined fee rate as 0 (no fee)', () => {
      const result = validator.checkFeeRate(undefined);
      expect(result.allowed).toBe(true);
      expect(result.feeRateBps).toBe(0);
    });

    it('should allow zero fee rate', () => {
      const result = validator.checkFeeRate(0);
      expect(result.allowed).toBe(true);
      expect(result.feeRateBps).toBe(0);
    });

    it('should reject negative fee rate', () => {
      const result = validator.checkFeeRate(-10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid fee rate');
      expect(result.reason).toContain('must be non-negative');
      expect(result.feeRateBps).toBe(-10);
    });

    it('should include tokenId in logging context when provided', () => {
      const tokenId = '0x123abc';
      const result = validator.checkFeeRate(100, tokenId);
      expect(result.allowed).toBe(false);
      // tokenId is used for logging but not returned in result
    });
  });

  describe('getMaxFeeRateBps', () => {
    it('should return the current max fee rate', () => {
      expect(validator.getMaxFeeRateBps()).toBe(50);
    });
  });

  describe('setMaxFeeRateBps', () => {
    it('should update max fee rate', () => {
      validator.setMaxFeeRateBps(100);
      expect(validator.getMaxFeeRateBps()).toBe(100);
    });

    it('should accept 0 as max fee rate', () => {
      validator.setMaxFeeRateBps(0);
      expect(validator.getMaxFeeRateBps()).toBe(0);
    });

    it('should accept 10000 as max fee rate', () => {
      validator.setMaxFeeRateBps(10000);
      expect(validator.getMaxFeeRateBps()).toBe(10000);
    });

    it('should reject negative max fee rate', () => {
      expect(() => validator.setMaxFeeRateBps(-1)).toThrow(
        'maxFeeRateBps must be between 0 and 10000'
      );
    });

    it('should reject max fee rate above 10000', () => {
      expect(() => validator.setMaxFeeRateBps(10001)).toThrow(
        'maxFeeRateBps must be between 0 and 10000'
      );
    });

    it('should affect subsequent checks', () => {
      validator.setMaxFeeRateBps(25);
      
      // Should now reject 50 bps
      const result1 = validator.checkFeeRate(50);
      expect(result1.allowed).toBe(false);
      
      // Should allow 25 bps
      const result2 = validator.checkFeeRate(25);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very small fee rates', () => {
      const result = validator.checkFeeRate(0.01); // 0.0001%
      expect(result.allowed).toBe(true);
      expect(result.feeRateBps).toBe(0.01);
    });

    it('should handle fee rates at boundary', () => {
      const result = validator.checkFeeRate(49.99);
      expect(result.allowed).toBe(true);
    });

    it('should reject fee rates just above boundary', () => {
      const result = validator.checkFeeRate(50.01);
      expect(result.allowed).toBe(false);
    });
  });

  describe('with strict zero tolerance', () => {
    let strictValidator: FeeRateValidator;

    beforeEach(() => {
      strictValidator = new FeeRateValidator(0); // No fees allowed
    });

    it('should allow zero fee', () => {
      const result = strictValidator.checkFeeRate(0);
      expect(result.allowed).toBe(true);
    });

    it('should reject any positive fee', () => {
      const result = strictValidator.checkFeeRate(1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
    });
  });

  describe('with maximum tolerance', () => {
    let maxValidator: FeeRateValidator;

    beforeEach(() => {
      maxValidator = new FeeRateValidator(10000); // 100% = 10000 bps
    });

    it('should allow any reasonable fee rate', () => {
      expect(maxValidator.checkFeeRate(1000).allowed).toBe(true);
      expect(maxValidator.checkFeeRate(5000).allowed).toBe(true);
      expect(maxValidator.checkFeeRate(9999).allowed).toBe(true);
      expect(maxValidator.checkFeeRate(10000).allowed).toBe(true);
    });
  });
});
