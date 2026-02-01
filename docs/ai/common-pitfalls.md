# Common Pitfalls

Trading bots have unique challenges. This guide covers common pitfalls specific to trading systems and how to avoid them.

## 🔴 Critical Pitfalls (Can Cause Financial Loss)

### 1. **Double Order Submission**
**Problem**: Retrying failed orders without idempotency can submit the same order multiple times.

**Impact**: Unintended position sizes, financial loss.

**Solution**:
- Use unique order IDs (client-generated UUIDs)
- Check order status before retry
- Implement idempotency keys
- Store submitted orders in memory/database
- Verify order doesn't exist before submitting

```typescript
// ❌ BAD: Retrying without idempotency
async function placeOrder(params) {
  return await api.submitOrder(params); // Might submit twice
}

// ✅ GOOD: Idempotent order submission
async function placeOrder(params) {
  const orderId = generateUUID();
  if (submittedOrders.has(orderId)) return submittedOrders.get(orderId);
  
  const result = await api.submitOrder({ ...params, clientOrderId: orderId });
  submittedOrders.set(orderId, result);
  return result;
}
```

### 2. **Missing Live Trading Gates**
**Problem**: Allowing orders to go live without proper safeguards.

**Impact**: Unintended real trades, financial loss, compliance violations.

**Solution**:
- **ALWAYS** check both `LIVE_TRADING=true` AND `COMPLIANCE_ACCEPTED=true`
- Default to paper trading
- Fail closed if env vars missing
- Log all trading decisions
- Add confirmation prompts for live mode

```typescript
// ✅ REQUIRED: Two-factor gate
function canPlaceLiveOrder(): boolean {
  const liveTradingEnabled = process.env.LIVE_TRADING === 'true';
  const complianceAccepted = process.env.COMPLIANCE_ACCEPTED === 'true';
  
  if (!liveTradingEnabled || !complianceAccepted) {
    logger.warn('Live trading not enabled, using paper mode');
    return false;
  }
  
  return true;
}
```

### 3. **Ignoring Rate Limits**
**Problem**: Hammering APIs without respecting rate limits.

**Impact**: Account suspension, API bans, missed trading opportunities.

**Solution**:
- Implement rate limiting (use `bottleneck` or similar)
- Respect API headers (X-RateLimit-*)
- Use exponential backoff on 429 responses
- Batch requests when possible
- Monitor request counts

```typescript
// ✅ GOOD: Rate limiting
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200, // 200ms between requests
});

const rateLimitedFetch = limiter.wrap(fetch);
```

### 4. **Not Handling WebSocket Disconnects**
**Problem**: Assuming WebSocket stays connected indefinitely.

**Impact**: Stale market data, missed trading signals, incorrect decisions.

**Solution**:
- Implement automatic reconnection with exponential backoff
- Add jitter to prevent thundering herd
- Resync state after reconnection
- Maintain heartbeat/ping-pong
- Log all connection state changes

```typescript
// ✅ GOOD: Reconnection with backoff
class WebSocketManager {
  private reconnectAttempts = 0;
  private maxBackoff = 30000; // 30 seconds
  
  async reconnect() {
    const backoff = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxBackoff
    );
    const jitter = Math.random() * 1000;
    
    await sleep(backoff + jitter);
    await this.connect();
    await this.resyncState(); // Critical!
  }
}
```

## ⚠️ Major Pitfalls (Can Cause System Failure)

### 5. **No State Reconciliation on Startup**
**Problem**: Starting bot without checking current positions/orders.

**Impact**: Duplicate orders, incorrect position tracking, unexpected behavior.

**Solution**:
- Fetch all open orders on startup
- Fetch current positions
- Reconcile in-memory state with exchange
- Handle orphaned orders
- Log reconciliation results

### 6. **Missing Error Boundaries**
**Problem**: Unhandled exceptions crash the entire bot.

**Impact**: Lost trading opportunities, no recovery from transient errors.

**Solution**:
- Wrap critical operations in try-catch
- Implement circuit breakers
- Graceful degradation
- Log all errors with context
- Continue operation where possible

```typescript
// ✅ GOOD: Error boundary
class TradingEngine {
  async runTradingLoop() {
    while (this.isRunning) {
      try {
        await this.executeTradingLogic();
      } catch (error) {
        logger.error('Trading loop error', error);
        await this.handleTradingError(error);
        // Continue running unless critical
      }
    }
  }
}
```

### 7. **Secrets in Frontend Code**
**Problem**: Exposing private keys, API keys, or secrets in frontend.

**Impact**: Security breach, account compromise, financial loss.

**Solution**:
- **NEVER** send secrets to frontend
- All trading operations go through backend
- Use environment variables for secrets
- Add to `.gitignore` if using `.env` files
- Audit code for accidental secret exposure

### 8. **No Circuit Breakers**
**Problem**: Continuing to hammer failing services.

**Impact**: Rate limiting, bans, cascading failures.

**Solution**:
- Implement circuit breaker pattern
- Stop requests after N consecutive failures
- Half-open state to test recovery
- Log circuit breaker state changes

```typescript
// ✅ GOOD: Circuit breaker
class CircuitBreaker {
  private failures = 0;
  private threshold = 5;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async execute(fn: () => Promise<any>) {
    if (this.state === 'open') {
      throw new Error('Circuit breaker is open');
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
}
```

## 🟡 Important Pitfalls (Can Cause Issues)

### 9. **Stale Order Book Data**
**Problem**: Using cached order book without timestamp checks.

**Impact**: Trading on outdated prices, losses.

**Solution**:
- Add timestamps to cached data
- Set maximum age (e.g., 5 seconds)
- Refresh on access if stale
- Log cache hits/misses

### 10. **Not Validating Signatures**
**Problem**: Signing orders incorrectly or not validating signatures.

**Impact**: Rejected orders, failed trades.

**Solution**:
- Follow Polymarket's signature scheme exactly
- Test signature generation thoroughly
- Validate signatures before submission
- Log signature generation failures

### 11. **Ignoring Chain/Network Issues**
**Problem**: Not handling blockchain-specific errors.

**Impact**: Failed transactions, wasted gas, stuck orders.

**Solution**:
- Check network status before operations
- Handle nonce conflicts
- Monitor gas prices
- Implement transaction retries with increasing gas
- Handle chain reorganizations

### 12. **Console.log Instead of Structured Logging**
**Problem**: Using console.log for production logging.

**Impact**: No log levels, difficult debugging, no log aggregation.

**Solution**:
- Use structured logging library (winston, pino)
- Include context in every log
- Use appropriate log levels
- Add timestamps and request IDs
- Make logs searchable

```typescript
// ❌ BAD
console.log('Order submitted');

// ✅ GOOD
logger.info('Order submitted', {
  orderId: order.id,
  market: order.market,
  side: order.side,
  size: order.size,
  price: order.price,
  timestamp: Date.now(),
});
```

### 13. **No Retry Logic**
**Problem**: Failing permanently on transient errors.

**Impact**: Missed trades, unnecessary failures.

**Solution**:
- Implement exponential backoff
- Distinguish transient vs permanent errors
- Set maximum retry attempts
- Log retry attempts
- Use jitter to prevent thundering herd

### 14. **Environment Variables Not Validated**
**Problem**: Assuming environment variables are set correctly.

**Impact**: Runtime errors, incorrect behavior, security issues.

**Solution**:
- Validate all env vars on startup
- Provide defaults where safe
- Fail fast if critical vars missing
- Log configuration on startup
- Use TypeScript for type safety

```typescript
// ✅ GOOD: Env validation
function validateEnv() {
  const required = ['API_KEY', 'PRIVATE_KEY', 'CHAIN_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  
  logger.info('Environment validated', {
    chainId: process.env.CHAIN_ID,
    paperMode: process.env.LIVE_TRADING !== 'true',
  });
}
```

## 🔵 Best Practices

### 15. **Testing Strategy**
- Unit tests for business logic
- Integration tests for API clients
- Mock WebSocket connections in tests
- Test error scenarios
- Test retry logic
- Test with intentional disconnects

### 16. **Monitoring & Observability**
- Log all trading decisions
- Track order success/failure rates
- Monitor WebSocket connection health
- Alert on unusual patterns
- Dashboard for key metrics

### 17. **Documentation**
- Document all environment variables
- Document signature schemes
- Document error codes and handling
- Keep runbook updated
- Document deployment process

### 18. **Version Control**
- Never commit secrets
- Use `.env.example` for templates
- Document configuration changes
- Tag releases
- Keep changelog updated

## Quick Checklist

Before deploying:
- [ ] Two-factor live trading gate implemented
- [ ] Idempotent order submission
- [ ] WebSocket reconnection with resync
- [ ] Circuit breakers in place
- [ ] Rate limiting implemented
- [ ] Structured logging configured
- [ ] Error boundaries around critical code
- [ ] Environment validation on startup
- [ ] No secrets in frontend
- [ ] No secrets committed to git
- [ ] State reconciliation on startup
- [ ] Tests passing
- [ ] Runbook updated

## Related Documentation

- [Decision Trees](./decision-trees.md) - Troubleshooting specific scenarios
- [Project Layout](./project-layout.md) - Where to find code
- [RUNBOOK](../RUNBOOK.md) - Operational procedures
