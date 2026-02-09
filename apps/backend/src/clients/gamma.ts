import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { retry, ErrorType, classifyError } from "../utils/retry";
import { CircuitBreaker } from "../utils/circuitBreaker";
import { logger } from "../utils/logger";
import { Event, Market, Account, MarketHistory, MarketReplay, Series, Tag, Replay, History } from "@polymarket/shared";

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
      name: "gamma-api",
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      successThreshold: 2,
    });

    // Log circuit breaker state changes
    this.circuitBreaker.on("open", (metrics) => {
      logger.error("Gamma API circuit breaker opened", metrics);
    });

    this.circuitBreaker.on("half-open", (metrics) => {
      logger.warn(
        "Gamma API circuit breaker half-open, testing recovery",
        metrics,
      );
    });

    this.circuitBreaker.on("closed", (metrics) => {
      logger.info(
        "Gamma API circuit breaker closed, service recovered",
        metrics,
      );
    });
  }

  async getActiveMarkets(limit?: number): Promise<Market[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching active markets from Gamma API");

          const response = await this.client.get<Market[]>("/markets", {
            params: {
              active: true,
              closed: false,
              ...(limit && { limit }),
            },
          });

          logger.info("Retrieved active markets", {
            count: response.data.length,
          });
          return response.data;
        },
        {
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
        },
      ),
    );
  }

  async getEvents(limit?: number): Promise<Event[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching events from Gamma API");

          const params: Record<string, unknown> = {
            active: true,
            closed: false,
          };
          if (typeof limit === "number") {
            params.limit = limit;
          }
          const response = await this.client.get<Event[]>("/events", {
            params,
          });

          logger.info("Retrieved events", { count: response.data.length });
          return response.data;
        },
        {
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
        },
      ),
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

  // --- New endpoints implementation ---
  // Account management
  async getAccount(address: string): Promise<Account> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching account from Gamma API", { address });
          const response = await this.client.get<Account>(
            `/account/${address}`,
          );
          logger.info("Retrieved account", { address });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }
  async getAccounts(params?: Record<string, unknown>): Promise<Account[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching accounts from Gamma API", { params });
          const response = await this.client.get<Account[]>("/accounts", {
            params,
          });
          logger.info("Retrieved accounts", { count: response.data.length });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }

  // Market lifecycle
  async getMarket(id: string): Promise<Market> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching market from Gamma API", { id });
          const response = await this.client.get<Market>(`/market/${id}`);
          logger.info("Retrieved market", { id });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }
  async getMarketHistory(
    id: string,
    params?: Record<string, unknown>,
  ): Promise<MarketHistory[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching market history from Gamma API", {
            id,
            params,
          });
          const response = await this.client.get<MarketHistory[]>(
            `/market/${id}/history`,
            { params },
          );
          logger.info("Retrieved market history", {
            id,
            count: response.data.length,
          });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }
  async getMarketReplay(
    id: string,
    params?: Record<string, unknown>,
  ): Promise<MarketReplay[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching market replay from Gamma API", { id, params });
          const response = await this.client.get<MarketReplay[]>(
            `/market/${id}/replay`,
            { params },
          );
          logger.info("Retrieved market replay", {
            id,
            count: response.data.length,
          });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }

  // Series
  async getSeries(params?: Record<string, unknown>): Promise<Series[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching series from Gamma API", { params });
          const response = await this.client.get<Series[]>("/series", {
            params,
          });
          logger.info("Retrieved series", { count: response.data.length });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }
  async getSeriesById(id: string): Promise<Series> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching series by id from Gamma API", { id });
          const response = await this.client.get<Series>(`/series/${id}`);
          logger.info("Retrieved series", { id });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }

  // Tags
  async getTags(params?: Record<string, unknown>): Promise<Tag[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching tags from Gamma API", { params });
          const response = await this.client.get<Tag[]>("/tags", { params });
          logger.info("Retrieved tags", { count: response.data.length });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }
  async getTagById(id: string): Promise<Tag> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching tag by id from Gamma API", { id });
          const response = await this.client.get<Tag>(`/tag/${id}`);
          logger.info("Retrieved tag", { id });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }

  // Event lookup
  async getEventById(id: string): Promise<Event> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching event by id from Gamma API", { id });
          const response = await this.client.get<Event>(`/event/${id}`);
          logger.info("Retrieved event", { id });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }

  // Replay/History
  async getReplay(params?: Record<string, unknown>): Promise<Replay[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching replay from Gamma API", { params });
          const response = await this.client.get<Replay[]>("/replay", {
            params,
          });
          logger.info("Retrieved replay", { count: response.data.length });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }
  async getHistory(params?: Record<string, unknown>): Promise<History[]> {
    return this.circuitBreaker.execute(() =>
      retry(
        async () => {
          logger.debug("Fetching history from Gamma API", { params });
          const response = await this.client.get<History[]>("/history", {
            params,
          });
          logger.info("Retrieved history", { count: response.data.length });
          return response.data;
        },
        {
          attempts: config.retryAttempts,
          delay: config.retryDelay,
          jitter: 0.1,
          maxDelay: 30000,
          timeout: 10000,
          totalTimeout: config.retryTotalTimeout,
          isRetryable: (error: Error) =>
            classifyError(error) !== ErrorType.PERMANENT,
        },
      ),
    );
  }
}
