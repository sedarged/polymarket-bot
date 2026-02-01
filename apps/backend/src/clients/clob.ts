import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { retry, ErrorType, classifyError } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';
import { Orderbook } from '@polymarket/shared';

/**
 * CLOB (Central Limit Order Book) API Client
 * 
 * Official Documentation: https://docs.polymarket.com/developers/CLOB/introduction
 * Base URL: https://clob.polymarket.com
 * 
 * This client provides read-only access to the CLOB API for fetching orderbooks.
 * For write operations (order placement), see TradingClient which uses the official SDK.
 * 
 * Implementation Review: See REPORTS/RESEARCH_REVIEW.md Section 2.1
 * Rate Limits: 500-1,500 requests per 10 seconds for market data endpoints
 *              See docs/adr/0002-rate-limiting-strategy.md for enhancement plan
 * 
 * Reliability Features:
 * - Circuit breaker to prevent cascade failures
 * - Retry logic with exponential backoff and jitter
 * - Configurable timeouts
 * - Error classification for smart retry decisions
 * 
 * @see {@link https://docs.polymarket.com/developers/CLOB/introduction}
 * @see {@link ../../../../REPORTS/RESEARCH_REVIEW.md}
 */
export class ClobClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = axios.create({
      baseURL: config.clobApiUrl,
      timeout: 10000,
    });

    this.circuitBreaker = new CircuitBreaker({
      name: 'clob-api',
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      successThreshold: 2,
    });

    // Log circuit breaker state changes
    this.circuitBreaker.on('open', (metrics) => {
      logger.error('CLOB API circuit breaker opened', metrics);
    });

    this.circuitBreaker.on('half-open', (metrics) => {
      logger.warn('CLOB API circuit breaker half-open, testing recovery', metrics);
    });

    this.circuitBreaker.on('closed', (metrics) => {
      logger.info('CLOB API circuit breaker closed, service recovered', metrics);
    });
  }

  async getOrderbook(tokenId: string): Promise<Orderbook> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching orderbook', { tokenId });
        
        const response = await this.client.get<Orderbook>(`/book`, {
          params: {
            token_id: tokenId,
          },
        });

        logger.info('Retrieved orderbook', { tokenId });
        return response.data;
      }, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
        jitter: 0.1,
        maxDelay: 30000,
        timeout: 10000,
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
   */
  getCircuitBreakerMetrics() {
    return this.circuitBreaker.getMetrics();
  }

  /**
   * Manually reset the circuit breaker (e.g., for testing or recovery).
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.circuitBreaker.destroy();
  }
}
