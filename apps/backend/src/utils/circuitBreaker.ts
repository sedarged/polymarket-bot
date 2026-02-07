import { EventEmitter } from 'events';
import { logger } from './logger';
import { 
  circuitBreakerState, 
  circuitBreakerTrips, 
  circuitBreakerFailures, 
  circuitBreakerSuccesses,
} from './metrics';
import { getAlertingService } from './alerting';

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in milliseconds to wait before attempting to close the circuit. Default: 60000 (1 minute) */
  resetTimeout?: number;
  /** Number of successful requests in half-open state before closing. Default: 2 */
  successThreshold?: number;
  /** Optional name for logging purposes */
  name?: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  name: string;
}

/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by stopping requests to failing services.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 * 
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({ name: 'clob-api' });
 * const result = await breaker.execute(() => api.call());
 * ```
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime = 0;
  private resetTimer: NodeJS.Timeout | null = null;
  private totalRequests = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    super();
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000;
    this.successThreshold = options.successThreshold ?? 2;
    this.name = options.name ?? 'circuit-breaker';
  }

  /**
   * Execute a function with circuit breaker protection.
   * 
   * @param fn - The function to execute
   * @returns The result of the function
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        const error = new Error(
          `Circuit breaker is open for ${this.name}. Next attempt in ${
            Math.round((this.nextAttemptTime - Date.now()) / 1000)
          }s`
        );
        logger.warn('Circuit breaker blocked request', {
          name: this.name,
          state: this.state,
          nextAttemptIn: this.nextAttemptTime - Date.now(),
        });
        throw error;
      }
      
      // Transition to half-open to test the service
      this.transitionToHalfOpen();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
    
    // Record success metric
    circuitBreakerSuccesses.inc({ breaker_name: this.name });

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }

    logger.debug('Circuit breaker request succeeded', {
      name: this.name,
      state: this.state,
      consecutiveSuccesses: this.consecutiveSuccesses,
    });
  }

  private onFailure(): void {
    this.failureCount++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();
    
    // Record failure metric
    circuitBreakerFailures.inc({ breaker_name: this.name });

    logger.warn('Circuit breaker request failed', {
      name: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.failureThreshold,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // In half-open state, any failure reopens the circuit
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED) {
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.transitionToOpen();
      }
    }
  }

  private transitionToOpen(): void {
    if (this.state === CircuitState.OPEN) {
      return;
    }

    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.resetTimeout;
    
    // Update metrics
    circuitBreakerState.set({ breaker_name: this.name }, 1); // OPEN = 1
    circuitBreakerTrips.inc({ breaker_name: this.name });

    logger.error('Circuit breaker opened', {
      name: this.name,
      previousState,
      failureCount: this.failureCount,
      consecutiveFailures: this.consecutiveFailures,
      resetTimeoutMs: this.resetTimeout,
    });

    this.emit('open', this.getMetrics());
    
    // Send alert if alerting service is configured
    const alerting = getAlertingService();
    if (alerting) {
      alerting.alertCircuitBreakerTrip(this.name, this.consecutiveFailures).catch((error) => {
        logger.error('Failed to send circuit breaker alert', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    // Schedule transition to half-open
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.resetTimeout);
  }

  private transitionToHalfOpen(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      return;
    }

    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.consecutiveSuccesses = 0;
    
    // Update metrics
    circuitBreakerState.set({ breaker_name: this.name }, 2); // HALF_OPEN = 2

    logger.info('Circuit breaker half-open', {
      name: this.name,
      previousState,
      successThreshold: this.successThreshold,
    });

    this.emit('half-open', this.getMetrics());
  }

  private transitionToClosed(): void {
    if (this.state === CircuitState.CLOSED) {
      return;
    }

    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    
    // Update metrics
    circuitBreakerState.set({ breaker_name: this.name }, 0); // CLOSED = 0

    logger.info('Circuit breaker closed', {
      name: this.name,
      previousState,
    });

    this.emit('closed', this.getMetrics());

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Get current circuit breaker metrics.
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      name: this.name,
    };
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Manually reset the circuit breaker to closed state.
   */
  reset(): void {
    logger.info('Manually resetting circuit breaker', { name: this.name });
    this.transitionToClosed();
  }

  /**
   * Check if circuit is allowing requests.
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN && Date.now() < this.nextAttemptTime;
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    this.removeAllListeners();
  }
}
