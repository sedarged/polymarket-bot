# Error Taxonomy and Handling Strategies

This document defines the error classification system used throughout the Polymarket bot and provides handling strategies for each category.

## Error Categories

### 1. Transient Errors (ErrorType.TRANSIENT)
**Definition**: Temporary failures that are likely to resolve on their own or with retry.

**Examples**:
- 500 Internal Server Error
- 502 Bad Gateway
- 503 Service Unavailable
- Temporary database connection failures
- Intermittent network hiccups

**Handling Strategy**:
- ✅ **Retry**: Yes, with exponential backoff
- **Default attempts**: 3
- **Backoff**: 1s, 2s, 4s (exponential with 2x multiplier)
- **Jitter**: 10% to prevent thundering herd
- **Max delay**: 30s
- **Circuit breaker**: Count towards failure threshold

**Example Code**:
```typescript
await retry(apiCall, {
  attempts: 3,
  delay: 1000,
  backoffMultiplier: 2,
  jitter: 0.1,
  maxDelay: 30000,
});
```

---

### 2. Permanent Errors (ErrorType.PERMANENT)
**Definition**: Errors indicating a fundamental problem that won't resolve with retry.

**Examples**:
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- Invalid API key
- Malformed request payload

**Handling Strategy**:
- ❌ **Retry**: No, fail fast
- **Action**: Log error, alert operator
- **Circuit breaker**: Do NOT count towards threshold
- **Resolution**: Fix configuration, credentials, or request format

**Example Code**:
```typescript
await retry(apiCall, {
  attempts: 3,
  isRetryable: (error: Error) => {
    return classifyError(error) !== ErrorType.PERMANENT;
  },
});
```

---

### 3. Rate Limit Errors (ErrorType.RATE_LIMIT)
**Definition**: API rate limit exceeded. Request was valid but quota reached.

**Examples**:
- 429 Too Many Requests
- "Rate limit exceeded" messages
- X-RateLimit-Remaining: 0

**Handling Strategy**:
- ✅ **Retry**: Yes, with longer delays
- **Delay**: Use Retry-After header if available, or 60s default
- **Backoff**: More aggressive (start at 60s, 2x multiplier)
- **Max attempts**: 2-3
- **Circuit breaker**: Count towards threshold (aggressive rate limiting may indicate service degradation)
- **Prevention**: Implement request throttling, respect rate limits

**Example Code**:
```typescript
await retry(apiCall, {
  attempts: 2,
  delay: 60000, // 60s for rate limits
  backoffMultiplier: 2,
  isRetryable: (error: Error) => {
    const errorType = classifyError(error);
    return errorType === ErrorType.RATE_LIMIT || errorType === ErrorType.TRANSIENT;
  },
});
```

---

### 4. Timeout Errors (ErrorType.TIMEOUT)
**Definition**: Operation exceeded allocated time limit.

**Examples**:
- "Request timed out"
- ETIMEDOUT
- Connection timeout
- Read timeout

**Handling Strategy**:
- ✅ **Retry**: Yes, but consider increasing timeout
- **Default attempts**: 2-3
- **Timeout progression**: Start with base timeout (10s), increase by 50% per retry
- **Circuit breaker**: Count towards threshold
- **Investigation**: Check network latency, service load

**Example Code**:
```typescript
let timeout = 10000;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    return await retry(apiCall, {
      attempts: 1,
      timeout: timeout,
    });
  } catch (error) {
    if (classifyError(error) === ErrorType.TIMEOUT && attempt < 3) {
      timeout = Math.floor(timeout * 1.5); // Increase timeout
      continue;
    }
    throw error;
  }
}
```

---

### 5. Network Errors (ErrorType.NETWORK)
**Definition**: Low-level network connectivity issues.

**Examples**:
- ECONNREFUSED (connection refused)
- ECONNRESET (connection reset)
- ENOTFOUND (DNS resolution failed)
- EHOSTUNREACH (host unreachable)
- "Network error occurred"

**Handling Strategy**:
- ✅ **Retry**: Yes, with exponential backoff
- **Default attempts**: 3
- **Delay**: 2s, 4s, 8s
- **Circuit breaker**: Count towards threshold (multiple network errors may indicate infrastructure issues)
- **Investigation**: Check network connectivity, DNS, firewall rules

**Example Code**:
```typescript
await retry(apiCall, {
  attempts: 3,
  delay: 2000,
  backoffMultiplier: 2,
  jitter: 0.1,
  isRetryable: (error: Error) => {
    const errorType = classifyError(error);
    return errorType === ErrorType.NETWORK || errorType === ErrorType.TRANSIENT;
  },
});
```

---

## Error Classification Function

The `classifyError()` function automatically categorizes errors:

```typescript
import { classifyError, ErrorType } from './utils/retry';

try {
  await apiCall();
} catch (error) {
  const errorType = classifyError(error);
  
  switch (errorType) {
    case ErrorType.PERMANENT:
      logger.error('Permanent error, manual fix required', { error });
      break;
    case ErrorType.RATE_LIMIT:
      logger.warn('Rate limit hit, backing off', { error });
      break;
    case ErrorType.TIMEOUT:
      logger.warn('Timeout, may need to increase limit', { error });
      break;
    case ErrorType.NETWORK:
      logger.warn('Network error, check connectivity', { error });
      break;
    default:
      logger.warn('Transient error, will retry', { error });
  }
}
```

---

## Circuit Breaker Integration

Circuit breakers work in conjunction with error classification:

### When to Trip the Circuit

**Count towards failure threshold**:
- ✅ Transient errors (500, 502, 503)
- ✅ Rate limit errors (429) - indicates service degradation
- ✅ Timeout errors - may indicate service overload
- ✅ Network errors - infrastructure issues

**Do NOT count towards threshold**:
- ❌ Permanent errors (400, 401, 403, 404) - configuration issues, not service failures

### Circuit Breaker States

1. **CLOSED** (normal operation):
   - Requests pass through
   - Track failure rate
   - Trip to OPEN after N consecutive failures

2. **OPEN** (service failing):
   - Reject requests immediately
   - Prevent cascade failures
   - After timeout period, transition to HALF_OPEN

3. **HALF_OPEN** (testing recovery):
   - Allow limited test requests
   - If successful, transition to CLOSED
   - If failed, return to OPEN

---

## Graceful Degradation Strategies

### Non-Critical Operations
For non-essential features, fail gracefully rather than crashing:

```typescript
try {
  const analytics = await fetchAnalytics();
  displayAnalytics(analytics);
} catch (error) {
  logger.warn('Analytics unavailable, continuing without', { error });
  displayPlaceholder();
}
```

### Critical Operations
For essential operations, use circuit breakers and escalate:

```typescript
try {
  const orderResult = await circuitBreaker.execute(() => 
    placeOrder(params)
  );
  return orderResult;
} catch (error) {
  logger.error('Order placement failed', { error, params });
  alertOperator('Critical: Order placement failing');
  throw error;
}
```

---

## Alert Thresholds

### Sev-1 (Page immediately)
- Circuit breaker opens for critical services (order placement, market data)
- 3+ consecutive permanent errors
- Kill switch activated
- Trading client reconciliation fails

### Sev-2 (Alert with 15min SLA)
- Circuit breaker opens for non-critical services
- Error rate > 10% over 5 minutes
- Timeout rate > 5% over 5 minutes
- WebSocket disconnects > 5 in 1 hour

### Sev-3 (Log and monitor)
- Transient errors with successful retry
- Single timeout or network error
- Rate limit warnings (if not persistent)

---

## Monitoring and Metrics

### Key Metrics by Error Type

```typescript
// Prometheus-style metrics
polymarket_errors_total{type="transient", service="clob"} 45
polymarket_errors_total{type="permanent", service="clob"} 2
polymarket_errors_total{type="rate_limit", service="clob"} 3
polymarket_errors_total{type="timeout", service="clob"} 8
polymarket_errors_total{type="network", service="clob"} 12

polymarket_circuit_breaker_state{service="clob"} 0  // 0=closed, 1=open, 2=half-open
polymarket_circuit_breaker_failures_total{service="clob"} 45
```

### Dashboard Queries
```
// Error rate by type
rate(polymarket_errors_total[5m]) by (type)

// Circuit breaker state
polymarket_circuit_breaker_state == 1  // Alerting when open

// Retry success rate
1 - (polymarket_errors_total{type!="permanent"} / polymarket_requests_total)
```

---

## Best Practices

### 1. Always classify errors before handling
```typescript
const errorType = classifyError(error);
if (errorType === ErrorType.PERMANENT) {
  // Don't retry, fix the request
} else {
  // Safe to retry
}
```

### 2. Use appropriate retry strategies
- Transient: Standard exponential backoff
- Rate limit: Longer delays, respect Retry-After
- Timeout: Progressive timeout increase
- Network: Moderate backoff with jitter

### 3. Log with context
```typescript
logger.error('API call failed', {
  error: error.message,
  errorType: classifyError(error),
  attempt,
  service: 'clob',
  operation: 'getOrderbook',
  tokenId,
});
```

### 4. Combine retry with circuit breaker
```typescript
await circuitBreaker.execute(() =>
  retry(apiCall, retryOptions)
);
```

### 5. Set appropriate timeouts
- Market data: 10s
- Order placement: 30s (critical, may need higher)
- Analytics: 5s (non-critical)

---

## Related Documentation

- [Common Pitfalls](./ai/common-pitfalls.md) - Trading-specific error scenarios
- [Runbook](./runbook.md) - Operational procedures and troubleshooting
- [Architecture](./architecture.md) - System design and dependencies
