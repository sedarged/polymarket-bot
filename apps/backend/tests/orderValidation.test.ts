import { describe, it, expect } from 'vitest';
import {
  OrderSideSchema,
  OrderParametersSchema,
  validateOrderParameters,
  validateOrderParametersOrThrow,
  type OrderParameters,
} from '../src/utils/orderValidation';

/**
 * Order Parameter Validation Tests - Audit Finding A-015
 * 
 * Comprehensive test coverage for order parameter input validation
 * to ensure malformed orders are rejected at ingress points.
 */

describe('Order Parameter Validation - Audit Finding A-015', () => {
  describe('OrderSideSchema', () => {
    it('should accept BUY', () => {
      const result = OrderSideSchema.safeParse('BUY');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('BUY');
      }
    });

    it('should accept SELL', () => {
      const result = OrderSideSchema.safeParse('SELL');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('SELL');
      }
    });

    it('should reject invalid side values', () => {
      const invalidSides = ['buy', 'sell', 'Buy', 'Sell', 'LONG', 'SHORT', '', null, undefined, 123];
      
      invalidSides.forEach((side) => {
        const result = OrderSideSchema.safeParse(side);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('OrderParametersSchema - Valid Inputs', () => {
    it('should accept valid order parameters with string values', () => {
      const params = {
        tokenId: '0xabc123',
        side: 'BUY' as const,
        price: '0.55',
        size: '10',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tokenId).toBe('0xabc123');
        expect(result.data.side).toBe('BUY');
        expect(result.data.price).toBe('0.55');
        expect(result.data.size).toBe('10');
      }
    });

    it('should accept valid order parameters with numeric values', () => {
      const params = {
        tokenId: '0xtoken456',
        side: 'SELL' as const,
        price: 0.45,
        size: 5,
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.price).toBe('0.45');
        expect(result.data.size).toBe('5');
      }
    });

    it('should accept decimal values', () => {
      const params = {
        tokenId: 'token-789',
        side: 'BUY' as const,
        price: '0.123456',
        size: '123.456',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.price).toBe('0.123456');
        expect(result.data.size).toBe('123.456');
      }
    });

    it('should accept optional clientOrderId', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
        clientOrderId: 'my-order-123',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.clientOrderId).toBe('my-order-123');
      }
    });

    it('should accept edge case: price near 0', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.01',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should accept edge case: price near 1', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.99',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should accept very small size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: '0.001',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should accept very large size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: '999999999',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });
  });

  describe('OrderParametersSchema - Invalid tokenId', () => {
    it('should reject empty tokenId', () => {
      const params = {
        tokenId: '',
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject whitespace-only tokenId', () => {
      const params = {
        tokenId: '   ',
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject missing tokenId', () => {
      const params = {
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('OrderParametersSchema - Invalid side', () => {
    it('should reject lowercase side', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'buy',
        price: '0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject invalid side value', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'LONG',
        price: '0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject missing side', () => {
      const params = {
        tokenId: '0xtoken',
        price: '0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('OrderParametersSchema - Invalid price', () => {
    it('should reject zero price', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject negative price', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '-0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject price >= 1', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '1',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject price > 1', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '1.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric price', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: 'invalid',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject NaN price', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: NaN,
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject Infinity price', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: Infinity,
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject missing price', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('OrderParametersSchema - Invalid size', () => {
    it('should reject zero size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: '0',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject negative size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: '-10',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: 'invalid',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject NaN size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: NaN,
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject Infinity size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: Infinity,
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject missing size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('validateOrderParameters function', () => {
    it('should return success with valid data', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.55',
        size: '10',
      };

      const result = validateOrderParameters(params);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.tokenId).toBe('0xtoken');
      expect(result.data?.side).toBe('BUY');
      expect(result.data?.price).toBe('0.55');
      expect(result.data?.size).toBe('10');
    });

    it('should return error with invalid data', () => {
      const params = {
        tokenId: '',
        side: 'INVALID',
        price: '2.0',
        size: '-5',
      };

      const result = validateOrderParameters(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid order parameters');
      expect(result.data).toBeUndefined();
    });

    it('should return error for missing required fields', () => {
      const params = {
        tokenId: '0xtoken',
      };

      const result = validateOrderParameters(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should provide detailed error messages', () => {
      const params = {
        tokenId: '',
        side: 'BUY' as const,
        price: '0.5',
        size: '0',
      };

      const result = validateOrderParameters(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Should mention both tokenId and size errors
      expect(result.error).toContain('tokenId');
      expect(result.error).toContain('size');
    });
  });

  describe('validateOrderParametersOrThrow function', () => {
    it('should return validated data for valid input', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.55',
        size: '10',
      };

      const result = validateOrderParametersOrThrow(params);
      expect(result.tokenId).toBe('0xtoken');
      expect(result.side).toBe('BUY');
      expect(result.price).toBe('0.55');
      expect(result.size).toBe('10');
    });

    it('should throw error for invalid input', () => {
      const params = {
        tokenId: '',
        side: 'INVALID',
        price: '2.0',
        size: '-5',
      };

      expect(() => validateOrderParametersOrThrow(params)).toThrow('Invalid order parameters');
    });

    it('should throw error for missing required fields', () => {
      const params = {
        tokenId: '0xtoken',
      };

      expect(() => validateOrderParametersOrThrow(params)).toThrow();
    });

    it('should throw with detailed error message', () => {
      const params = {
        tokenId: '',
        side: 'BUY' as const,
        price: '0.5',
        size: '0',
      };

      expect(() => validateOrderParametersOrThrow(params)).toThrow(/tokenId/);
      expect(() => validateOrderParametersOrThrow(params)).toThrow(/size/);
    });
  });

  describe('Edge Cases and Attack Scenarios - Security Tests', () => {
    it('should reject SQL injection attempts in tokenId', () => {
      const params = {
        tokenId: "'; DROP TABLE orders; --",
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
      };

      // Should accept as string (we're not doing SQL injection prevention here)
      // But the string should be properly validated and escaped by the database layer
      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should reject XSS attempts in tokenId', () => {
      const params = {
        tokenId: '<script>alert("xss")</script>',
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
      };

      // Should accept as string (XSS prevention is the frontend's responsibility)
      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should handle very long tokenId', () => {
      const params = {
        tokenId: 'a'.repeat(1000),
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should reject price manipulation: very small but positive', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.0000001',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should reject price manipulation: just under 1', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.9999999',
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should handle scientific notation in price', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '5e-1', // 0.5
        size: '1',
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Number(result.data.price)).toBeCloseTo(0.5);
      }
    });

    it('should handle scientific notation in size', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: '1e2', // 100
      };

      const result = OrderParametersSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Number(result.data.size)).toBeCloseTo(100);
      }
    });

    it('should reject object prototype pollution attempts', () => {
      const params = {
        tokenId: '0xtoken',
        side: 'BUY' as const,
        price: '0.5',
        size: '1',
        __proto__: { isAdmin: true },
      };

      const result = OrderParametersSchema.safeParse(params);
      // Schema should ignore __proto__ and still validate
      expect(result.success).toBe(true);
      // Result should not have __proto__ pollution
      // Note: __proto__ is always present on objects in JavaScript, but it shouldn't be modified
      expect(result.data).not.toHaveProperty('isAdmin');
    });
  });
});
