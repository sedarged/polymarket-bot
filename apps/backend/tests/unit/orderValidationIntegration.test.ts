import { describe, it, expect, beforeEach } from 'vitest';
import { PaperTradingEngine } from '../../src/trading/paperTradingEngine';
import { Orderbook } from '@polymarket/shared';

/**
 * Integration Tests: Order Parameter Validation in PaperTradingEngine
 * Audit Finding A-015
 * 
 * Tests that the PaperTradingEngine properly validates order parameters
 * before creating orders, preventing malformed orders from entering the system.
 */

describe('PaperTradingEngine - Order Parameter Validation (A-015)', () => {
  let engine: PaperTradingEngine;

  beforeEach(() => {
    engine = new PaperTradingEngine(undefined, 10000);
  });

  describe('Valid Order Creation', () => {
    it('should create order with valid string parameters', () => {
      const order = engine.createOrder('0xtoken', 'BUY', '0.55', '10');
      
      expect(order).toBeDefined();
      expect(order.tokenId).toBe('0xtoken');
      expect(order.side).toBe('BUY');
      expect(order.price).toBe('0.55');
      expect(order.size).toBe('10');
      expect(order.status).toBe('OPEN');
    });

    it('should create order with decimal values', () => {
      const order = engine.createOrder('token-123', 'SELL', '0.456789', '123.456');
      
      expect(order).toBeDefined();
      expect(order.price).toBe('0.456789');
      expect(order.size).toBe('123.456');
    });

    it('should create order with edge case price near 0', () => {
      const order = engine.createOrder('0xtoken', 'BUY', '0.01', '1');
      
      expect(order).toBeDefined();
      expect(order.price).toBe('0.01');
    });

    it('should create order with edge case price near 1', () => {
      const order = engine.createOrder('0xtoken', 'SELL', '0.99', '1');
      
      expect(order).toBeDefined();
      expect(order.price).toBe('0.99');
    });
  });

  describe('Invalid tokenId Validation', () => {
    it('should reject empty tokenId', () => {
      expect(() => {
        engine.createOrder('', 'BUY', '0.5', '1');
      }).toThrow(/Invalid order parameters/);
      
      expect(() => {
        engine.createOrder('', 'BUY', '0.5', '1');
      }).toThrow(/tokenId/);
    });

    it('should reject whitespace-only tokenId', () => {
      expect(() => {
        engine.createOrder('   ', 'BUY', '0.5', '1');
      }).toThrow(/Invalid order parameters/);
    });
  });

  describe('Invalid side Validation', () => {
    it('should reject lowercase side', () => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        engine.createOrder('0xtoken', 'buy', '0.5', '1');
      }).toThrow(/Invalid order parameters/);
      
      expect(() => {
        // @ts-expect-error - testing invalid input
        engine.createOrder('0xtoken', 'buy', '0.5', '1');
      }).toThrow(/side/);
    });

    it('should reject invalid side value', () => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        engine.createOrder('0xtoken', 'LONG', '0.5', '1');
      }).toThrow(/Invalid order parameters/);
    });
  });

  describe('Invalid price Validation', () => {
    it('should reject zero price', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '0', '1');
      }).toThrow(/Invalid order parameters/);
      
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '0', '1');
      }).toThrow(/price/i);
    });

    it('should reject negative price', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '-0.5', '1');
      }).toThrow(/Invalid order parameters/);
    });

    it('should reject price equal to 1', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '1', '1');
      }).toThrow(/Invalid order parameters/);
      
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '1', '1');
      }).toThrow(/Price must be between 0 and 1/);
    });

    it('should reject price greater than 1', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '1.5', '1');
      }).toThrow(/Invalid order parameters/);
    });

    it('should reject non-numeric price', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', 'invalid', '1');
      }).toThrow(/Invalid order parameters/);
    });
  });

  describe('Invalid size Validation', () => {
    it('should reject zero size', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '0.5', '0');
      }).toThrow(/Invalid order parameters/);
      
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '0.5', '0');
      }).toThrow(/size/i);
    });

    it('should reject negative size', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '0.5', '-10');
      }).toThrow(/Invalid order parameters/);
    });

    it('should reject non-numeric size', () => {
      expect(() => {
        engine.createOrder('0xtoken', 'BUY', '0.5', 'invalid');
      }).toThrow(/Invalid order parameters/);
    });
  });

  describe('Multiple Validation Errors', () => {
    it('should report multiple validation errors', () => {
      expect(() => {
        engine.createOrder('', 'BUY', '0', '0');
      }).toThrow(/Invalid order parameters/);
      
      // Error message should mention multiple fields
      try {
        engine.createOrder('', 'BUY', '0', '0');
      } catch (error) {
        expect((error as Error).message).toContain('tokenId');
        expect((error as Error).message).toContain('price');
        expect((error as Error).message).toContain('size');
      }
    });
  });

  describe('Validation does not affect order filling', () => {
    it('should fill a validated order normally', () => {
      const order = engine.createOrder('0xtoken', 'BUY', '0.55', '10');
      
      const orderbook: Orderbook = {
        asset_id: '0xtoken',
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
        timestamp: Date.now(),
      };
      
      const filled = engine.tryFillOrder(order.orderId, orderbook);
      expect(filled).toBe(true);
      
      // Verify order was filled by checking the order status
      const orders = engine.getOrders();
      const filledOrder = orders.find(o => o.orderId === order.orderId);
      expect(filledOrder?.status).toBe('MATCHED');
    });
  });

  describe('Security: Attack Scenarios', () => {
    it('should handle very long tokenId', () => {
      const longTokenId = 'a'.repeat(1000);
      const order = engine.createOrder(longTokenId, 'BUY', '0.5', '1');
      expect(order.tokenId).toBe(longTokenId);
    });

    it('should handle special characters in tokenId', () => {
      const specialTokenId = '<script>alert("xss")</script>';
      const order = engine.createOrder(specialTokenId, 'BUY', '0.5', '1');
      expect(order.tokenId).toBe(specialTokenId);
    });

    it('should handle scientific notation in price', () => {
      const order = engine.createOrder('0xtoken', 'BUY', '5e-1', '1');
      // Scientific notation is normalized but kept as string
      expect(Number(order.price)).toBeCloseTo(0.5);
    });

    it('should handle scientific notation in size', () => {
      const order = engine.createOrder('0xtoken', 'BUY', '0.5', '1e2');
      // Scientific notation is normalized but kept as string
      expect(Number(order.size)).toBeCloseTo(100);
    });

    it('should reject NaN in numeric fields', () => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        engine.createOrder('0xtoken', 'BUY', NaN, '1');
      }).toThrow(/Invalid order parameters/);
      
      expect(() => {
        // @ts-expect-error - testing invalid input
        engine.createOrder('0xtoken', 'BUY', '0.5', NaN);
      }).toThrow(/Invalid order parameters/);
    });

    it('should reject Infinity in numeric fields', () => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        engine.createOrder('0xtoken', 'BUY', Infinity, '1');
      }).toThrow(/Invalid order parameters/);
      
      expect(() => {
        // @ts-expect-error - testing invalid input
        engine.createOrder('0xtoken', 'BUY', '0.5', Infinity);
      }).toThrow(/Invalid order parameters/);
    });
  });
});
