import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscrepancyDetector } from '../../src/sync/discrepancyDetector';
import { DiscrepancyType, DiscrepancySeverity, SyncConfig } from '../../src/sync/types';
import { Order, Position, Balance, Orderbook } from '@polymarket/shared';

describe('DiscrepancyDetector', () => {
  let detector: DiscrepancyDetector;
  let config: SyncConfig;

  beforeEach(() => {
    config = {
      syncIntervalMs: 5 * 60 * 1000,
      balanceDriftThresholdPercent: 1.0,
      balanceDriftThresholdAbsolute: 10.0,
      orderbookStaleThresholdMs: 30 * 1000,
      autoRecoveryEnabled: true,
      maxRecoveryAttempts: 3,
      syncOrdersEnabled: true,
      syncPositionsEnabled: true,
      syncBalancesEnabled: true,
      syncOrderbooksEnabled: true,
    };
    detector = new DiscrepancyDetector(config);
  });

  describe('compareOrders', () => {
    it('should detect missing orders', () => {
      const localOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];
      const remoteOrders: Order[] = [];

      const discrepancies = detector.compareOrders(localOrders, remoteOrders);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.MISSING_ORDER);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.HIGH);
    });

    it('should detect extra orders', () => {
      const localOrders: Order[] = [];
      const remoteOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];

      const discrepancies = detector.compareOrders(localOrders, remoteOrders);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.EXTRA_ORDER);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.HIGH);
    });

    it('should detect order status mismatches', () => {
      const localOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];
      const remoteOrders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'MATCHED',
          filledSize: '100',
          createdAt: Date.now(),
        } as Order,
      ];

      const discrepancies = detector.compareOrders(localOrders, remoteOrders);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.ORDER_STATUS_MISMATCH);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.MEDIUM);
      expect(discrepancies[0].metadata?.localStatus).toBe('OPEN');
      expect(discrepancies[0].metadata?.remoteStatus).toBe('MATCHED');
    });

    it('should not detect discrepancies for identical orders', () => {
      const orders: Order[] = [
        {
          orderId: 'order-1',
          tokenId: 'token-1',
          side: 'BUY',
          price: '0.5',
          size: '100',
          status: 'OPEN',
          filledSize: '0',
          createdAt: Date.now(),
        } as Order,
      ];

      const discrepancies = detector.compareOrders(orders, orders);

      expect(discrepancies).toHaveLength(0);
    });
  });

  describe('comparePositions', () => {
    it('should detect position size mismatches', () => {
      const localPositions: Position[] = [
        {
          tokenId: 'token-1',
          size: '100',
          averagePrice: '0.5',
          realizedPnl: '0',
        } as Position,
      ];
      const remotePositions: Position[] = [
        {
          tokenId: 'token-1',
          size: '150',
          averagePrice: '0.5',
          realizedPnl: '0',
        } as Position,
      ];

      const discrepancies = detector.comparePositions(localPositions, remotePositions);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.POSITION_MISMATCH);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.HIGH);
      expect(discrepancies[0].metadata?.difference).toBe('-50');
    });

    it('should detect missing local positions', () => {
      const localPositions: Position[] = [];
      const remotePositions: Position[] = [
        {
          tokenId: 'token-1',
          size: '100',
          averagePrice: '0.5',
          realizedPnl: '0',
        } as Position,
      ];

      const discrepancies = detector.comparePositions(localPositions, remotePositions);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.POSITION_MISMATCH);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.HIGH);
    });
  });

  describe('compareBalances', () => {
    it('should detect balance mismatches above thresholds', () => {
      const localBalances: Balance[] = [
        {
          tokenId: 'USDC',
          amount: '1000',
        } as Balance,
      ];
      const remoteBalances: Balance[] = [
        {
          tokenId: 'USDC',
          amount: '900', // 10% difference, above 1% threshold
        } as Balance,
      ];

      const discrepancies = detector.compareBalances(localBalances, remoteBalances);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.BALANCE_MISMATCH);
      expect(discrepancies[0].metadata?.difference).toBe('100.00');
      expect(discrepancies[0].metadata?.percentDiff).toBe('11.11');
    });

    it('should not detect small balance differences below thresholds', () => {
      const localBalances: Balance[] = [
        {
          tokenId: 'USDC',
          amount: '1000',
        } as Balance,
      ];
      const remoteBalances: Balance[] = [
        {
          tokenId: 'USDC',
          amount: '999', // 0.1% difference, below 1% threshold
        } as Balance,
      ];

      const discrepancies = detector.compareBalances(localBalances, remoteBalances);

      expect(discrepancies).toHaveLength(0);
    });

    it('should detect critical balance discrepancies', () => {
      const localBalances: Balance[] = [
        {
          tokenId: 'USDC',
          amount: '10000',
        } as Balance,
      ];
      const remoteBalances: Balance[] = [
        {
          tokenId: 'USDC',
          amount: '8000', // 20% difference - critical
        } as Balance,
      ];

      const discrepancies = detector.compareBalances(localBalances, remoteBalances);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.CRITICAL);
    });
  });

  describe('checkOrderbookFreshness', () => {
    it('should detect stale orderbooks', () => {
      const now = Date.now();
      const orderbooks = new Map<string, Orderbook>([
        [
          'token-1',
          {
            market: 'market-1',
            asset_id: 'token-1',
            bids: [],
            asks: [],
            timestamp: now - 150 * 1000, // 150 seconds old - should be MEDIUM
          },
        ],
      ]);

      const discrepancies = detector.checkOrderbookFreshness(orderbooks);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.ORDERBOOK_STALE);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.MEDIUM);
    });

    it('should not detect fresh orderbooks', () => {
      const now = Date.now();
      const orderbooks = new Map<string, Orderbook>([
        [
          'token-1',
          {
            market: 'market-1',
            asset_id: 'token-1',
            bids: [],
            asks: [],
            timestamp: now - 10 * 1000, // 10 seconds old
          },
        ],
      ]);

      const discrepancies = detector.checkOrderbookFreshness(orderbooks);

      expect(discrepancies).toHaveLength(0);
    });

    it('should categorize staleness severity correctly', () => {
      const now = Date.now();
      const orderbooks = new Map<string, Orderbook>([
        [
          'token-1',
          {
            market: 'market-1',
            asset_id: 'token-1',
            bids: [],
            asks: [],
            timestamp: now - 400 * 1000, // 6.7 minutes - should be HIGH
          },
        ],
      ]);

      const discrepancies = detector.checkOrderbookFreshness(orderbooks);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.HIGH);
    });
  });

  describe('detectMissedFills', () => {
    it('should detect fills that exist remotely but not locally', () => {
      const localFills: any[] = [];
      const remoteFills: any[] = [
        {
          fillId: 'fill-1',
          orderId: 'order-1',
          size: '50',
          price: '0.5',
          timestamp: Date.now(),
        },
      ];

      const discrepancies = detector.detectMissedFills(localFills, remoteFills);

      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].type).toBe(DiscrepancyType.MISSED_FILL);
      expect(discrepancies[0].severity).toBe(DiscrepancySeverity.HIGH);
      expect(discrepancies[0].metadata?.fillId).toBe('fill-1');
    });

    it('should not detect fills that exist both locally and remotely', () => {
      const fills: any[] = [
        {
          fillId: 'fill-1',
          orderId: 'order-1',
          size: '50',
          price: '0.5',
          timestamp: Date.now(),
        },
      ];

      const discrepancies = detector.detectMissedFills(fills, fills);

      expect(discrepancies).toHaveLength(0);
    });
  });
});
