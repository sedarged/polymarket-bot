# ADR-0002: Rate Limiting Strategy

## Status
Proposed

## Context
The Polymarket CLOB and Gamma APIs have documented rate limits that vary by endpoint. The current implementation uses basic retry logic with fixed delays, which does not account for:
- Different rate limits per endpoint (200-9000 requests per 10 seconds)
- HTTP 429 (Too Many Requests) responses
- Cloudflare-based throttling behavior (queuing vs rejection)
- Proactive rate limit management

Official rate limits (per 10 seconds):
- General CLOB: 9,000 requests
- GET Balance Allowance: 200 requests
- UPDATE Balance Allowance: 50 requests
- Market Data Endpoints: 500-1,500 requests
- Ledger Endpoints: 900 requests

Reference: https://docs.polymarket.com/quickstart/introduction/rate-limits

## Decision
Implement a comprehensive rate limiting strategy with the following components:

### 1. Rate Limiter Utility
Create a `RateLimiter` class that:
- Tracks request timestamps per endpoint type
- Enforces limits using sliding window algorithm
- Throttles requests proactively before hitting limits
- Supports different limits per endpoint category

### 2. Enhanced Retry Logic
Update retry logic to:
- Detect HTTP 429 responses specifically
- Apply exponential backoff for rate limit errors (not fixed delay)
- Use longer delays for 429 errors than transient failures
- Respect `Retry-After` header if provided by API

### 3. Request Queue
Implement optional request queueing to:
- Smooth out request bursts
- Prevent thundering herd on reconnection
- Prioritize critical operations (e.g., kill switch)

## Implementation Details

### Rate Limiter Class
```typescript
export class RateLimiter {
  private requestCounts = new Map<string, number[]>();
  private readonly limits: Record<string, number> = {
    general: 9000,        // CLOB general
    balance: 200,         // GET balance
    balanceUpdate: 50,    // UPDATE balance
    marketData: 1500,     // Market data endpoints
    ledger: 900,          // Ledger endpoints
  };

  async throttle(endpoint: string, category: string = 'general'): Promise<void> {
    const now = Date.now();
    const windowMs = 10000; // 10 seconds
    
    const key = category;
    const timestamps = this.requestCounts.get(key) || [];
    
    // Remove timestamps outside the window
    const validTimestamps = timestamps.filter(ts => now - ts < windowMs);
    
    const limit = this.limits[category] || this.limits.general;
    
    // If we're at the limit, wait for the oldest request to age out
    if (validTimestamps.length >= limit) {
      const oldestTimestamp = validTimestamps[0];
      const waitTime = windowMs - (now - oldestTimestamp) + 100; // +100ms buffer
      logger.debug('Rate limit reached, throttling', { category, waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.throttle(endpoint, category); // Recursive retry
    }
    
    validTimestamps.push(now);
    this.requestCounts.set(key, validTimestamps);
  }

  getRemainingRequests(category: string = 'general'): number {
    const now = Date.now();
    const windowMs = 10000;
    const timestamps = this.requestCounts.get(category) || [];
    const validTimestamps = timestamps.filter(ts => now - ts < windowMs);
    const limit = this.limits[category] || this.limits.general;
    return Math.max(0, limit - validTimestamps.length);
  }
}
```

### Enhanced Retry with Exponential Backoff
```typescript
export interface RetryOptions {
  attempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry,
  } = options;
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = i === attempts - 1;
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const retryAfter = error.response?.headers['retry-after'];
        
        if (status === 429) {
          // Rate limit error - use exponential backoff or Retry-After header
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : Math.min(baseDelay * Math.pow(2, i), maxDelay);
          
          logger.warn('Rate limited, backing off', {
            attempt: i + 1,
            delay,
            retryAfter,
          });
          
          if (!isLastAttempt) {
            onRetry?.(i + 1, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        } else if (status && status >= 500) {
          // Server error - use shorter backoff
          const delay = Math.min(baseDelay * (i + 1), maxDelay);
          logger.warn('Server error, retrying', { attempt: i + 1, delay, status });
          
          if (!isLastAttempt) {
            onRetry?.(i + 1, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
      }
      
      // For other errors or last attempt, throw
      if (isLastAttempt) {
        throw error;
      } else {
        // Standard retry with base delay
        onRetry?.(i + 1, error);
        await new Promise(resolve => setTimeout(resolve, baseDelay));
      }
    }
  }
  
  // TypeScript requires a return statement here, but we'll never reach it
  throw new Error('Retry logic exhausted');
}
```

### Integration Example
```typescript
export class ClobClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor() {
    this.client = axios.create({
      baseURL: config.clobApiUrl,
      timeout: 10000,
    });
    this.rateLimiter = new RateLimiter();
  }

  async getOrderbook(tokenId: string): Promise<Orderbook> {
    await this.rateLimiter.throttle('/book', 'marketData');
    
    return retryWithBackoff(async () => {
      logger.debug('Fetching orderbook', { tokenId });
      
      const response = await this.client.get<Orderbook>(`/book`, {
        params: { token_id: tokenId },
      });

      logger.info('Retrieved orderbook', { tokenId });
      return response.data;
    }, {
      attempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
    });
  }
}
```

## Consequences

### Positive
- Proactive rate limit management prevents throttling
- Better handling of HTTP 429 responses
- Exponential backoff reduces load during rate limit periods
- Endpoint-specific limits allow fine-grained control
- Observable via remaining request counts

### Negative
- Additional complexity in API client code
- Memory overhead for tracking request timestamps
- Potential delays in high-throughput scenarios
- Requires tuning for optimal performance

### Neutral
- Rate limiter state is in-memory (lost on restart)
- No coordination between multiple instances (single bot assumption)

## Alternatives Considered

### 1. Token Bucket Algorithm
- **Pros:** Industry standard, well-understood
- **Cons:** More complex to implement, requires careful tuning
- **Decision:** Sliding window is sufficient for current needs

### 2. Global Rate Limiter Service
- **Pros:** Coordinates across multiple bot instances
- **Cons:** Requires infrastructure (Redis, etc.), adds latency
- **Decision:** Not needed for single-instance bot

### 3. No Rate Limiting (Status Quo)
- **Pros:** Simple, no overhead
- **Cons:** Reactive only, wastes retries on rate limits, poor behavior during throttling
- **Decision:** Rejected - proactive management is essential

## References
- [Polymarket Rate Limits Documentation](https://docs.polymarket.com/quickstart/introduction/rate-limits)
- [REPORTS/RESEARCH_REVIEW.md](../REPORTS/RESEARCH_REVIEW.md) - Section 4.1
- [Exponential Backoff Best Practices](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

## Related ADRs
- ADR-0001: Initial Architecture (WebSocket-first approach reduces REST API load)
- ADR-0003: API Error Handling (related to detecting rate limit errors)

## Implementation Tasks
- [ ] Create `apps/backend/src/utils/rateLimiter.ts`
- [ ] Update `apps/backend/src/utils/retry.ts` with exponential backoff
- [ ] Update `apps/backend/src/clients/clob.ts` to use rate limiter
- [ ] Update `apps/backend/src/clients/gamma.ts` to use rate limiter
- [ ] Add rate limiter tests
- [ ] Add metrics/logging for rate limit hits
- [ ] Document rate limiter configuration
