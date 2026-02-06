import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry, ErrorType, classifyError } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';
import { Position, Fill } from '@polymarket/shared';

/**
 * Activity event types returned by the Data API
 */
export interface ActivityEvent {
  id: string;
  address: string;
  eventType: 'order_created' | 'order_cancelled' | 'order_matched' | 'trade' | 'deposit' | 'withdrawal';
  tokenId?: string;
  orderId?: string;
  details: Record<string, unknown>;
  timestamp: number;
}

/**
 * Data API Client
 * 
 * Official Documentation: https://data-api.polymarket.com
 * Base URL: https://data-api.polymarket.com
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
 * Reliability Features:
 * - Circuit breaker to prevent cascade failures
 * - Retry logic with exponential backoff and jitter
 * - Configurable timeouts
 * - Error classification for smart retry decisions
 * 
 * @see {@link https://data-api.polymarket.com}
 */
export class DataApiClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://data-api.polymarket.com',
      timeout: 10000,
    });

    this.circuitBreaker = new CircuitBreaker({
      name: 'data-api',
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      successThreshold: 2,
    });

    // Log circuit breaker state changes
    this.circuitBreaker.on('open', (metrics) => {
      logger.error('Data API circuit breaker opened', metrics);
    });

    this.circuitBreaker.on('half-open', (metrics) => {
      logger.warn('Data API circuit breaker half-open, testing recovery', metrics);
    });

    this.circuitBreaker.on('closed', (metrics) => {
      logger.info('Data API circuit breaker closed, service recovered', metrics);
    });
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
    return this.circuitBreaker.execute(() =>
      retry(async () => {
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
      }, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
        jitter: 0.1,
        maxDelay: 30000,
        timeout: 10000,
        totalTimeout: config.retryTotalTimeout,
        isRetryable: (error: Error) => {
          const errorType = classifyError(error);
          // Don't retry permanent errors (4xx except 429)
          if (errorType === ErrorType.PERMANENT) {
            return false;
          }
          // Retry transient, rate limit, timeout, and network errors
          return true;
        },
      })
    );
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
    return this.circuitBreaker.execute(() =>
      retry(async () => {
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
      }, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
        jitter: 0.1,
        maxDelay: 30000,
        timeout: 10000,
        totalTimeout: config.retryTotalTimeout,
        isRetryable: (error: Error) => {
          const errorType = classifyError(error);
          // Don't retry permanent errors (4xx except 429)
          if (errorType === ErrorType.PERMANENT) {
            return false;
          }
          // Retry transient, rate limit, timeout, and network errors
          return true;
        },
      })
    );
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
    return this.circuitBreaker.execute(() =>
      retry(async () => {
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
      }, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
        jitter: 0.1,
        maxDelay: 30000,
        timeout: 10000,
        totalTimeout: config.retryTotalTimeout,
        isRetryable: (error: Error) => {
          const errorType = classifyError(error);
          // Don't retry permanent errors (4xx except 429)
          if (errorType === ErrorType.PERMANENT) {
            return false;
          }
          // Retry transient, rate limit, timeout, and network errors
          return true;
        },
      })
    );
  }

  /**
   * Get circuit breaker metrics for monitoring.
   * Use this to track Data API health and reliability.
   */
  getCircuitBreakerMetrics() {
    return this.circuitBreaker.getMetrics();
  }
}
