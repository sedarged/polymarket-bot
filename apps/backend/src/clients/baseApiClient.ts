import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry, ErrorType, classifyError } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

/**
 * Base API Client
 * 
 * Provides common functionality for all Polymarket API clients:
 * - Circuit breaker pattern for fault tolerance
 * - Retry logic with exponential backoff
 * - Error classification and handling
 * - Proper resource cleanup
 * 
 * This eliminates code duplication across ClobClient, GammaClient, and DataApiClient.
 */
export abstract class BaseApiClient {
  protected client: AxiosInstance;
  protected circuitBreaker: CircuitBreaker;
  protected readonly retryConfig: {
    attempts: number;
    delay: number;
    jitter: number;
    maxDelay: number;
    timeout: number;
    totalTimeout: number;
    isRetryable: (error: Error) => boolean;
  };

  /**
   * Initialize the base API client with circuit breaker and retry configuration.
   * 
   * @param baseURL - The base URL for the API
   * @param circuitBreakerName - Name for the circuit breaker (for logging)
   * @param timeout - Request timeout in milliseconds (default: 10000)
   */
  constructor(
    baseURL: string,
    circuitBreakerName: string,
    timeout: number = 10000
  ) {
    this.client = axios.create({
      baseURL,
      timeout,
    });

    this.circuitBreaker = new CircuitBreaker({
      name: circuitBreakerName,
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      successThreshold: 2,
    });

    // Shared retry configuration for all API methods
    this.retryConfig = {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
      jitter: 0.1,
      maxDelay: 30000,
      timeout,
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
      logger.error(`${circuitBreakerName} circuit breaker opened`, metrics);
    });

    this.circuitBreaker.on('half-open', (metrics) => {
      logger.warn(`${circuitBreakerName} circuit breaker half-open, testing recovery`, metrics);
    });

    this.circuitBreaker.on('closed', (metrics) => {
      logger.info(`${circuitBreakerName} circuit breaker closed, service recovered`, metrics);
    });
  }

  /**
   * Execute a request with circuit breaker and retry logic.
   * 
   * @param fn - The async function to execute
   * @returns The result of the function
   */
  protected async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => retry(fn, this.retryConfig));
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
