# ADR-0003: API Error Handling Strategy

## Status
Proposed

## Context
The Polymarket CLOB and Gamma APIs return structured error responses, but the current implementation treats all errors generically. This makes debugging difficult and prevents appropriate error-specific handling.

### Official Error Response Format
```json
{
  "success": false,
  "errorMsg": "Specific error message"
}
```

### Common HTTP Status Codes
- **401 Unauthorized:** Invalid API credentials or signature
- **400 Bad Request:** Validation errors (e.g., price out of bounds)
- **429 Too Many Requests:** Rate limit exceeded
- **500+ Server Error:** Polymarket service issues

### Current Implementation
```typescript
catch (error) {
  logger.error('Failed to create order', {
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
```

**Problems:**
- No differentiation between error types
- No structured error information extraction
- Generic error messages make debugging difficult
- Cannot implement error-specific recovery strategies

Reference: https://docs.polymarket.com/developers/CLOB/orders/create-order

## Decision
Implement a structured error handling system with:

1. **Custom Error Classes** for different error types
2. **Error Response Parsing** to extract API error details
3. **Error Classification** to identify error categories
4. **Error-Specific Handling** strategies

## Implementation Details

### 1. Custom Error Classes

```typescript
// apps/backend/src/utils/errors.ts

/**
 * Base class for all Polymarket API errors
 */
export class PolymarketApiError extends Error {
  public readonly name = 'PolymarketApiError';
  
  constructor(
    public readonly statusCode: number,
    public readonly success: boolean,
    public readonly errorMsg: string,
    public readonly endpoint?: string,
    public readonly originalError?: any
  ) {
    super(`Polymarket API Error (${statusCode}): ${errorMsg}`);
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PolymarketApiError);
    }
  }

  /**
   * Check if this is an authentication error (401)
   */
  isAuthError(): boolean {
    return this.statusCode === 401;
  }

  /**
   * Check if this is a validation error (400)
   */
  isValidationError(): boolean {
    return this.statusCode === 400;
  }

  /**
   * Check if this is a rate limit error (429)
   */
  isRateLimitError(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if this is a server error (5xx)
   */
  isServerError(): boolean {
    return this.statusCode >= 500 && this.statusCode < 600;
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return this.isRateLimitError() || this.isServerError();
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    if (this.isAuthError()) {
      return 'Authentication failed. Please check your API credentials.';
    }
    if (this.isValidationError()) {
      return `Invalid request: ${this.errorMsg}`;
    }
    if (this.isRateLimitError()) {
      return 'Rate limit exceeded. Please try again later.';
    }
    if (this.isServerError()) {
      return 'Polymarket service temporarily unavailable. Please try again.';
    }
    return this.errorMsg;
  }

  /**
   * Convert to JSON for logging or serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      statusCode: this.statusCode,
      success: this.success,
      errorMsg: this.errorMsg,
      endpoint: this.endpoint,
      message: this.message,
    };
  }
}

/**
 * Specific error for authentication failures
 */
export class AuthenticationError extends PolymarketApiError {
  public readonly name = 'AuthenticationError';
  
  constructor(errorMsg: string, endpoint?: string) {
    super(401, false, errorMsg, endpoint);
  }
}

/**
 * Specific error for validation failures
 */
export class ValidationError extends PolymarketApiError {
  public readonly name = 'ValidationError';
  
  constructor(errorMsg: string, endpoint?: string) {
    super(400, false, errorMsg, endpoint);
  }
}

/**
 * Specific error for rate limit exceeded
 */
export class RateLimitError extends PolymarketApiError {
  public readonly name = 'RateLimitError';
  
  constructor(
    errorMsg: string,
    endpoint?: string,
    public readonly retryAfter?: number
  ) {
    super(429, false, errorMsg, endpoint);
  }
}
```

### 2. Error Parsing Utility

```typescript
/**
 * Parse axios error into structured PolymarketApiError
 */
export function parseApiError(error: any, endpoint?: string): PolymarketApiError {
  // Handle axios errors with response
  if (axios.isAxiosError(error) && error.response) {
    const { status, data, headers } = error.response;
    
    // Extract error message from various response formats
    const errorMsg =
      data?.errorMsg ||
      data?.error ||
      data?.message ||
      error.message ||
      'Unknown error';
    
    // Handle specific error types
    if (status === 401) {
      return new AuthenticationError(errorMsg, endpoint);
    }
    
    if (status === 400) {
      return new ValidationError(errorMsg, endpoint);
    }
    
    if (status === 429) {
      const retryAfter = headers['retry-after']
        ? parseInt(headers['retry-after'])
        : undefined;
      return new RateLimitError(errorMsg, endpoint, retryAfter);
    }
    
    // Generic API error for other status codes
    return new PolymarketApiError(
      status,
      data?.success ?? false,
      errorMsg,
      endpoint,
      error
    );
  }
  
  // Handle axios errors without response (network errors, timeouts, etc.)
  if (axios.isAxiosError(error)) {
    const errorMsg = error.code === 'ECONNABORTED'
      ? 'Request timeout'
      : error.message || 'Network error';
    
    return new PolymarketApiError(0, false, errorMsg, endpoint, error);
  }
  
  // Handle non-axios errors
  const errorMsg = error instanceof Error ? error.message : String(error);
  return new PolymarketApiError(0, false, errorMsg, endpoint, error);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof PolymarketApiError) {
    return error.isRetryable();
  }
  
  // Network errors and timeouts are retryable
  if (axios.isAxiosError(error)) {
    return (
      error.code === 'ECONNABORTED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      !error.response // No response = network issue
    );
  }
  
  return false;
}
```

### 3. Integration with Clients

```typescript
// apps/backend/src/clients/clob.ts

export class ClobClient {
  async getOrderbook(tokenId: string): Promise<Orderbook> {
    return retry(async () => {
      try {
        logger.debug('Fetching orderbook', { tokenId });
        
        const response = await this.client.get<Orderbook>(`/book`, {
          params: { token_id: tokenId },
        });

        logger.info('Retrieved orderbook', { tokenId });
        return response.data;
      } catch (error) {
        const apiError = parseApiError(error, '/book');
        
        logger.error('Failed to fetch orderbook', {
          tokenId,
          error: apiError.toJSON(),
        });
        
        throw apiError;
      }
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
      shouldRetry: (error) => isRetryableError(error),
    });
  }
}
```

```typescript
// apps/backend/src/clients/tradingClient.ts

export class TradingClient {
  async createOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: string,
    size: string
  ): Promise<Order> {
    assertLiveTradingEnabled();

    if (!this.client) {
      throw new Error('Trading client not initialized');
    }

    const clientOrderId = `order-${Date.now()}-${process.pid}-${this.orderIdCounter++}`;

    try {
      logger.info('Creating order', { tokenId, side, price, size, clientOrderId });

      const response = await this.client.createOrder({
        tokenID: tokenId,
        side: side === 'BUY' ? 'BUY' : 'SELL',
        price: Number(price),
        size: Number(size),
        clientOrderId,
      });

      const order: Order = {
        orderId: response.orderID || clientOrderId,
        clientOrderId,
        tokenId,
        side,
        price,
        size,
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
      };

      this.state.orders.push(order);
      logger.info('Order created', { orderId: order.orderId, clientOrderId });

      return order;
    } catch (error) {
      const apiError = parseApiError(error, 'POST /order');
      
      // Log with structured error information
      logger.error('Failed to create order', {
        tokenId,
        side,
        price,
        size,
        error: apiError.toJSON(),
      });
      
      // Emit event for monitoring/alerting
      if (apiError.isAuthError()) {
        this.emit('auth_error', apiError);
      } else if (apiError.isRateLimitError()) {
        this.emit('rate_limit', apiError);
      }
      
      throw apiError;
    }
  }
}
```

### 4. Error Handling in Server/Routes

```typescript
// apps/backend/src/server/routes.ts

app.post('/api/orders', async (req, res) => {
  try {
    const order = await tradingClient.createOrder(
      req.body.tokenId,
      req.body.side,
      req.body.price,
      req.body.size
    );
    
    res.json({ success: true, order });
  } catch (error) {
    if (error instanceof PolymarketApiError) {
      // Return structured error response
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          message: error.getUserMessage(),
          details: error.errorMsg,
          retryable: error.isRetryable(),
        },
      });
    } else {
      // Handle unexpected errors
      logger.error('Unexpected error in order creation', { error });
      res.status(500).json({
        success: false,
        error: {
          message: 'An unexpected error occurred',
          retryable: false,
        },
      });
    }
  }
});
```

## Consequences

### Positive
- **Better Debugging:** Structured error information makes issues easier to diagnose
- **Error-Specific Handling:** Can implement different strategies per error type
- **User-Friendly Messages:** Convert technical errors to user-friendly messages
- **Monitoring:** Can track error types and rates for alerting
- **Type Safety:** TypeScript benefits from specific error classes

### Negative
- **Increased Complexity:** More code to maintain
- **Learning Curve:** Developers must understand error hierarchy
- **Breaking Change:** Existing error handling code may need updates

### Neutral
- **Error Serialization:** Structured errors can be logged as JSON
- **Testing:** Requires additional test cases for error scenarios

## Alternatives Considered

### 1. Simple Error Wrapper
- **Pros:** Simpler to implement
- **Cons:** Less type safety, harder to handle specific cases
- **Decision:** Rejected - structured approach provides more value

### 2. Error Codes Instead of Classes
- **Pros:** More flexible, easier to extend
- **Cons:** Less type safety, no inheritance benefits
- **Decision:** Rejected - classes provide better TypeScript integration

### 3. Status Quo (Generic Errors)
- **Pros:** No changes needed
- **Cons:** Poor debugging experience, no error-specific handling
- **Decision:** Rejected - improvement is necessary

## References
- [Polymarket CLOB Order Documentation](https://docs.polymarket.com/developers/CLOB/orders/create-order)
- [REPORTS/RESEARCH_REVIEW.md](../REPORTS/RESEARCH_REVIEW.md) - Section 4.2
- [Axios Error Handling](https://axios-http.com/docs/handling_errors)

## Related ADRs
- ADR-0001: Initial Architecture
- ADR-0002: Rate Limiting Strategy (related to handling 429 errors)

## Implementation Tasks
- [ ] Create `apps/backend/src/utils/errors.ts` with error classes
- [ ] Update `apps/backend/src/clients/clob.ts` to use structured errors
- [ ] Update `apps/backend/src/clients/gamma.ts` to use structured errors
- [ ] Update `apps/backend/src/clients/tradingClient.ts` to use structured errors
- [ ] Update retry logic to check `isRetryableError()`
- [ ] Add error handling tests
- [ ] Update server routes to return user-friendly error responses
- [ ] Add error monitoring/alerting hooks
- [ ] Document error handling patterns in developer guide
