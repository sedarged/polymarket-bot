import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionService, OrderTypeEnum, ExecutionStatus } from '../../src/trading/executionService';
import { LiquidityValidator } from '../../src/trading/liquidityValidator';
import { TradingClient } from '../../src/clients/tradingClient';
import { Orderbook } from '@polymarket/shared';

describe('ExecutionService - Liquidity Integration', () => {
  let executionService: ExecutionService;
  let tradingClient: TradingClient;
  let liquidityValidator: LiquidityValidator;
  let mockMarketFeedService: any;

  beforeEach(() => {
    // Mock trading client
    tradingClient = {
      createOrder: vi.fn().mockResolvedValue({
        orderId: 'order-123',
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.50',
        size: '10',
        status: 'OPEN',
        createdAt: Date.now(),
      }),
    } as any;

    // Create liquidity validator
    liquidityValidator = new LiquidityValidator({
      minLiquidityMultiplier: 1.0,
      maxPriceLevels: 10,
      maxOrderbookAgeMs: 5000,
    });

    // Mock market feed service
    mockMarketFeedService = {
      getOrderbook: vi.fn(),
    };
  });

  describe('with liquidity validator configured', () => {
    beforeEach(() => {
      executionService = new ExecutionService(tradingClient, {
        liquidityValidator,
        marketFeedService: mockMarketFeedService,
      });
    });

    it('should allow order when sufficient liquidity exists', async () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.49', size: '100' }],
        asks: [{ price: '0.50', size: '100' }],
        timestamp: Date.now(),
      };

      mockMarketFeedService.getOrderbook.mockReturnValue(orderbook);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '10',
          price: '0.50',
        },
        context: {
          executionId: 'exec-001',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.order).toBeDefined();
      expect(tradingClient.createOrder).toHaveBeenCalled();
    });

    it('should reject order when insufficient liquidity', async () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.49', size: '100' }],
        asks: [{ price: '0.50', size: '5' }], // Not enough liquidity
        timestamp: Date.now(),
      };

      mockMarketFeedService.getOrderbook.mockReturnValue(orderbook);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '10',
          price: '0.50',
        },
        context: {
          executionId: 'exec-002',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Insufficient liquidity');
      expect(tradingClient.createOrder).not.toHaveBeenCalled();
    });

    it('should reject order when orderbook is missing', async () => {
      mockMarketFeedService.getOrderbook.mockReturnValue(null);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '10',
          price: '0.50',
        },
        context: {
          executionId: 'exec-003',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Orderbook data missing');
      expect(tradingClient.createOrder).not.toHaveBeenCalled();
    });

    it('should reject order when orderbook is stale', async () => {
      const staleOrderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.49', size: '100' }],
        asks: [{ price: '0.50', size: '100' }],
        timestamp: Date.now() - 10000, // 10 seconds old
      };

      mockMarketFeedService.getOrderbook.mockReturnValue(staleOrderbook);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '10',
          price: '0.50',
        },
        context: {
          executionId: 'exec-004',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('stale');
      expect(tradingClient.createOrder).not.toHaveBeenCalled();
    });

    it('should check liquidity for SELL orders on bid side', async () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.49', size: '100' }],
        asks: [{ price: '0.50', size: '5' }],
        timestamp: Date.now(),
      };

      mockMarketFeedService.getOrderbook.mockReturnValue(orderbook);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: '0xtoken123',
          side: 'SELL',
          size: '10',
          price: '0.49',
        },
        context: {
          executionId: 'exec-005',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(tradingClient.createOrder).toHaveBeenCalled();
    });

    it('should aggregate liquidity across multiple price levels', async () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.49', size: '100' }],
        asks: [
          { price: '0.50', size: '3' },
          { price: '0.51', size: '3' },
          { price: '0.52', size: '4' },
        ],
        timestamp: Date.now(),
      };

      mockMarketFeedService.getOrderbook.mockReturnValue(orderbook);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '9',
          price: '0.52',
        },
        context: {
          executionId: 'exec-006',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(tradingClient.createOrder).toHaveBeenCalled();
    });

    it('should work with market orders', async () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.49', size: '100' }],
        asks: [{ price: '0.50', size: '100' }],
        timestamp: Date.now(),
      };

      mockMarketFeedService.getOrderbook.mockReturnValue(orderbook);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.MARKET,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '10',
        },
        context: {
          executionId: 'exec-007',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(tradingClient.createOrder).toHaveBeenCalled();
    });

    it('should work with conditional orders', async () => {
      const orderbook: Orderbook = {
        market: '0xmarket',
        asset_id: '0xtoken123',
        bids: [{ price: '0.49', size: '100' }],
        asks: [{ price: '0.50', size: '100' }],
        timestamp: Date.now(),
      };

      mockMarketFeedService.getOrderbook.mockReturnValue(orderbook);

      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.CONDITIONAL,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '10',
          price: '0.50',
          triggerPrice: '0.48',
          triggerCondition: 'BELOW',
        },
        context: {
          executionId: 'exec-008',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      // AUDIT FIX: Conditional orders now return REJECTED (not FAILED) for cleaner error handling
      expect(result.status).toBe(ExecutionStatus.REJECTED);
      expect(result.error?.message).toContain('Conditional orders are not yet supported');
    });
  });

  describe('without liquidity validator', () => {
    beforeEach(() => {
      executionService = new ExecutionService(tradingClient);
    });

    it('should allow orders without liquidity check', async () => {
      const result = await executionService.executeOrder({
        params: {
          orderType: OrderTypeEnum.LIMIT,
          tokenId: '0xtoken123',
          side: 'BUY',
          size: '10',
          price: '0.50',
        },
        context: {
          executionId: 'exec-009',
          executionStrategy: 0, // IMMEDIATE
        },
      });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(tradingClient.createOrder).toHaveBeenCalled();
    });
  });

  describe('with validator but without market feed', () => {
    it('should throw error on construction', () => {
      expect(() => {
        new ExecutionService(tradingClient, {
          liquidityValidator,
        });
      }).toThrow('ExecutionService misconfiguration: LiquidityValidator requires MarketFeedService (GAP-014)');
    });
  });
});
