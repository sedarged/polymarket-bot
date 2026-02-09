import { Position, Fill } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { BaseApiClient } from './baseApiClient';

/**
 * Known activity event types returned by the Data API.
 * NOTE: This may not be exhaustive - the API may add new event types over time.
 */
export const ActivityEventTypes = {
  ORDER_CREATED: 'order_created',
  ORDER_CANCELLED: 'order_cancelled',
  ORDER_MATCHED: 'order_matched',
  TRADE: 'trade',
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
} as const;

/**
 * Activity event types returned by the Data API
 */
export interface ActivityEvent {
  id: string;
  address: string;
  /**
   * Event type identifier.
   * 
   * NOTE: This may include values beyond those listed in ActivityEventTypes
   * as the external Data API evolves. Treat unknown values defensively.
   */
  eventType: string;
  tokenId?: string;
  orderId?: string;
  details: Record<string, unknown>;
  timestamp: number;
}

/**
 * Data API Client
 * 
 * Official Documentation: https://data-api.polymarket.com
 * Base URL: https://data-api.polymarket.com (verified 2026-02-06)
 * 
 * The Data API provides comprehensive access to user trading data including:
 * - Current positions with market values
 * - Complete trade/fill history for reconciliation
 * - Full account activity audit trail
 * 
 * This is CRITICAL for:
 * - Position verification against exchange ground truth
 * - Fill history validation and reconciliation
 * - Compliance and audit requirements
 * - Gap PA-002: Audit trail integration
 * 
 * Implementation Review: See docs/api-missing-endpoints-analysis.md
 * Related Issues: #223, #102, #229 (PR-001)
 * 
 * Reliability Features (inherited from BaseApiClient):
 * - Circuit breaker to prevent cascade failures
 * - Retry logic with exponential backoff and jitter
 * - Configurable timeouts
 * - Error classification for smart retry decisions
 * 
 * @see {@link https://data-api.polymarket.com}
 */
export class DataApiClient extends BaseApiClient {
  constructor() {
    // Base URL verified against official Polymarket Data API documentation (2026-02-06)
    // Endpoints: /positions, /trades, /activity
    super('https://data-api.polymarket.com', 'data-api');
  }

  /**
   * Get current positions for a wallet address.
   * 
   * CRITICAL for position reconciliation - provides ground truth from exchange.
   * Use this to verify internal position tracking against actual exchange state.
   * 
   * @param address - Wallet address to query positions for
   * @param params - Optional query parameters
   * @param params.tokenId - Filter by specific token/market
   * @param params.limit - Maximum number of positions to return (default: 100)
   * @param params.offset - Pagination offset (default: 0)
   * @returns Array of current positions with market values
   * 
   * @example
   * ```typescript
   * const positions = await dataApi.getPositions('0x1234...', { limit: 50 });
   * for (const position of positions) {
   *   console.log(`Token ${position.tokenId}: ${position.size} @ ${position.averagePrice}`);
   * }
   * ```
   */
  async getPositions(
    address: string,
    params?: {
      tokenId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Position[]> {
    return this.executeWithRetry(async () => {
      logger.debug('Fetching positions from Data API', { address, params });
      
      const response = await this.client.get<Position[]>('/positions', {
        params: {
          address,
          ...params,
        },
      });

      logger.info('Retrieved positions', { 
        address, 
        count: response.data.length,
        params 
      });
      return response.data;
    });
  }

  /**
   * Get trade/fill history for a wallet address.
   * 
   * CRITICAL for fill verification - provides complete trading history from exchange.
   * Use this to reconcile internal fill tracking and detect missed fills.
   * 
   * @param address - Wallet address to query trades for
   * @param params - Optional query parameters
   * @param params.tokenId - Filter by specific token/market
   * @param params.startTime - Filter trades after this timestamp (milliseconds)
   * @param params.endTime - Filter trades before this timestamp (milliseconds)
   * @param params.limit - Maximum number of trades to return (default: 100)
   * @param params.offset - Pagination offset (default: 0)
   * @returns Array of trade/fill records
   * 
   * @example
   * ```typescript
   * const trades = await dataApi.getTrades('0x1234...', { 
   *   startTime: Date.now() - 86400000, // Last 24 hours
   *   limit: 100 
   * });
   * console.log(`Found ${trades.length} trades in last 24 hours`);
   * ```
   */
  async getTrades(
    address: string,
    params?: {
      tokenId?: string;
      startTime?: number;
      endTime?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<Fill[]> {
    return this.executeWithRetry(async () => {
      logger.debug('Fetching trades from Data API', { address, params });
      
      const response = await this.client.get<Fill[]>('/trades', {
        params: {
          address,
          ...params,
        },
      });

      logger.info('Retrieved trades', { 
        address, 
        count: response.data.length,
        params 
      });
      return response.data;
    });
  }

  /**
   * Get account activity history for audit trail.
   * 
   * HIGH PRIORITY for compliance - provides complete audit trail of all account activity.
   * Includes orders, fills, cancellations, deposits, withdrawals, and other events.
   * 
   * @param address - Wallet address to query activity for
   * @param params - Optional query parameters
   * @param params.eventType - Filter by specific event type
   * @param params.startTime - Filter events after this timestamp (milliseconds)
   * @param params.endTime - Filter events before this timestamp (milliseconds)
   * @param params.limit - Maximum number of events to return (default: 100)
   * @param params.offset - Pagination offset (default: 0)
   * @returns Array of activity events
   * 
   * @example
   * ```typescript
   * const activity = await dataApi.getActivity('0x1234...', { 
   *   eventType: 'trade',
   *   limit: 50 
   * });
   * for (const event of activity) {
   *   console.log(`${event.eventType} at ${new Date(event.timestamp)}`);
   * }
   * ```
   */
  async getActivity(
    address: string,
    params?: {
      eventType?: string;
      startTime?: number;
      endTime?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<ActivityEvent[]> {
    return this.executeWithRetry(async () => {
      logger.debug('Fetching activity from Data API', { address, params });
      
      const response = await this.client.get<ActivityEvent[]>('/activity', {
        params: {
          address,
          ...params,
        },
      });

      logger.info('Retrieved activity events', { 
        address, 
        count: response.data.length,
        params 
      });
      return response.data;
    });
  }

  /**
   * Get historical events for a wallet address (market/account history)
   */
  async getHistory(
    address: string,
    params?: {
      eventType?: string;
      startTime?: number;
      endTime?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<History[]> {
    return this.executeWithRetry(async () => {
      logger.debug('Fetching history from Data API', { address, params });
      const response = await this.client.get<History[]>('/history', {
        params: {
          address,
          ...params,
        },
      });
      logger.info('Retrieved history', { address, count: response.data.length, params });
      return response.data;
    });
  }

  /**
   * Get replay events for a wallet address (backtesting)
   */
  async getReplay(
    address: string,
    params?: {
      eventType?: string;
      startTime?: number;
      endTime?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<Replay[]> {
    return this.executeWithRetry(async () => {
      logger.debug('Fetching replay from Data API', { address, params });
      const response = await this.client.get<Replay[]>('/replay', {
        params: {
          address,
          ...params,
        },
      });
      logger.info('Retrieved replay', { address, count: response.data.length, params });
      return response.data;
    });
  }
}

/**
 * Shared Data API client instance for application code.
 * 
 * This instance should be used by reconciliation services, trading
 * workflows, and audit endpoints so that all Data API access shares
 * a single circuit breaker and consistent configuration.
 */
export const dataApiClient = new DataApiClient();
