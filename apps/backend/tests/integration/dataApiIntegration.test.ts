import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataApiClient, ActivityEvent } from '../../src/clients/dataApi';
import { AuditTrail } from '../../src/trading/auditTrail';
import { Position, Fill } from '@polymarket/shared';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

/**
 * Integration tests for DataApiClient with AuditTrail.
 * 
 * These tests verify that:
 * 1. Data API fills can be reconciled with audit trail records
 * 2. Position data from Data API matches audit trail calculations
 * 3. Activity events can be stored and queried for compliance
 * 
 * Related Issues: #223, #102, #229 (PR-001)
 * Gap Analysis: PA-002 (Audit Trail)
 */
describe('DataApiClient + AuditTrail Integration', () => {
  let dataApiClient: DataApiClient;
  let auditTrail: AuditTrail;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
  };
  const testDbPath = path.join(os.tmpdir(), `test-audit-integration-${Date.now()}.db`);
  const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

    // Create clients
    dataApiClient = new DataApiClient();
    auditTrail = new AuditTrail(testDbPath);
  });

  afterEach(() => {
    // Clean up test database
    auditTrail.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Fill Reconciliation', () => {
    it('should reconcile fills from Data API with audit trail records', async () => {
      // Mock fills from Data API
      const dataApiFills: Fill[] = [
        {
          orderId: 'order-1',
          tokenId: '0xtoken1',
          side: 'BUY',
          price: '0.55',
          size: '100',
          timestamp: 1234567890000,
          fee: '0.11',
          fillId: 'fill-1',
        },
        {
          orderId: 'order-2',
          tokenId: '0xtoken1',
          side: 'SELL',
          price: '0.60',
          size: '50',
          timestamp: 1234567900000,
          fee: '0.06',
          fillId: 'fill-2',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: dataApiFills });

      // Record orders first (required for foreign key constraint)
      auditTrail.recordOrder({
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '100',
        status: 'MATCHED',
        createdAt: 1234567890000,
      });

      // Record one fill in audit trail (simulating local tracking)
      auditTrail.recordFill(dataApiFills[0]);

      // Fetch fills from Data API
      const apiFills = await dataApiClient.getTrades(mockAddress, {
        tokenId: '0xtoken1',
      });

      // Get fills from audit trail
      const auditFills = auditTrail.getFills({ tokenId: '0xtoken1' });

      // Verify we got fills from both sources
      expect(apiFills).toHaveLength(2);
      expect(auditFills).toHaveLength(1); // Only recorded one locally

      // Reconciliation logic: find missing fills by checking fill IDs
      // Note: audit trail auto-generates fillId from database, Data API provides its own fillId
      const auditFillIds = new Set(
        auditFills.map(f => f.fillId).filter((id): id is string => Boolean(id))
      );
      // For this test, we'll use orderId as proxy since audit trail doesn't preserve external fillId
      const auditOrderIds = new Set(auditFills.map(f => f.orderId));
      const missingFills = apiFills.filter(f => !auditOrderIds.has(f.orderId));

      // Should detect one missing fill (order-2 not in audit trail)
      expect(missingFills).toHaveLength(1);
      expect(missingFills[0].orderId).toBe('order-2');

      // Record missing order and fill to complete reconciliation
      auditTrail.recordOrder({
        orderId: 'order-2',
        tokenId: '0xtoken1',
        side: 'SELL',
        price: '0.60',
        size: '50',
        status: 'MATCHED',
        createdAt: 1234567900000,
      });

      for (const fill of missingFills) {
        auditTrail.recordFill(fill);
      }

      // Verify audit trail now has both fills
      const reconciledFills = auditTrail.getFills({ tokenId: '0xtoken1' });
      expect(reconciledFills).toHaveLength(2);

      // Verify both orders are present
      const orderIds = reconciledFills.map(f => f.orderId).sort();
      expect(orderIds).toEqual(['order-1', 'order-2']);
    });

    it('should detect fills in audit trail not present in Data API', async () => {
      // Scenario: Local audit trail has a fill that's not in Data API response
      // This could indicate a data sync issue

      const localFill: Fill = {
        orderId: 'order-local',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.52',
        size: '75',
        timestamp: 1234567880000,
        fee: '0.078',
        fillId: 'fill-local',
      };

      // Record order first (required for foreign key)
      auditTrail.recordOrder({
        orderId: 'order-local',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.52',
        size: '75',
        status: 'MATCHED',
        createdAt: 1234567880000,
      });

      // Record in audit trail
      auditTrail.recordFill(localFill);

      // Mock Data API returns empty (or missing this fill)
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      // Fetch from Data API
      const apiFills = await dataApiClient.getTrades(mockAddress, {
        tokenId: '0xtoken1',
      });

      // Get from audit trail
      const auditFills = auditTrail.getFills({ tokenId: '0xtoken1' });

      // Verify discrepancy
      expect(apiFills).toHaveLength(0);
      expect(auditFills).toHaveLength(1);

      // This is a reconciliation alert - local has fills that API doesn't
      // In a real scenario with fillId tracking, use fillId. Here we use orderId as proxy.
      const apiOrderIds = new Set(apiFills.map(f => f.orderId));
      const orphanedFills = auditFills.filter(f => !apiOrderIds.has(f.orderId));

      expect(orphanedFills).toHaveLength(1);
      expect(orphanedFills[0].orderId).toBe('order-local');
    });

    it('should use time ranges for incremental reconciliation', async () => {
      // Scenario: Only reconcile fills from last 24 hours

      const now = Date.now();
      const yesterday = now - 86400000;

      const recentFills: Fill[] = [
        {
          orderId: 'order-recent',
          tokenId: '0xtoken1',
          side: 'BUY',
          price: '0.55',
          size: '100',
          timestamp: now - 3600000, // 1 hour ago
          fee: '0.11',
          fillId: 'fill-recent',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: recentFills });

      // Fetch recent fills only
      const fills = await dataApiClient.getTrades(mockAddress, {
        startTime: yesterday,
        endTime: now,
      });

      expect(fills).toHaveLength(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trades', {
        params: {
          address: mockAddress,
          startTime: yesterday,
          endTime: now,
        },
      });

      // Record order and fill for reconciliation
      auditTrail.recordOrder({
        orderId: 'order-recent',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '100',
        status: 'MATCHED',
        createdAt: now - 3600000,
      });

      for (const fill of fills) {
        auditTrail.recordFill(fill);
      }

      const auditFills = auditTrail.getFills({ 
        startTime: yesterday 
      });
      expect(auditFills).toHaveLength(1);
    });
  });

  describe('Position Verification', () => {
    it('should verify positions against Data API ground truth', async () => {
      // Mock positions from Data API (ground truth)
      const dataApiPositions: Position[] = [
        {
          tokenId: '0xtoken1',
          size: '100',
          averagePrice: '0.55',
          marketValue: '55',
          unrealizedPnl: '5',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: dataApiPositions });

      // Simulate local position tracking (from fills in audit trail)
      const fills: Fill[] = [
        {
          orderId: 'order-1',
          tokenId: '0xtoken1',
          side: 'BUY',
          price: '0.54',
          size: '50',
          timestamp: Date.now() - 7200000,
          fee: '0.054',
        },
        {
          orderId: 'order-2',
          tokenId: '0xtoken1',
          side: 'BUY',
          price: '0.56',
          size: '50',
          timestamp: Date.now() - 3600000,
          fee: '0.056',
        },
      ];

      // Record orders first (required for foreign key)
      auditTrail.recordOrder({
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.54',
        size: '50',
        status: 'MATCHED',
        createdAt: Date.now() - 7200000,
      });

      auditTrail.recordOrder({
        orderId: 'order-2',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.56',
        size: '50',
        status: 'MATCHED',
        createdAt: Date.now() - 3600000,
      });

      // Record fills in audit trail
      for (const fill of fills) {
        auditTrail.recordFill(fill);
      }

      // Calculate local position from fills with proper cost basis tracking
      const auditFills = auditTrail.getFills({ tokenId: '0xtoken1' });
      let netSize = 0;
      let costBasis = 0;

      for (const fill of auditFills) {
        const fillSize = parseFloat(fill.size);
        const fillPrice = parseFloat(fill.price);
        
        if (fill.side === 'BUY') {
          costBasis += fillSize * fillPrice;
          netSize += fillSize;
        } else { // SELL
          // Reduce position size, reduce cost basis proportionally
          if (netSize > 0) {
            const avgPrice = costBasis / netSize;
            costBasis -= fillSize * avgPrice;
          }
          netSize -= fillSize;
        }
      }

      const localAvgPrice = netSize > 0 ? costBasis / netSize : 0;

      // Fetch positions from Data API
      const apiPositions = await dataApiClient.getPositions(mockAddress);

      // Compare local calculation with Data API ground truth
      expect(apiPositions).toHaveLength(1);
      const apiPosition = apiPositions[0];

      expect(parseFloat(apiPosition.size)).toBe(netSize);
      // Average price should be close (accounting for fees and rounding)
      expect(Math.abs(parseFloat(apiPosition.averagePrice) - localAvgPrice)).toBeLessThan(0.01);
    });

    it('should detect position drift between local and Data API', async () => {
      // Scenario: Local position doesn't match Data API (missed fill?)

      // Data API shows position
      const dataApiPositions: Position[] = [
        {
          tokenId: '0xtoken1',
          size: '150', // Data API says 150
          averagePrice: '0.55',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: dataApiPositions });

      // Local audit trail only has fills totaling 100
      const localFills: Fill[] = [
        {
          orderId: 'order-1',
          tokenId: '0xtoken1',
          side: 'BUY',
          price: '0.55',
          size: '100', // Local only shows 100
          timestamp: Date.now(),
          fee: '0.11',
        },
      ];

      // Record order first
      auditTrail.recordOrder({
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '100',
        status: 'MATCHED',
        createdAt: Date.now(),
      });

      for (const fill of localFills) {
        auditTrail.recordFill(fill);
      }

      // Calculate local position
      const auditFills = auditTrail.getFills({ tokenId: '0xtoken1' });
      const localSize = auditFills.reduce((sum, f) => {
        const size = parseFloat(f.size);
        return f.side === 'BUY' ? sum + size : sum - size;
      }, 0);

      // Fetch from Data API
      const apiPositions = await dataApiClient.getPositions(mockAddress);
      const apiSize = parseFloat(apiPositions[0].size);

      // Detect drift
      const positionDrift = apiSize - localSize;
      expect(positionDrift).toBe(50); // 150 - 100 = 50 position drift

      // This indicates we missed 50 units worth of fills
      // In production, this would trigger fill reconciliation
    });
  });

  describe('Activity Audit Trail', () => {
    it('should store activity events for compliance audit', async () => {
      const activityEvents: ActivityEvent[] = [
        {
          id: 'event-1',
          address: mockAddress,
          eventType: 'order_created',
          tokenId: '0xtoken1',
          orderId: 'order-1',
          details: { price: '0.55', size: '100' },
          timestamp: Date.now() - 3600000,
        },
        {
          id: 'event-2',
          address: mockAddress,
          eventType: 'trade',
          tokenId: '0xtoken1',
          orderId: 'order-1',
          details: { price: '0.55', size: '100', fee: '0.11' },
          timestamp: Date.now() - 1800000,
        },
        {
          id: 'event-3',
          address: mockAddress,
          eventType: 'order_cancelled',
          tokenId: '0xtoken2',
          orderId: 'order-2',
          details: { reason: 'user_requested' },
          timestamp: Date.now() - 900000,
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: activityEvents });

      // Create orders first (required for audit trail foreign keys)
      auditTrail.recordOrder({
        orderId: 'order-1',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '100',
        status: 'MATCHED',
        createdAt: Date.now() - 3600000,
      });

      auditTrail.recordOrder({
        orderId: 'order-2',
        tokenId: '0xtoken2',
        side: 'SELL',
        price: '0.60',
        size: '50',
        status: 'CANCELLED',
        createdAt: Date.now() - 900000,
      });

      // Fetch activity from Data API
      const events = await dataApiClient.getActivity(mockAddress);

      // Store each event in audit trail for compliance
      for (const event of events) {
        if (event.orderId) {
          auditTrail.recordOrderEvent(
            event.orderId,
            event.eventType,
            JSON.stringify(event.details)
          );
        }
      }

      // Verify events are stored
      const order1Events = auditTrail.getOrderEvents('order-1');
      expect(order1Events).toHaveLength(2); // order_created and trade

      const order2Events = auditTrail.getOrderEvents('order-2');
      expect(order2Events).toHaveLength(1); // order_cancelled

      // Verify event details
      expect(order1Events[0].eventType).toBe('order_created');
      expect(order1Events[1].eventType).toBe('trade');
      expect(order2Events[0].eventType).toBe('order_cancelled');
    });

    it('should filter activity by event type for specific audits', async () => {
      const tradeEvents: ActivityEvent[] = [
        {
          id: 'trade-1',
          address: mockAddress,
          eventType: 'trade',
          tokenId: '0xtoken1',
          orderId: 'order-1',
          details: { price: '0.55', size: '100' },
          timestamp: Date.now(),
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: tradeEvents });

      // Fetch only trade events for audit
      const trades = await dataApiClient.getActivity(mockAddress, {
        eventType: 'trade',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/activity', {
        params: {
          address: mockAddress,
          eventType: 'trade',
        },
      });

      expect(trades).toHaveLength(1);
      expect(trades[0].eventType).toBe('trade');
    });
  });

  describe('Pagination for Large Datasets', () => {
    it('should handle paginated fill history with helper function', async () => {
      // Helper to create a page of mock fills with stable, predictable data
      const createMockFillsPage = (startIndex: number, count: number): Fill[] => {
        const fills: Fill[] = [];
        for (let i = 0; i < count; i += 1) {
          const index = startIndex + i;
          fills.push({
            orderId: `order-${index}`,
            tokenId: '0xtoken1',
            side: index % 2 === 0 ? 'BUY' : 'SELL',
            price: '0.55',
            size: '10',
            timestamp: Date.now() - index * 1000,
            fee: '0.011',
            fillId: `fill-${index}`,
          });
        }
        return fills;
      };

      // Simulate two pages of API responses: first full page, then final partial page
      const page1Fills: Fill[] = createMockFillsPage(0, 100);
      const page2Fills: Fill[] = createMockFillsPage(100, 20);

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: page1Fills })
        .mockResolvedValueOnce({ data: page2Fills });

      // Example pagination helper: in production this pattern would live in a service
      // that uses DataApiClient for complete history retrieval
      const fetchAllTradesPaginated = async (
        address: string,
        params: Record<string, unknown> | undefined,
        pageSize = 100,
        maxIterations = 100,
      ): Promise<Fill[]> => {
        const allFills: Fill[] = [];
        let offset = 0;
        let iterations = 0;

        // Loop with explicit max-iteration guard to avoid infinite pagination
        // if the API or client behaves unexpectedly
        while (true) {
          if (iterations >= maxIterations) {
            throw new Error('Max pagination iterations exceeded while fetching trades');
          }
          iterations += 1;

          const page = await dataApiClient.getTrades(address, {
            ...params,
            limit: pageSize,
            offset,
          });

          allFills.push(...page);

          if (page.length < pageSize) {
            // Last page - no more data
            break;
          }

          offset += pageSize;
        }

        return allFills;
      };

      // Fetch all pages
      const allFills = await fetchAllTradesPaginated(mockAddress, undefined, 100, 10);

      expect(allFills).toHaveLength(120);
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, '/trades', {
        params: {
          address: mockAddress,
          limit: 100,
          offset: 0,
        },
      });
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, '/trades', {
        params: {
          address: mockAddress,
          limit: 100,
          offset: 100,
        },
      });

      // This test demonstrates how production code should paginate until no more data
      // while protecting against infinite loops via an explicit maxIterations guard
    });
  });

  describe('Error Handling in Integration', () => {
    it('should gracefully handle Data API unavailability', async () => {
      // Mock Data API failure
      const error = new Error('Service unavailable - 503');
      (error as Error & { response: { status: number } }).response = { status: 503 };
      mockAxiosInstance.get.mockRejectedValue(error);

      // Attempt to reconcile
      await expect(
        dataApiClient.getPositions(mockAddress)
      ).rejects.toThrow();

      // Audit trail should still work independently
      const testFill: Fill = {
        orderId: 'local-order',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '100',
        timestamp: Date.now(),
        fee: '0.11',
      };

      // Record order first
      auditTrail.recordOrder({
        orderId: 'local-order',
        tokenId: '0xtoken1',
        side: 'BUY',
        price: '0.55',
        size: '100',
        status: 'MATCHED',
        createdAt: Date.now(),
      });

      auditTrail.recordFill(testFill);

      const fills = auditTrail.getFills();
      expect(fills).toHaveLength(1);

      // Can continue operating with local data even if Data API is down
    });
  });
});
