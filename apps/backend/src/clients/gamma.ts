import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry, ErrorType, classifyError } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';
import { Event, Market } from '@polymarket/shared';

/**
 * Gamma API Client
 * 
 * Official Documentation: https://docs.polymarket.com/developers/gamma-markets-api/overview
 * Base URL: https://gamma-api.polymarket.com
 * 
 * The Gamma API provides market discovery and metadata retrieval for all Polymarket markets.
 * It indexes on-chain data and provides rich endpoints for exploring markets, events, and tags.
 * 
 * Implementation Review: See REPORTS/RESEARCH_REVIEW.md Section 2.2
 * Rate Limits: Part of general CLOB rate limit (9,000 requests per 10 seconds)
 *              See docs/adr/0002-rate-limiting-strategy.md for enhancement plan
 * 
 * Reliability Features:
 * - Circuit breaker to prevent cascade failures (Issue #116 Review)
 * - Retry logic with exponential backoff and jitter
 * - Configurable timeouts
 * - Error classification for smart retry decisions
 * 
 * @see {@link https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide}
 * @see {@link ../../../../REPORTS/RESEARCH_REVIEW.md}
 */
export class GammaClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = axios.create({
      baseURL: config.gammaApiUrl,
      timeout: 10000,
    });

    this.circuitBreaker = new CircuitBreaker({
      name: 'gamma-api',
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      successThreshold: 2,
    });

    // Log circuit breaker state changes
    this.circuitBreaker.on('open', (metrics) => {
      logger.error('Gamma API circuit breaker opened', metrics);
    });

    this.circuitBreaker.on('half-open', (metrics) => {
      logger.warn('Gamma API circuit breaker half-open, testing recovery', metrics);
    });

    this.circuitBreaker.on('closed', (metrics) => {
      logger.info('Gamma API circuit breaker closed, service recovered', metrics);
    });
  }

  async getActiveMarkets(limit?: number): Promise<Market[]> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching active markets from Gamma API');
        
        const response = await this.client.get<Market[]>('/markets', {
          params: {
            active: true,
            closed: false,
            ...(limit && { limit }),
          },
        });

        logger.info('Retrieved active markets', { count: response.data.length });
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

  async getEvents(limit?: number): Promise<Event[]> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching events from Gamma API');
        
        const response = await this.client.get<Event[]>('/events', {
          params: {
            active: true,
            closed: false,
            ...(limit && { limit }),
          },
        });

        logger.info('Retrieved events', { count: response.data.length });
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
