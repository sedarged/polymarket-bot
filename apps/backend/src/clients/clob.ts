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
   * Get fee rate for a token (Research §1.4). Fee-enabled markets (e.g. 15-min crypto) return feeRateBps.
   * Use when placing live orders to include correct feeRateBps in order payload. Most markets are 0% fee.
   *
   * @param tokenId - The token/asset ID
   * @returns feeRateBps (basis points) or 0 if not fee-enabled
   * @see Research §1.4, §12.1 item 4
   */
  async getFeeRate(tokenId: string): Promise<number> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching fee rate', { tokenId });
        const response = await this.client.get<{ feeRateBps?: number }>(
          '/fee-rate',
          { params: { token_id: tokenId } }
        );
        const bps = response.data?.feeRateBps ?? 0;
        logger.debug('Retrieved fee rate', { tokenId, feeRateBps: bps });
        return bps;
      }, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
        jitter: 0.1,
        maxDelay: 30000,
        timeout: 10000,
        totalTimeout: config.retryTotalTimeout,
        isRetryable: (error: Error) => {
          const errorType = classifyError(error);
          if (errorType === ErrorType.PERMANENT) return false;
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
   * Get historical price data for a token
   * 
   * Retrieves historical price points at specified intervals for analytics, backtesting,
   * and historical analysis. Useful for understanding market trends and price movements.
   * 
   * @param tokenId - The token/asset ID
   * @param params - Query parameters for filtering historical data
   * @param params.interval - Time interval for price points ('1h', '6h', '1d', '1w', 'max')
   * @param params.startTs - Start timestamp in seconds (optional)
   * @param params.endTs - End timestamp in seconds (optional)
   * @param params.fidelity - Number of data points to return (optional)
   * @returns Array of historical price points with timestamps
   * 
   * @see {@link https://docs.polymarket.com/developers/CLOB/clients/methods-public}
   * 
   * @example
   * ```typescript
   * // Get last 24 hours of hourly prices
   * const prices = await client.getPriceHistory('token123', {
   *   interval: '1h',
   *   startTs: Math.floor((Date.now() - 86400000) / 1000),
   *   endTs: Math.floor(Date.now() / 1000)
   * });
   * ```
   */
  async getPriceHistory(
    tokenId: string,
    params?: {
      interval?: '1h' | '6h' | '1d' | '1w' | 'max';
      startTs?: number;
      endTs?: number;
      fidelity?: number;
    }
  ): Promise<Array<{
    timestamp: number;
    price: string;
    volume?: string;
  }>> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching price history', { tokenId, params });
        
        const response = await this.client.get<Array<{
          t: number; // timestamp
          p: string; // price
          v?: string; // volume
        }>>('/prices/history', {
          params: {
            token_id: tokenId,
            ...params,
          },
        });

        // Transform response to more readable format
        const history = response.data.map(point => ({
          timestamp: point.t,
          price: point.p,
          volume: point.v,
        }));

        logger.info('Retrieved price history', { 
          tokenId,
          dataPoints: history.length,
          interval: params?.interval,
        });
        
        return history;
      }, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
        jitter: 0.1,
        maxDelay: 30000,
        timeout: 15000, // Slightly longer timeout for historical data
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
   * Get ban-status for a wallet address (compliance §10.1, §9.2).
   * Call on startup and periodically (e.g. every 24h). If cert_required is true,
   * alert admin (14-day deadline for proof of residence).
   *
   * @param polyAddress - Wallet address (POLY_ADDRESS header)
   * @returns { cert_required: boolean }
   * @see Research §10.1, §9.2
   */
  async getBanStatus(polyAddress: string): Promise<{ cert_required: boolean }> {
    return this.circuitBreaker.execute(() =>
      retry(async () => {
        logger.debug('Fetching ban-status', { polyAddress: `${polyAddress.slice(0, 10)}...` });
        const response = await this.client.get<{ cert_required?: boolean }>(
          '/ban-status',
          {
            headers: {
              POLY_ADDRESS: polyAddress,
            },
          }
        );
        const certRequired = response.data?.cert_required === true;
        logger.info('Ban-status retrieved', { cert_required: certRequired });
        return { cert_required: certRequired };
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
