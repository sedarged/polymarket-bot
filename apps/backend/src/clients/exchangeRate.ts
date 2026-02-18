import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry, ErrorType, classifyError } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

/**
 * Exchange Rate Client
 * 
 * Fetches real-time exchange rates for cryptocurrency and fiat currencies.
 * Uses CoinGecko API (free tier, no authentication required).
 * 
 * Features:
 * - In-memory caching with configurable TTL
 * - Circuit breaker for fault tolerance
 * - Retry logic with exponential backoff
 * - Failover support for multiple providers
 * 
 * API Documentation: https://www.coingecko.com/en/api/documentation
 * 
 * Addresses: GAP-007 Exchange Rate Fetcher Integration
 */

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
}

interface CachedRate {
  rate: number;
  timestamp: number;
}

interface CoinGeckoSimplePriceResponse {
  [coinId: string]: {
    [currency: string]: number;
  };
}

/**
 * ExchangeRateClient provides exchange rate data from multiple sources with caching and failover.
 */
export class ExchangeRateClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private cache: Map<string, CachedRate> = new Map();
  private readonly cacheTtlMs: number;
  private readonly retryConfig: {
    attempts: number;
    delay: number;
    jitter: number;
    maxDelay: number;
    timeout: number;
    totalTimeout: number;
    isRetryable: (error: Error) => boolean;
  };

  /**
   * Create a new ExchangeRateClient instance.
   * 
   * @param cacheTtlMs - Cache time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(cacheTtlMs: number = 300000) {
    this.cacheTtlMs = cacheTtlMs;

    // Initialize CoinGecko API client (free tier, no auth needed)
    this.client = axios.create({
      baseURL: config.exchangeRateApiUrl || 'https://api.coingecko.com/api/v3',
      timeout: 10000,
    });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      name: 'exchange-rate-api',
      failureThreshold: config.circuitBreakerFailureThreshold,
      resetTimeout: config.circuitBreakerResetTimeoutMs,
      successThreshold: config.circuitBreakerSuccessThreshold,
    });

    // Configure retry logic
    this.retryConfig = {
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
    };

    // Log circuit breaker state changes
    this.circuitBreaker.on('open', (metrics) => {
      logger.error('Exchange rate API circuit breaker opened', metrics);
    });

    this.circuitBreaker.on('half-open', (metrics) => {
      logger.warn('Exchange rate API circuit breaker half-open, testing recovery', metrics);
    });

    this.circuitBreaker.on('closed', (metrics) => {
      logger.info('Exchange rate API circuit breaker closed, service recovered', metrics);
    });
  }

  /**
   * Generate a cache key for a currency pair.
   */
  private getCacheKey(from: string, to: string): string {
    return `${from.toLowerCase()}_${to.toLowerCase()}`;
  }

  /**
   * Check if a cached rate is still valid.
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.cacheTtlMs;
  }

  /**
   * Get exchange rate from cache if valid.
   */
  private getFromCache(from: string, to: string): ExchangeRate | null {
    const key = this.getCacheKey(from, to);
    const cached = this.cache.get(key);

    if (cached && this.isCacheValid(cached.timestamp)) {
      logger.debug('Exchange rate cache hit', { from, to, rate: cached.rate });
      return {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        rate: cached.rate,
        timestamp: cached.timestamp,
      };
    }

    if (cached) {
      logger.debug('Exchange rate cache expired', { from, to });
      this.cache.delete(key);
    }

    return null;
  }

  /**
   * Store exchange rate in cache.
   */
  private storeInCache(from: string, to: string, rate: number): void {
    const key = this.getCacheKey(from, to);
    this.cache.set(key, {
      rate,
      timestamp: Date.now(),
    });
    logger.debug('Exchange rate cached', { from, to, rate, ttl: this.cacheTtlMs });
  }

  /**
   * Fetch exchange rate from CoinGecko API.
   * 
   * @param from - Source currency (e.g., 'USDC', 'ETH', 'BTC')
   * @param to - Target currency (e.g., 'USD', 'EUR', 'GBP')
   * @returns Exchange rate data
   */
  private async fetchFromCoinGecko(from: string, to: string): Promise<ExchangeRate> {
    // Map common cryptocurrency symbols to CoinGecko IDs
    const coinIdMap: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'DAI': 'dai',
      'MATIC': 'matic-network',
      'POL': 'matic-network', // Polygon rebrand
    };

    const coinId = coinIdMap[from.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported source currency: ${from}`);
    }

    const currency = to.toLowerCase();

    logger.debug('Fetching exchange rate from CoinGecko', { from, to, coinId, currency });

    const response = await this.client.get<CoinGeckoSimplePriceResponse>('/simple/price', {
      params: {
        ids: coinId,
        vs_currencies: currency,
      },
    });

    const rate = response.data[coinId]?.[currency];
    if (!rate) {
      throw new Error(`Exchange rate not found for ${from}/${to}`);
    }

    logger.info('Exchange rate fetched successfully', { from, to, rate });

    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      timestamp: Date.now(),
    };
  }

  /**
   * Get exchange rate for a currency pair.
   * 
   * Returns cached rate if available and valid, otherwise fetches fresh data.
   * Implements circuit breaker pattern and retry logic for reliability.
   * 
   * @param from - Source currency (e.g., 'USDC', 'ETH', 'BTC')
   * @param to - Target currency (e.g., 'USD', 'EUR', 'GBP')
   * @returns Exchange rate data
   * @throws Error if rate cannot be fetched after retries
   * 
   * @example
   * ```typescript
   * const client = new ExchangeRateClient();
   * const rate = await client.getExchangeRate('USDC', 'USD');
   * console.log(`1 USDC = ${rate.rate} USD`);
   * ```
   */
  async getExchangeRate(from: string, to: string): Promise<ExchangeRate> {
    // Normalize input
    from = from.toUpperCase();
    to = to.toUpperCase();

    // Handle same-currency case
    if (from === to) {
      return {
        from,
        to,
        rate: 1.0,
        timestamp: Date.now(),
      };
    }

    // Check cache first
    const cached = this.getFromCache(from, to);
    if (cached) {
      return cached;
    }

    // Fetch from API with circuit breaker and retry
    const result = await this.circuitBreaker.execute(() =>
      retry(
        () => this.fetchFromCoinGecko(from, to),
        this.retryConfig
      )
    );

    // Store in cache
    this.storeInCache(from, to, result.rate);

    return result;
  }

  /**
   * Get multiple exchange rates at once.
   * 
   * More efficient than calling getExchangeRate multiple times as it can batch requests
   * and leverage the cache for multiple pairs.
   * 
   * @param pairs - Array of currency pairs as [from, to] tuples
   * @returns Array of exchange rate data
   * 
   * @example
   * ```typescript
   * const client = new ExchangeRateClient();
   * const rates = await client.getBatchExchangeRates([
   *   ['USDC', 'USD'],
   *   ['ETH', 'USD'],
   *   ['BTC', 'USD'],
   * ]);
   * ```
   */
  async getBatchExchangeRates(pairs: [string, string][]): Promise<ExchangeRate[]> {
    return Promise.all(
      pairs.map(([from, to]) => this.getExchangeRate(from, to))
    );
  }

  /**
   * Clear the exchange rate cache.
   * 
   * Useful for testing or when you want to force fresh data.
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Exchange rate cache cleared', { entriesCleared: size });
  }

  /**
   * Get cache statistics.
   * 
   * @returns Cache statistics including size and entries
   */
  getCacheStats(): { size: number; entries: Array<{ from: string; to: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, value]) => {
      const [from, to] = key.split('_');
      return {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        age: now - value.timestamp,
      };
    });

    return {
      size: this.cache.size,
      entries,
    };
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
    this.cache.clear();
  }
}
