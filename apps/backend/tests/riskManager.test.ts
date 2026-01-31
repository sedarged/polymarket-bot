import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager } from '../src/trading/riskManager';
import { Order, Position } from '@polymarket/shared';

describe('RiskManager', () => {
  let riskManager: RiskManager;

  beforeEach(() => {
    riskManager = new RiskManager({
      maxExposurePerMarket: 100,
      maxOpenOrders: 5,
      maxDrawdown: 0.20,
      errorRateThreshold: 0.10,
      errorRateWindow: 10,
    });
  });

  describe('initialization', () => {
    it('should initialize with correct config', () => {
      const metrics = riskManager.getMetrics();
      expect(metrics.killed).toBe(false);
      expect(metrics.recentErrors).toBe(0);
      expect(metrics.circuitBreakerTripped).toBe(false);
    });
  });

  describe('checkOrder', () => {
    it('should allow order within limits', () => {
      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '10',
        [],
        []
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject order when max open orders exceeded', () => {
      const orders: Order[] = Array.from({ length: 5 }, (_, i) => ({
        orderId: `order-${i}`,
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.50',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
      }));

      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '10',
        orders,
        []
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Max open orders');
    });

    it('should reject order when max exposure exceeded', () => {
      const positions: Position[] = [{
        tokenId: '0xtoken123',
        size: '90',
        averagePrice: '0.50',
      }];

      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '20',
        [],
        positions
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Max exposure');
    });

    it('should allow order when closing reduces exposure', () => {
      const positions: Position[] = [{
        tokenId: '0xtoken123',
        size: '90',
        averagePrice: '0.50',
      }];

      const result = riskManager.checkOrder(
        '0xtoken123',
        'SELL',
        '50',
        [],
        positions
      );

      expect(result.allowed).toBe(true);
    });

    it('should reject order when sell increases short exposure beyond limit', () => {
      const positions: Position[] = [{
        tokenId: '0xtoken123',
        size: '-90', // Currently short 90
        averagePrice: '0.50',
      }];

      // SELL 20 would increase short to -110, which exceeds limit of 100
      const result = riskManager.checkOrder(
        '0xtoken123',
        'SELL',
        '20',
        [],
        positions
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Max exposure');
    });

    it('should reject order when kill switch is active', () => {
      riskManager.kill();

      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '10',
        [],
        []
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('killed');
    });

    it('should reject order when circuit breaker is tripped', () => {
      // Record enough errors to trip circuit breaker (2 errors out of 10 = 20%)
      for (let i = 0; i < 8; i++) {
        riskManager.recordOperation(false);
      }
      riskManager.recordError('error-1');
      riskManager.recordError('error-2');

      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '10',
        [],
        []
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Circuit breaker');
    });
  });

  describe('checkDrawdown', () => {
    it('should allow trading within drawdown limit', () => {
      const result = riskManager.checkDrawdown(10000, 9000, -500);

      expect(result.allowed).toBe(true);
    });

    it('should reject when drawdown exceeds limit', () => {
      const result = riskManager.checkDrawdown(10000, 5000, -3500);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('drawdown exceeded');
    });

    it('should allow when in profit', () => {
      const result = riskManager.checkDrawdown(10000, 10000, 2000);

      expect(result.allowed).toBe(true);
    });
  });

  describe('error tracking', () => {
    it('should record errors', () => {
      riskManager.recordError('test error');

      const metrics = riskManager.getMetrics();
      expect(metrics.recentErrors).toBe(1);
    });

    it('should track multiple errors', () => {
      riskManager.recordError('error 1');
      riskManager.recordError('error 2');
      riskManager.recordError('error 3');

      const metrics = riskManager.getMetrics();
      expect(metrics.recentErrors).toBe(3);
    });
  });

  describe('circuit breaker', () => {
    it('should not trip with low error rate', () => {
      // Record 1 error out of 11 operations (9.09% error rate < 10% threshold)
      for (let i = 0; i < 10; i++) {
        riskManager.recordOperation(false); // success
      }
      riskManager.recordError('error 1');

      // Should not trip with 1/11 = 9.09% < 10% threshold
      expect(riskManager.isCircuitBreakerTripped()).toBe(false);
    });

    it('should trip with high error rate', () => {
      // Record 2 errors out of 10 operations (20% error rate > 10% threshold)
      for (let i = 0; i < 8; i++) {
        riskManager.recordOperation(false); // success
      }
      riskManager.recordError('error-1');
      riskManager.recordError('error-2');

      expect(riskManager.isCircuitBreakerTripped()).toBe(true);
    });
  });

  describe('kill switch', () => {
    it('should activate kill switch', () => {
      riskManager.kill();

      expect(riskManager.isKilled()).toBe(true);
      
      const metrics = riskManager.getMetrics();
      expect(metrics.killed).toBe(true);
    });

    it('should prevent orders when killed', () => {
      riskManager.kill();

      const result = riskManager.checkOrder(
        '0xtoken123',
        'BUY',
        '10',
        [],
        []
      );

      expect(result.allowed).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset risk manager state', () => {
      riskManager.kill();
      riskManager.recordError('error');

      riskManager.reset();

      expect(riskManager.isKilled()).toBe(false);
      const metrics = riskManager.getMetrics();
      expect(metrics.recentErrors).toBe(0);
    });
  });
});
