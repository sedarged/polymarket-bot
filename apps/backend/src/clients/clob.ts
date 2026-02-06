import axios, { AxiosInstance } from 'axios';
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
   * Get market metadata including tick size and minimum order size
   * 
   * This method fetches the orderbook summary which contains both tick size
   * and minimum order size information required for order validation (Issue #75).
   * 
   * @param tokenId - The token/asset ID
   * @returns Market metadata with tick size and min order size
   * 
   * @see {@link https://docs.polymarket.com/developers/CLOB/clients/methods-public}
   */
  async getMarketMetadata(tokenId: string): Promise<{ tickSize: string; minOrderSize: string }> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching market metadata', { tokenId });
        
        const response = await this.client.get<{
          tick_size: string;
          min_order_size: string;
        }>(`/tick-size`, {
          params: {
            token_id: tokenId,
          },
        });

        logger.info('Retrieved market metadata', { 
          tokenId, 
          tickSize: response.data.tick_size,
          minOrderSize: response.data.min_order_size 
        });
        
        return {
          tickSize: response.data.tick_size,
          minOrderSize: response.data.min_order_size,
        };
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
   * Get current best executable price for a token
   * 
   * More efficient than fetching the full orderbook when you only need the current price.
   * Returns the best price for immediate execution on the specified side.
   * 
   * @param tokenId - The token/asset ID
   * @param side - The side of the market (BUY returns best ask, SELL returns best bid)
   * @returns The current market price as a string for precision
   * 
   * @see {@link https://docs.polymarket.com/api-reference/pricing/get-market-price}
   */
  async getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<string> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching price', { tokenId, side });
        
        const response = await this.client.get<{ price: string }>('/price', {
          params: {
            token_id: tokenId,
            side,
          },
        });

        logger.info('Retrieved price', { 
          tokenId, 
          side,
          price: response.data.price 
        });
        
        return response.data.price;
      }, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
        jitter: 0.1,
        maxDelay: 30000,
        timeout: 10000,
        totalTimeout: config.retryTotalTimeout,
        isRetryable: (error: Error) => {
          const errorType = classifyError(error);
          if (errorType === ErrorType.PERMANENT) {
            return false;
          }
          return true;
        },
      })
    );
  }

  /**
   * Get the most recent trade for a token
   * 
   * Returns the price, size, and timestamp of the last trade executed on this market.
   * Useful for market tracking, analytics, and determining recent market activity.
   * 
   * @param tokenId - The token/asset ID
   * @returns Last trade information including price, size, and timestamp
   * 
   * @see {@link https://docs.polymarket.com/developers/CLOB/clients/methods-public}
   */
  async getLastTrade(tokenId: string): Promise<{
    token_id: string;
    price: string;
    size: string;
    timestamp: string;
  }> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching last trade', { tokenId });
        
        const response = await this.client.get<{
          token_id: string;
          price: string;
          size: string;
          timestamp: string;
        }>('/lasttrade', {
          params: {
            token_id: tokenId,
          },
        });

        logger.info('Retrieved last trade', { 
          tokenId,
          price: response.data.price,
          size: response.data.size,
          timestamp: response.data.timestamp
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
          if (errorType === ErrorType.PERMANENT) {
            return false;
          }
          return true;
        },
      })
    );
  }

  /**
   * Get the current bid-ask spread for a token
   * 
   * Returns the best bid price, best ask price, and the spread (difference) between them.
   * The spread indicates market liquidity - smaller spreads generally mean more liquid markets.
   * 
   * @param tokenId - The token/asset ID
   * @returns Spread information including bid, ask, and calculated spread
   * 
   * @see {@link https://docs.polymarket.com/developers/CLOB/clients/methods-public}
   */
  async getSpread(tokenId: string): Promise<{
    token_id: string;
    bid: string;
    ask: string;
    spread: string;
  }> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching spread', { tokenId });
        
        const response = await this.client.get<{
          token_id: string;
          bid: string;
          ask: string;
          spread: string;
        }>('/spread', {
          params: {
            token_id: tokenId,
          },
        });

        logger.info('Retrieved spread', { 
          tokenId,
          bid: response.data.bid,
          ask: response.data.ask,
          spread: response.data.spread
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
          if (errorType === ErrorType.PERMANENT) {
            return false;
          }
          return true;
        },
      })
    );
  }

  /**
   * Get the midpoint price for a token
   * 
   * Returns the midpoint between the best bid and best ask prices.
   * This is often used as a "fair value" estimate for the market.
   * May be undefined if either side of the orderbook is empty.
   * 
   * @param tokenId - The token/asset ID
   * @returns Midpoint price between bid and ask
   * 
   * @see {@link https://docs.polymarket.com/developers/CLOB/clients/methods-public}
   */
  async getMidpoint(tokenId: string): Promise<{
    token_id: string;
    midpoint: string;
  }> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching midpoint', { tokenId });
        
        const response = await this.client.get<{
          token_id: string;
          midpoint: string;
        }>('/midpoint', {
          params: {
            token_id: tokenId,
          },
        });

        logger.info('Retrieved midpoint', { 
          tokenId,
          midpoint: response.data.midpoint
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
          if (errorType === ErrorType.PERMANENT) {
            return false;
          }
          return true;
        },
      })
    );
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.circuitBreaker.destroy();
  }
}
