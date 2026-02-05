import { logger } from './logger';

export interface RetryOptions {
  attempts?: number;
  delay?: number;
  backoffMultiplier?: number;
  /** Jitter factor (0-1). 0 = no jitter, 1 = up to 100% jitter. Default: 0.1 (10%) */
  jitter?: number;
  /** Maximum delay between retries in milliseconds. Default: 30000 (30s) */
  maxDelay?: number;
  /** Timeout for each attempt in milliseconds. If not set, no timeout is applied. */
  timeout?: number;
  /** Overall timeout for all retry attempts combined in milliseconds. Default: 300000 (5 minutes). Addresses Audit Finding A-009 */
  totalTimeout?: number;
  /** Function to determine if an error is retryable. Default: all errors are retryable. */
  isRetryable?: (error: Error) => boolean;
}

export enum ErrorType {
  TRANSIENT = 'transient',
  PERMANENT = 'permanent',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  NETWORK = 'network',
}

/**
 * Classify error to determine retry strategy.
 * Returns error type for logging and conditional retry logic.
 */
export function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  
  // Rate limiting errors
  if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
    return ErrorType.RATE_LIMIT;
  }
  
  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out') || message.includes('etimedout')) {
    return ErrorType.TIMEOUT;
  }
  
  // Network errors
  if (
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('network')
  ) {
    return ErrorType.NETWORK;
  }
  
  // Permanent errors (4xx except 429)
  if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) {
    return ErrorType.PERMANENT;
  }
  
  // Default to transient for 5xx and unknown errors
  return ErrorType.TRANSIENT;
}

/**
 * Retry a function with exponential backoff, jitter, and timeout support.
 * 
 * Addresses Audit Finding A-009: Adds overall timeout cap to prevent unbounded retry duration.
 * 
 * @param fn - The function to retry
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retry attempts fail or TimeoutError if total timeout is exceeded
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    delay = 1000,
    backoffMultiplier = 2,
    jitter = 0.1,
    maxDelay = 30000,
    timeout,
    totalTimeout = 300000, // Default: 5 minutes (A-009)
    isRetryable = () => true,
  } = options;

  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Check if we've exceeded the total timeout before attempting
    const elapsed = Date.now() - startTime;
    if (elapsed >= totalTimeout) {
      const timeoutError = new Error(
        `Retry operation exceeded total timeout of ${totalTimeout}ms after ${elapsed}ms`
      );
      logger.error('Retry total timeout exceeded', {
        totalTimeout,
        elapsed,
        attempts: attempt - 1,
        lastError: lastError?.message,
      });
      throw timeoutError;
    }

    try {
      const promise = fn();
      
      // Apply per-attempt timeout if specified
      if (timeout) {
        return await withTimeout(promise, timeout);
      }
      
      return await promise;
    } catch (error) {
      lastError = error as Error;
      const errorType = classifyError(lastError);
      
      logger.warn('Retry attempt failed', {
        attempt,
        attempts,
        error: lastError.message,
        errorType,
        elapsed: Date.now() - startTime,
      });

      // Check if error is retryable
      if (!isRetryable(lastError)) {
        logger.info('Error is not retryable, stopping retry attempts', {
          error: lastError.message,
          errorType,
        });
        throw lastError;
      }

      if (attempt < attempts) {
        // Calculate delay with exponential backoff
        const baseDelay = delay * Math.pow(backoffMultiplier, attempt - 1);
        
        // Apply jitter: random value between -jitter and +jitter
        const jitterAmount = baseDelay * jitter * (Math.random() * 2 - 1);
        const delayWithJitter = Math.max(0, baseDelay + jitterAmount);
        
        // Cap at maxDelay
        const waitTime = Math.min(delayWithJitter, maxDelay);
        
        // Check if waiting would exceed total timeout
        const elapsedBeforeWait = Date.now() - startTime;
        if (elapsedBeforeWait + waitTime >= totalTimeout) {
          const timeoutError = new Error(
            `Retry operation would exceed total timeout of ${totalTimeout}ms. Stopping after ${attempt} attempts.`
          );
          logger.error('Total timeout would be exceeded by next retry delay', {
            totalTimeout,
            elapsed: elapsedBeforeWait,
            waitTime,
            attempts: attempt,
          });
          throw timeoutError;
        }
        
        logger.debug('Waiting before retry', { 
          waitTime: Math.round(waitTime),
          attempt,
          errorType,
          elapsed: elapsedBeforeWait,
        });
        await sleep(waitTime);
      }
    }
  }

  throw lastError || new Error(`Retry failed: Unknown error after ${attempts} attempts`);
}

/**
 * Wrap a promise with a timeout.
 * 
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @returns The result of the promise or throws TimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
