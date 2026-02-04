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
- Resync state after reconnection using proper synchronization (see A-007)
- Maintain heartbeat/ping-pong
- Log all connection state changes

**⚠️ CRITICAL**: When resyncing state after reconnect, prevent race conditions by using promise-based locking. Do NOT use simple boolean/Set flags that allow concurrent operations to race through checks.

```typescript
// ❌ BAD: Race condition during resync
private resyncInProgress: Set<string> = new Set();

async resyncOrderbook(tokenId: string) {
  if (this.resyncInProgress.has(tokenId)) {
    return; // Multiple calls can race past this check!
  }
  this.resyncInProgress.add(tokenId);
  // ... fetch data
}

// ✅ GOOD: Promise-based locking prevents race conditions (Audit Finding A-007)
private resyncPromises: Map<string, Promise<void>> = new Map();

async resyncOrderbook(tokenId: string) {
  const existingPromise = this.resyncPromises.get(tokenId);
  if (existingPromise) {
    return existingPromise; // Wait for existing resync
  }
  
  const resyncPromise = this.performResync(tokenId);
  this.resyncPromises.set(tokenId, resyncPromise);
  
  try {
    await resyncPromise;
  } finally {
    this.resyncPromises.delete(tokenId);
  }
}

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
- [Runbook](../runbook.md) - Operational procedures
- [Automation Guide](../automation.md) - CI/CD and automation best practices

---

## 🤖 Automation Pitfalls

### 1. **Manual CHANGELOG.md Edits**

**Problem:** Editing CHANGELOG.md directly in your commits.

**Why It's Wrong:** The file is auto-generated by Release Please. Your manual edits will be **overwritten** on the next release.

**Correct Approach:**
```bash
# ❌ WRONG: Editing CHANGELOG.md
vim CHANGELOG.md
git add CHANGELOG.md
git commit -m "Update changelog"

# ✅ CORRECT: Use descriptive conventional commits
git commit -m "feat: add order cancellation support

Implements cancel order functionality with proper error handling.
Users can now cancel pending orders via the API or dashboard.

Closes #42"
```

The commit message will automatically appear in the changelog when Release Please runs.

### 2. **Non-Conventional Commits**

**Problem:** Using informal commit messages like "updated code", "fix", "WIP", "changes".

**Why It's Wrong:** 
- Breaks automated release process
- Changelog won't be generated
- Version won't be bumped correctly
- Other developers can't understand what changed

**Correct Approach:**
```bash
# ❌ WRONG: Non-conventional commits
git commit -m "updated code"
git commit -m "fix"
git commit -m "WIP"
git commit -m "changes"

# ✅ CORRECT: Conventional commits
git commit -m "feat: add WebSocket reconnection with exponential backoff"
git commit -m "fix: prevent double order submission on retry"
git commit -m "security: sanitize user inputs (A-015)"
git commit -m "refactor: extract order validation to separate module"
git commit -m "docs: add troubleshooting guide for connection errors"
```

**Format:** `<type>: <description>`

**Types:** feat, fix, security, perf, refactor, docs, test, chore, ci

### 3. **Ignoring Security Audits**

**Problem:** Dismissing npm audit warnings or ignoring Dependabot PRs.

**Why It's Wrong:**
- Real money at risk in production
- Known vulnerabilities can be exploited
- Security patches are critical for trading bots
- Delayed fixes increase exposure window

**Correct Approach:**
```bash
# Check for vulnerabilities
npm audit --audit-level=high

# Review Dependabot PRs WEEKLY
# Merge security patches IMMEDIATELY

# If audit shows vulnerabilities:
npm audit fix              # Try automatic fix
npm update <package>       # Update specific package
```

**Priority:**
1. Merge Dependabot security PRs immediately
2. Review other Dependabot PRs weekly
3. Never ignore HIGH or CRITICAL vulnerabilities
4. Document any unfixable vulnerabilities

### 4. **Large PRs Without Tests**

**Problem:** Submitting 800+ line PRs with no test changes.

**Why It's Wrong:**
- High risk for trading bot (money at stake)
- Difficult to review thoroughly
- Bugs harder to isolate
- Security issues easier to miss
- Makes rollback difficult

**Correct Approach:**
```bash
# ❌ WRONG: Large PR without tests
# 847 lines changed across 15 files
# No test files modified

# ✅ CORRECT: Small PRs with tests
# PR 1: Add order validation (120 lines)
#   - order-validator.ts (60 lines)
#   - order-validator.test.ts (60 lines)
#
# PR 2: Integrate validation (80 lines)
#   - order-manager.ts (40 lines)
#   - order-manager.test.ts (40 lines)
```

**Best practices:**
- Keep PRs under 500 lines
- Add tests for all code changes
- Separate refactoring from features
- One logical change per PR
- Break large features into smaller PRs

### 5. **Missing Audit References**

**Problem:** Security fix without referencing the audit finding.

**Why It's Wrong:**
- Can't track audit progress
- Unclear what vulnerability was fixed
- Hard to verify fix addresses the finding
- Audit report becomes outdated

**Correct Approach:**
```bash
# ❌ WRONG: No audit reference
git commit -m "security: fix input validation"

# ✅ CORRECT: With audit reference
git commit -m "security: add input validation for order parameters (A-015)

Addresses audit finding A-015 by implementing Zod schema validation.
All order parameters are now validated before submission:
- Order size must be positive, non-zero
- Price must be positive, within reasonable range
- Side must be 'BUY' or 'SELL'

Added comprehensive tests for edge cases and attack scenarios.
See REPORTS/AUDIT.md for details on A-015.

Closes #45"
```

**Audit reference format:** `(A-XXX)` where XXX is the finding number from REPORTS/AUDIT.md

### 6. **Skipping CI Checks Locally**

**Problem:** Pushing code without running tests, build, or audit locally.

**Why It's Wrong:**
- CI failures are slow feedback (minutes vs seconds)
- Wastes CI resources
- Blocks other PRs
- Looks unprofessional

**Correct Approach:**
```bash
# ✅ ALWAYS run before pushing
npm ci                              # Install dependencies
npm run build                       # Type check
npm test                            # Run tests
npm audit --audit-level=high       # Security check

# If all pass, then push
git push
```

**Add a pre-push hook:**
```bash
# .git/hooks/pre-push
#!/bin/bash
npm run build && npm test
```

### 7. **Merging Without CI Passing**

**Problem:** Merging PRs before CI completes or while tests are failing.

**Why It's Wrong:**
- Breaks main branch
- Blocks other developers
- Introduces bugs to production
- Defeats purpose of CI

**Correct Approach:**
- Wait for all CI checks to pass
- Review CI output before merging
- Fix failures, don't bypass them
- Use branch protection rules

### 8. **Ignoring PR Quality Checks**

**Problem:** Ignoring automated PR quality check comments.

**Why It's Wrong:**
- Reduces PR quality
- Makes code review harder
- Misses important context
- Reduces maintainability

**Common issues flagged:**
- PR description too short (<30 chars)
- No issue linked ("Closes #123")
- No test mentions
- Code changes without test changes
- Security fix without audit reference

**Correct Approach:**
```markdown
# ✅ GOOD PR description
## Summary
Implements order cancellation feature with proper error handling.

## Changes
- Added `cancelOrder()` method to OrderManager
- Implemented confirmation dialog in dashboard
- Added comprehensive error handling
- Updated documentation

## Testing
- Added unit tests for cancelOrder logic
- Added integration tests for API endpoint
- Tested with invalid order IDs
- Verified error messages

Closes #42
```

### Quick Reference: Automation Do's and Don'ts

| ❌ Don't | ✅ Do |
|---------|------|
| Edit CHANGELOG.md manually | Use conventional commits |
| Use "fix", "update", "WIP" commits | Use "feat:", "fix:", "security:" format |
| Ignore npm audit warnings | Merge Dependabot security PRs immediately |
| Submit large PRs without tests | Keep PRs <500 lines, add tests |
| Omit audit references | Reference A-XXX in security commits |
| Push without local testing | Run build + test + audit before push |
| Merge with failing CI | Wait for all checks to pass |
| Skip PR description | Write clear, detailed descriptions |
