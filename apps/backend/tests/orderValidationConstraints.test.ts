import { describe, it, expect } from 'vitest';
import {
  isPriceValidForTickSize,
  isSizeValidForMinimum,
  validateOrderWithConstraints,
  validateOrderWithConstraintsOrThrow,
  type MarketConstraints,
  type TickSize,
} from '../src/utils/orderValidation';

/**
 * Order Parameter Validation with Market Constraints Tests - Issue #75
 * 
 * Comprehensive test coverage for tick size and minimum order size validation
 * to ensure non-conforming orders are rejected before submission to the exchange.
 */

describe('Order Validation with Market Constraints - Issue #75', () => {
  describe('isPriceValidForTickSize', () => {
    describe('Tick size 0.1', () => {
      const tickSize: TickSize = '0.1';

      it('should accept prices aligned with 0.1 tick size', () => {
        expect(isPriceValidForTickSize(0.1, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.2, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.5, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.9, tickSize)).toBe(true);
      });

      it('should reject prices not aligned with 0.1 tick size', () => {
        expect(isPriceValidForTickSize(0.15, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.25, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.123, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.555, tickSize)).toBe(false);
      });

      it('should reject prices below tick size', () => {
        expect(isPriceValidForTickSize(0.05, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.01, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.001, tickSize)).toBe(false);
      });
    });

    describe('Tick size 0.01', () => {
      const tickSize: TickSize = '0.01';

      it('should accept prices aligned with 0.01 tick size', () => {
        expect(isPriceValidForTickSize(0.01, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.05, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.10, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.25, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.50, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.99, tickSize)).toBe(true);
      });

      it('should reject prices not aligned with 0.01 tick size', () => {
        expect(isPriceValidForTickSize(0.015, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.123, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.555, tickSize)).toBe(false);
      });

      it('should reject prices below tick size', () => {
        expect(isPriceValidForTickSize(0.005, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.001, tickSize)).toBe(false);
      });
    });

    describe('Tick size 0.001', () => {
      const tickSize: TickSize = '0.001';

      it('should accept prices aligned with 0.001 tick size', () => {
        expect(isPriceValidForTickSize(0.001, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.010, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.123, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.555, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.999, tickSize)).toBe(true);
      });

      it('should reject prices not aligned with 0.001 tick size', () => {
        expect(isPriceValidForTickSize(0.1234, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.5555, tickSize)).toBe(false);
      });

      it('should reject prices below tick size', () => {
        expect(isPriceValidForTickSize(0.0005, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.0001, tickSize)).toBe(false);
      });
    });

    describe('Tick size 0.0001', () => {
      const tickSize: TickSize = '0.0001';

      it('should accept prices aligned with 0.0001 tick size', () => {
        expect(isPriceValidForTickSize(0.0001, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.0010, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.1234, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.5555, tickSize)).toBe(true);
        expect(isPriceValidForTickSize(0.9999, tickSize)).toBe(true);
      });

      it('should reject prices not aligned with 0.0001 tick size', () => {
        expect(isPriceValidForTickSize(0.12345, tickSize)).toBe(false);
        expect(isPriceValidForTickSize(0.55555, tickSize)).toBe(false);
      });

      it('should reject prices below tick size', () => {
        expect(isPriceValidForTickSize(0.00005, tickSize)).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle floating point precision correctly', () => {
        // Test case where floating point math could cause issues
        expect(isPriceValidForTickSize(0.3, '0.1')).toBe(true);
        expect(isPriceValidForTickSize(0.15, '0.05')).toBe(true); // Would fail with 0.05 tick but we don't have that
      });

      it('should accept edge case: price exactly equals tick size', () => {
        expect(isPriceValidForTickSize(0.1, '0.1')).toBe(true);
        expect(isPriceValidForTickSize(0.01, '0.01')).toBe(true);
        expect(isPriceValidForTickSize(0.001, '0.001')).toBe(true);
        expect(isPriceValidForTickSize(0.0001, '0.0001')).toBe(true);
      });
    });
  });

  describe('isSizeValidForMinimum', () => {
    it('should accept sizes greater than minimum', () => {
      expect(isSizeValidForMinimum('10', '1')).toBe(true);
      expect(isSizeValidForMinimum('5.5', '1')).toBe(true);
      expect(isSizeValidForMinimum('100', '10')).toBe(true);
      expect(isSizeValidForMinimum('1.1', '1')).toBe(true);
    });

    it('should accept sizes equal to minimum', () => {
      expect(isSizeValidForMinimum('1', '1')).toBe(true);
      expect(isSizeValidForMinimum('10', '10')).toBe(true);
      expect(isSizeValidForMinimum('0.5', '0.5')).toBe(true);
    });

    it('should reject sizes less than minimum', () => {
      expect(isSizeValidForMinimum('0.5', '1')).toBe(false);
      expect(isSizeValidForMinimum('5', '10')).toBe(false);
      expect(isSizeValidForMinimum('0.1', '0.5')).toBe(false);
    });

    it('should handle decimal minimums', () => {
      expect(isSizeValidForMinimum('0.5', '0.1')).toBe(true);
      expect(isSizeValidForMinimum('0.05', '0.1')).toBe(false);
      expect(isSizeValidForMinimum('1.5', '0.5')).toBe(true);
    });

    it('should reject invalid numeric strings', () => {
      expect(isSizeValidForMinimum('invalid', '1')).toBe(false);
      expect(isSizeValidForMinimum('10', 'invalid')).toBe(false);
      expect(isSizeValidForMinimum('abc', 'def')).toBe(false);
    });
  });

  describe('validateOrderWithConstraints', () => {
    const constraints: MarketConstraints = {
      tickSize: '0.01',
      minOrderSize: '1',
    };

    describe('Valid orders', () => {
      it('should accept orders with valid tick size and minimum size', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.55',
          size: '10',
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.tokenId).toBe('0xtoken');
        expect(result.data?.price).toBe('0.55');
        expect(result.data?.size).toBe('10');
      });

      it('should accept orders with price at exact tick size', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.01',
          size: '1',
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(true);
      });

      it('should accept orders with size at exact minimum', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.50',
          size: '1',
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(true);
      });

      it('should accept large orders', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'SELL' as const,
          price: '0.75',
          size: '1000',
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid tick size', () => {
      it('should reject orders with price not aligned to tick size', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.555', // Not aligned with 0.01
          size: '10',
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('tick size');
        expect(result.error).toContain('0.01');
      });

      it('should reject orders with price below tick size', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.005', // Below 0.01
          size: '10',
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(false);
        expect(result.error).toContain('tick size');
      });
    });

    describe('Invalid minimum size', () => {
      it('should reject orders below minimum size', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.50',
          size: '0.5', // Below minimum of 1
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('minimum');
        expect(result.error).toContain('0.5');
      });

      it('should reject zero size even if basic validation passes', () => {
        // Zero size should be caught by basic validation first
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.50',
          size: '0',
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(false);
      });
    });

    describe('Combined validation', () => {
      it('should report tick size error when both tick and size are invalid', () => {
        const params = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.555', // Invalid tick
          size: '0.5', // Below minimum
        };

        const result = validateOrderWithConstraints(params, constraints);
        expect(result.success).toBe(false);
        // Tick size validation happens first
        expect(result.error).toContain('tick size');
      });
    });

    describe('Different tick sizes', () => {
      it('should validate with 0.1 tick size', () => {
        const constraintsLarge: MarketConstraints = {
          tickSize: '0.1',
          minOrderSize: '5',
        };

        const validParams = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.5',
          size: '10',
        };

        const invalidParams = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.55', // Not aligned with 0.1
          size: '10',
        };

        expect(validateOrderWithConstraints(validParams, constraintsLarge).success).toBe(true);
        expect(validateOrderWithConstraints(invalidParams, constraintsLarge).success).toBe(false);
      });

      it('should validate with 0.001 tick size', () => {
        const constraintsSmall: MarketConstraints = {
          tickSize: '0.001',
          minOrderSize: '0.1',
        };

        const validParams = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.555',
          size: '0.5',
        };

        const invalidParams = {
          tokenId: '0xtoken',
          side: 'BUY' as const,
          price: '0.5555', // Not aligned with 0.001
          size: '0.5',
        };

        expect(validateOrderWithConstraints(validParams, constraintsSmall).success).toBe(true);
        expect(validateOrderWithConstraints(invalidParams, constraintsSmall).success).toBe(false);
      });
    });
  });

  describe('validateOrderWithConstraintsOrThrow', () => {
    const constraints: MarketConstraints = {
      tickSize: '0.01',
      minOrderSize: '1',
    };

    it('should return validated data for valid input', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.55',
        size: '10',
      };

      const result = validateOrderWithConstraintsOrThrow(params, constraints);
      expect(result.tokenId).toBe('0xtoken');
      expect(result.side).toBe('BUY');
      expect(result.price).toBe('0.55');
      expect(result.size).toBe('10');
    });

    it('should throw for invalid tick size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.555',
        size: '10',
      };

      expect(() => validateOrderWithConstraintsOrThrow(params, constraints)).toThrow('tick size');
    });

    it('should throw for invalid minimum size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.50',
        size: '0.5',
      };

      expect(() => validateOrderWithConstraintsOrThrow(params, constraints)).toThrow('minimum');
    });

    it('should throw with detailed error message', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.555',
        size: '10',
      };

      expect(() => validateOrderWithConstraintsOrThrow(params, constraints)).toThrow(/0.555/);
      expect(() => validateOrderWithConstraintsOrThrow(params, constraints)).toThrow(/0.01/);
    });
  });

  describe('Real-world scenarios', () => {
    it('should validate typical Polymarket order with 0.01 tick', () => {
      const constraints: MarketConstraints = {
        tickSize: '0.01',
        minOrderSize: '1',
      };

      const order = {
        tokenId: '0xabc123...',
        side: 'BUY' as const,
        price: '0.65', // 65% probability
        size: '100', // Buy 100 tokens
      };

      const result = validateOrderWithConstraints(order, constraints);
      expect(result.success).toBe(true);
    });

    it('should reject order with too-precise price', () => {
      const constraints: MarketConstraints = {
        tickSize: '0.01',
        minOrderSize: '1',
      };

      const order = {
        tokenId: '0xabc123...',
        side: 'SELL' as const,
        price: '0.6543', // Too many decimals
        size: '50',
      };

      const result = validateOrderWithConstraints(order, constraints);
      expect(result.success).toBe(false);
    });

    it('should reject order below market minimum', () => {
      const constraints: MarketConstraints = {
        tickSize: '0.01',
        minOrderSize: '10', // Minimum 10 tokens
      };

      const order = {
        tokenId: '0xabc123...',
        side: 'BUY' as const,
        price: '0.50',
        size: '5', // Below minimum
      };

      const result = validateOrderWithConstraints(order, constraints);
      expect(result.success).toBe(false);
    });
  });
});
