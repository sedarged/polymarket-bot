# Troubleshooting Guide

**Version:** 1.0  
**Last Updated:** 2026-02-08  
**Related:** [Runbook](./runbook.md), [Error Taxonomy](./error-taxonomy.md), [Security Audit](../REPORTS/AUDIT.md)

---

## Table of Contents

1. [Quick Diagnostic Checklist](#quick-diagnostic-checklist)
2. [Top 10 Common Issues](#top-10-common-issues)
3. [WebSocket Connection Issues](#websocket-connection-issues)
4. [Trading Gate Failures](#trading-gate-failures)
5. [API Client Errors](#api-client-errors)
6. [Authentication Errors](#authentication-errors)
7. [Order Placement Failures](#order-placement-failures)
8. [Kill Switch Issues](#kill-switch-issues)
9. [Balance & Reconciliation Errors](#balance--reconciliation-errors)
10. [Performance & Reliability Issues](#performance--reliability-issues)
11. [Security & Compliance Issues](#security--compliance-issues)
12. [Debug Mode & Logging](#debug-mode--logging)

---

## Quick Diagnostic Checklist

**Before diving deep, run these quick checks:**

```bash
# 1. Check service status
npm run dev  # Does the server start?

# 2. Check non-sensitive configuration (do NOT print secrets)
grep -E '^(LIVE_TRADING|COMPLIANCE_ACCEPTED|LOG_LEVEL|PORT)=' .env  # Only non-sensitive keys; NEVER print secrets

# 3. Check logs
tail -n 100 logs/app.log  # Recent errors

# 4. Test connectivity
npm run markets  # Can we fetch markets?

# 5. Check kill switch status (requires admin token)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/status | jq '.circuitBreakers, .liveTrading'  # Trading status and circuit breakers

# 6. Review recent commits
git log --oneline -10  # Recent changes?
```

**Common Root Causes:**
- ❌ Missing or invalid `.env` configuration
- ❌ Network connectivity issues
- ❌ Expired or invalid API credentials
- ❌ Kill switch activated (intentionally or by error)
- ❌ Insufficient wallet balance
- ❌ Rate limiting by Polymarket APIs

---

## Top 10 Common Issues

### 1. "Trading gate blocked" - Live Trading Disabled

**Symptom:**
```
Order placed in PAPER mode (live trading disabled)
Trading gate check failed: LIVE_TRADING or COMPLIANCE_ACCEPTED not set
```

**Root Cause:** Safety gates prevent accidental live trading.

**Solution:**

```bash
# Check current configuration
grep -E "LIVE_TRADING|COMPLIANCE_ACCEPTED" .env

# For PAPER trading (safe default):
LIVE_TRADING=false
COMPLIANCE_ACCEPTED=false

# For LIVE trading (CRITICAL - read compliance docs first):
LIVE_TRADING=true
COMPLIANCE_ACCEPTED=true  # Affirms you've read docs/compliance.md
```

**Related:**
- [Compliance Guide](./compliance.md) - MUST READ before enabling live trading
- [Live Trading Gate Implementation](../apps/backend/src/utils/liveTrading.ts)
- Audit Finding A-004 - Admin token security

**Severity:** ℹ️ INFORMATIONAL (this is expected behavior)

---

### 2. "Private key not configured" - Wallet Setup Missing

**Symptom:**
```
Error: PRIVATE_KEY environment variable not configured
Cannot initialize trading client without wallet
```

**Root Cause:** Trading requires wallet credentials.

**Solutions:**

**Option A: Paper Trading (No wallet needed):**
```bash
# In .env
LIVE_TRADING=false
# PRIVATE_KEY not required for paper trading
```

**Option B: Live Trading (Requires wallet):**
```bash
# SECURITY WARNING: See docs/security.md first!
# In .env
PRIVATE_KEY=0x1234567890abcdef...  # Your wallet private key
LIVE_TRADING=true
COMPLIANCE_ACCEPTED=true
```

**Security Checklist:**
- ✅ Read [docs/security.md](./security.md) - Private key security guide
- ✅ Read [docs/compliance.md](./compliance.md) - Legal requirements
- ✅ NEVER commit `.env` or private keys to git
- ✅ Use small amounts for initial testing
- ✅ Consider hardware wallet or secure enclave for production

**Related:**
- Audit Finding **A-001 (CRITICAL)**: Plaintext private key storage
- [ADR-0005](./adr/0005-secrets-management.md) - Secrets management strategy
- [REPORTS/AUDIT.md](../REPORTS/AUDIT.md) - Full security audit

**Severity:** 🟡 EXPECTED - Configuration required

---

### 3. "WebSocket disconnected" - Connection Lost

**Symptom:**
```
WebSocket disconnected with code 1006
Connection state: RECONNECTING
Scheduled reconnect in 2.5 seconds (attempt 2/∞)
```

**Root Cause:** Network interruption or server restart.

**Expected Behavior:**
- ✅ Bot automatically reconnects with exponential backoff
- ✅ Resync orderbook from REST API after reconnection
- ✅ Trading resumes automatically if within risk limits

**When to Worry:**
- ❌ Reconnection fails repeatedly (>10 attempts)
- ❌ Connection state stuck in RECONNECTING for >5 minutes
- ❌ No resync after reconnection

**Manual Recovery:**
```bash
# Check if WebSocket endpoint is reachable
wscat -c wss://ws-subscriptions-clob.polymarket.com/ws/market

# Restart the bot
npm run dev

# Check connection status
curl http://localhost:3000/health | jq '.marketFeed'
```

**Related:**
- [WebSocket Client Code](../apps/backend/src/clients/websocket.ts)
- Audit Finding **A-007 (HIGH)**: Race condition in resync
- Audit Finding **A-010 (HIGH)**: Message deduplication (RESOLVED)
- Audit Finding **A-016 (MEDIUM)**: Reconnect timer leak

**Severity:** ℹ️ NORMAL - Auto-recoverable

---

### 4. "Rate limit exceeded" - API Quota Hit

**Symptom:**
```
Error: Request failed with status code 429
Too Many Requests - Rate limit exceeded
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1675891234
```

**Root Cause:** Exceeded Polymarket API rate limits.

**Rate Limits:**
- CLOB API: 10 requests/second per IP
- Gamma API: 10 requests/second per IP
- WebSocket: 1 connection per account

**Solutions:**

**Immediate:**
```bash
# Wait for rate limit reset (check X-RateLimit-Reset header)
# Bot will retry automatically with exponential backoff

# Check retry configuration
grep RETRY_ .env
RETRY_ATTEMPTS=3
RETRY_DELAY=1000  # 1s base delay
```

**Long-term:**
```bash
# Reduce polling frequency
# Rely on WebSocket for real-time data
# Implement client-side rate limiting (Audit Finding A-008)
```

**Related:**
- [Rate Limits Documentation](https://docs.polymarket.com/quickstart/introduction/rate-limits)
- [Retry Logic](../apps/backend/src/utils/retry.ts)
- [Error Taxonomy](./error-taxonomy.md) - Rate limit classification
- Audit Finding **A-008 (HIGH)**: No rate limiting on HTTP endpoints
- Audit Finding **A-023 (LOW)**: No backoff jitter

**Severity:** 🟡 MODERATE - Degrades service

---

### 5. "Invalid order parameters" - Order Rejected

**Symptom:**
```
Error: Order validation failed
Invalid price: must be multiple of tick size (0.01)
Invalid size: must be between 1 and 100000
```

**Root Cause:** Order doesn't meet market requirements.

**Common Validation Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid price | Not multiple of tick size | Round to 0.01 increments |
| Invalid size | Below min (1) or above max (100k) | Check market constraints |
| Invalid side | Must be "BUY" or "SELL" | Use enum values |
| Invalid token_id | Market not found | Verify market exists and is active |
| Insufficient balance | Not enough USDC | Check wallet balance |

**Debug Commands:**
```bash
# Check market constraints
npm run markets | jq '.[] | {id, min_size, max_size, tick_size}'

# Note: There is no /api/orders/validate endpoint currently.
# Order validation happens automatically when placing orders.
# To test order validation, see the validation tests:
# apps/backend/tests/unit/orderValidation.test.ts
```

**Related:**
- [Order Validation](../apps/backend/src/utils/orderValidation.ts)
- [Tick Size Validation](./tick-size-validation.md)
- Audit Finding **A-015 (MEDIUM)**: Input validation needed

**Severity:** 🟡 MODERATE - Blocks trading

---

### 6. "Kill switch activated" - Trading Halted

**Symptom:**
```
Trading halted: Kill switch activated (scope: all)
Reason: Emergency stop requested by operator
Timestamp: 2026-02-08T01:23:45.678Z
```

**Root Cause:** Kill switch triggered (manually or automatically).

**Check Status:**
```bash
# Get kill switch status
curl http://localhost:3000/health | jq '.killSwitch'

# Response:
# {
#   "active": true,
#   "scope": "all",
#   "reason": "Emergency stop",
#   "activatedAt": "2026-02-08T01:23:45.678Z"
# }
```

**Deactivate (if safe):**
```bash
# To resume trading after kill switch:
# 1. Fix the issue that triggered the kill switch
# 2. Delete the state file: rm apps/backend/.state/kill-switch.json
# 3. Restart the server
# Note: No HTTP DELETE endpoint is currently implemented for deactivation
```

**Kill Switch Scopes:**
- `all` - Stop all trading
- `market` - Stop specific market (requires tokenId)
- `risk-only` - Stop trading that exceeds risk limits

**Related:**
- [Runbook - Kill Switch](./runbook.md#kill-switch)
- Audit Finding **A-002 (CRITICAL)**: Kill switch not persisted (will reset on restart)
- Audit Finding **A-004 (HIGH)**: Admin token optional
- [ADR-0004](./adr/0004-kill-switch-persistence.md) - Persistence strategy

**Severity:** 🔴 CRITICAL - Trading blocked (intentional)

---

### 7. "Balance fetch failed" - Wallet Balance Unknown

**Symptom:**
```
Warning: Failed to fetch wallet balance
Balance: undefined
Cannot verify sufficient funds for order
```

**Root Cause:** Can't retrieve wallet balance from blockchain.

**Causes & Solutions:**

**A. RPC Node Unavailable:**
```bash
# Check CHAIN_ID and RPC endpoint
grep CHAIN_ID .env
CHAIN_ID=137  # Polygon mainnet

# Test RPC connectivity
curl -X POST https://polygon-rpc.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

**B. Invalid Wallet Address:**
```bash
# Verify private key derives correct address
# (Use a safe tool, not production logs)
```

**C. Network Issues:**
```bash
# Check general connectivity
ping polygon-rpc.com
```

**Workaround:**
```bash
# Paper trading doesn't require real balance
LIVE_TRADING=false
```

**Related:**
- [Trading Client](../apps/backend/src/clients/tradingClient.ts:95-108)
- Audit Finding **A-005 (HIGH)**: Unsafe parsing with @ts-ignore
- Audit Finding **A-011 (HIGH)**: Balance fetch silently fails (RESOLVED)

**Severity:** 🔴 HIGH - Blocks live trading

---

### 8. "Authentication failed (401)" - Invalid Token

**Symptom:**
```
Error: Request failed with status code 401
Unauthorized - Invalid or missing authentication token
```

**Root Cause:** Admin token missing or incorrect.

**Solutions:**

**A. Configure Admin Token:**
```bash
# In .env
ADMIN_TOKEN=your-secret-token-here  # Generate strong random token

# Restart server
npm run dev
```

**B. Use Token in Requests:**
```bash
# Include Authorization header
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: Bearer your-secret-token-here" \
  -d '{"scope": "all", "reason": "Testing"}'

# OR without "Bearer" prefix (both supported)
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: your-secret-token-here" \
  -d '{"scope": "all", "reason": "Testing"}'
```

**Security Notes:**
- ✅ Use long random tokens (32+ characters)
- ✅ Rotate tokens regularly
- ✅ Never commit tokens to git
- ❌ Do NOT use weak tokens like "admin" or "password"

**Related:**
- [Server Authentication](../apps/backend/src/server/index.ts)
- Audit Finding **A-004 (HIGH)**: Admin token optional (allows auth bypass)
- [Authentication Tests](../apps/backend/tests/integration/auth.test.ts)

**Severity:** 🟡 MODERATE - Security issue if misconfigured

---

### 9. "Order not found" - Tracking Lost

**Symptom:**
```
Error: Order not found in tracking map
Cannot cancel order: orderId=undefined
Position calculation may be incorrect
```

**Root Cause:** Order ID not properly tracked.

**Causes:**

**A. Paper Trading Engine Issue:**
- Order created without ID
- ID not returned from execution
- Race condition in order tracking

**B. Live Trading Issue:**
- CLOB API didn't return order ID
- Order rejected before ID assigned
- Network issue during submission

**Debug Steps:**
```bash
# Check order tracking
curl http://localhost:3000/api/orders | jq '.'

# Check market feed status (WebSocket connection)
curl http://localhost:3000/feed/status
```

**Related:**
- Audit Finding **A-013 (MEDIUM)**: Order mapping allows missing orderID
- Audit Finding **A-021 (MEDIUM)**: Integer overflow in order IDs (RESOLVED - now using UUID)
- [Paper Trading Engine](../apps/backend/src/trading/paperTradingEngine.ts)

**Severity:** 🟡 MODERATE - Impacts order management

---

### 10. "Startup reconciliation failed" - State Mismatch

**Symptom:**
```
Error: Failed to reconcile state on startup
Position mismatch: expected 100, found 50
Balance mismatch: expected $1000, found $950
```

**Root Cause:** Local state doesn't match blockchain/CLOB reality.

**Causes:**
- Bot crash during order execution
- Manual trading outside bot
- Fills received while bot offline
- Blockchain reorg (rare)

**Recovery:**
```bash
# 1. Stop all trading
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"scope": "all", "reason": "Reconciliation needed"}'

# 2. Restart bot (triggers automatic reconciliation)
npm run dev

# 3. Check logs for reconciliation results
tail -f logs/app.log | grep "reconciliation"

# 4. Manually verify positions
curl http://localhost:3000/api/positions | jq '.'

# 5. If mismatch persists, investigate:
# - Check CLOB orders: curl "https://clob.polymarket.com/orders?address=..."
# - Check CLOB fills: curl "https://clob.polymarket.com/fills?address=..."
# - Check wallet balance on Polygonscan
```

**Related:**
- Audit Finding **A-014 (MEDIUM)**: Position calculation only uses MATCHED status
- [GAP_ANALYSIS.md](../REPORTS/GAP_ANALYSIS.md) - DI-001: No periodic reconciliation
- [Trading Client](../apps/backend/src/clients/tradingClient.ts)

**Severity:** 🔴 HIGH - Can cause financial loss

---

## WebSocket Connection Issues

### Connection Refused / Timeout

**Symptom:**
```
Error: WebSocket connection failed
Error: connect ETIMEDOUT
URL: wss://ws-subscriptions-clob.polymarket.com/ws/market
```

**Causes:**
- Network firewall blocking WebSocket
- DNS resolution failure
- Polymarket WebSocket service down
- Local network issues

**Solutions:**
```bash
# Test DNS resolution
nslookup ws-subscriptions-clob.polymarket.com

# Test WebSocket connectivity (requires wscat)
npm install -g wscat
wscat -c wss://ws-subscriptions-clob.polymarket.com/ws/market

# Check firewall/proxy settings
echo $https_proxy
echo $HTTPS_PROXY

# Try alternative network
# (Different WiFi, mobile hotspot, etc.)
```

### Reconnection Loop

**Symptom:**
```
WebSocket disconnected (attempt 1)
Reconnecting in 1.2s...
WebSocket disconnected (attempt 2)
Reconnecting in 2.4s...
[repeats indefinitely]
```

**Causes:**
- Invalid authentication
- Token IDs not subscribed properly
- Server rejecting connection
- Rate limiting

**Debug:**
```bash
# Check TOKEN_IDS configuration
grep TOKEN_IDS .env
TOKEN_IDS=0x123...,0x456...  # Comma-separated

# Enable debug logging
LOG_LEVEL=debug npm run dev

# Check WebSocket logs
tail -f logs/app.log | grep "WebSocket"
```

**Related:**
- [WebSocket Client](../apps/backend/src/clients/websocket.ts)
- [Market Feed Service](../apps/backend/src/server/marketFeedService.ts)
- Audit Finding **A-016 (MEDIUM)**: Reconnect timer not cleared

---

## Trading Gate Failures

### "COMPLIANCE_ACCEPTED not set"

**Symptom:**
```
Trading blocked: Compliance acknowledgment required
Set COMPLIANCE_ACCEPTED=true after reading docs/compliance.md
```

**Solution:**
```bash
# 1. READ THE COMPLIANCE DOCS (mandatory)
cat docs/compliance.md  # Or open in browser

# 2. Understand legal obligations
# - Geographic restrictions (US, sanctioned countries)
# - Terms of Service compliance
# - Financial and legal risks

# 3. Set environment variable (only if compliant)
echo "COMPLIANCE_ACCEPTED=true" >> .env

# 4. Restart
npm run dev
```

**Severity:** 🛡️ LEGAL PROTECTION - Do NOT bypass

---

## API Client Errors

### "Request failed with status code 404"

**Symptom:**
```
Error: Request failed with status code 404
GET /book?token_id=0x123... returned 404 Not Found
```

**Causes:**
- Invalid token ID (market doesn't exist)
- Market closed or delisted
- Typo in token ID
- API endpoint changed

**Solutions:**
```bash
# List active markets
npm run markets | jq '.[] | {id, question, active}'

# Check specific market
curl "https://clob.polymarket.com/markets/0x123..."

# Verify token ID format (should be 66 hex chars)
echo "0x1234..." | wc -c  # Should be 66 (0x + 64 chars)
```

### "Network Error" / ECONNREFUSED

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:3000
Error: Network Error
```

**Causes:**
- Server not running
- Wrong port
- Firewall blocking

**Solutions:**
```bash
# Check if server is running
curl http://localhost:3000/health

# Start server if not running
npm run dev

# Check port configuration
grep PORT .env
PORT=3000  # Default

# Check if port is in use
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows
```

---

## Authentication Errors

See [Issue #8: Authentication Failed (401)](#8-authentication-failed-401---invalid-token) above.

**Additional Scenarios:**

### Missing Authorization Header

**Fix:**
```bash
# Always include header
curl -H "Authorization: Bearer $ADMIN_TOKEN" ...
```

### Token Contains Spaces or Special Characters

**Fix:**
```bash
# URL-encode token or use quotes
curl -H "Authorization: Bearer $(cat .env | grep ADMIN_TOKEN | cut -d= -f2)" ...
```

---

## Order Placement Failures

See [Issue #5: Invalid Order Parameters](#5-invalid-order-parameters---order-rejected) above.

**Additional Scenarios:**

### "Order expired"

**Cause:** Order took too long to reach CLOB.

**Solution:**
```bash
# Check network latency
ping clob.polymarket.com

# Reduce order expiration time (not configurable in current version)
# Implement order queue with priority (future enhancement)
```

### "Nonce too low" / "Nonce already used"

**Cause:** Order nonce collision.

**Solution:**
- Current implementation uses timestamp + PID (Audit Finding A-006 - RESOLVED)
- Now uses UUID v4 for client order IDs (collision-free)

---

## Kill Switch Issues

See [Issue #6: Kill Switch Activated](#6-kill-switch-activated---trading-halted) above.

**Additional Scenarios:**

### Kill Switch Lost on Restart

**Symptom:**
```
Kill switch was active before restart
After restart: trading resumed automatically
Expected: trading should remain halted
```

**Root Cause:** Audit Finding **A-002 (CRITICAL)** - Kill switch not persisted

**Workaround:**
```bash
# Re-activate kill switch after every restart
npm run dev
sleep 5  # Wait for startup
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"scope": "all", "reason": "Persistent halt"}'
```

**Permanent Fix:** Implement kill switch persistence (ADR-0004)

---

## Balance & Reconciliation Errors

See [Issue #7: Balance Fetch Failed](#7-balance-fetch-failed---wallet-balance-unknown) and [Issue #10: Startup Reconciliation Failed](#10-startup-reconciliation-failed---state-mismatch) above.

**Additional Scenarios:**

### Position Drift

**Symptom:**
```
Local position: 100 shares
CLOB position: 95 shares
Drift detected: 5 shares
```

**Causes:**
- Partial fills not tracked (Audit Finding A-014, A-019)
- Orders canceled outside bot
- Fills missed during downtime

**Solution:**
```bash
# Restart triggers automatic reconciliation on startup
npm run dev

# Check reconciliation results in logs
tail -f logs/app.log | grep "Reconciliation"

# Check positions via /state endpoint (requires admin token)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/state | jq '.positions'

# Note: Periodic reconciliation runs automatically every 
# RECONCILIATION_INTERVAL_SECONDS (default: 300s/5min)
# No manual /api/reconcile endpoint is currently implemented
```

---

## Performance & Reliability Issues

### High Memory Usage

**Symptom:**
```
RSS: 500 MB
Heap Used: 450 MB
Warning: Memory usage high
```

**Causes:**
- Orderbook cache growing unbounded (Audit Finding A-015)
- WebSocket message backlog
- Memory leak in reconnect timer (Audit Finding A-016)

**Solutions:**
```bash
# Monitor memory
curl http://localhost:3000/health | jq '.memory'

# Restart if memory exceeds threshold
# (No auto-restart implemented yet)

# Implement cache TTL (future enhancement)
```

### Slow Order Execution

**Symptom:**
```
Order placement latency: 2500ms (target: <500ms)
```

**Causes:**
- Network latency
- Rate limiting backoff
- Slow RPC node

**Solutions:**
```bash
# Use faster RPC endpoint
# Use WebSocket for real-time data (already implemented)
# Co-locate server near Polymarket infrastructure
```

---

## Security & Compliance Issues

### Private Key Exposed in Logs

**Symptom:**
```
[WARN] Private key logged: 0x1234567890abcdef...
```

**Severity:** 🔴 CRITICAL - Immediate key rotation required

**Actions:**
1. Rotate private key immediately
2. Transfer funds to new wallet
3. Review all logs for exposure
4. Check if logs were uploaded/shared
5. Implement log filtering (Audit Finding A-022)

### Suspicious Trading Activity Detected

**Symptom:**
- Account suspended by Polymarket
- KYC verification request
- Fund withdrawal delayed

**Actions:**
1. Halt all trading immediately (kill switch)
2. Review trading logs for anomalies
3. Contact Polymarket support
4. Provide documentation of legitimate trading
5. Do NOT attempt to circumvent restrictions

**Related:** [Compliance Guide](./compliance.md)

---

## Debug Mode & Logging

### Enable Verbose Logging

```bash
# In .env
LOG_LEVEL=debug

# Restart
npm run dev

# Follow logs
tail -f logs/app.log
```

### Enable Specific Component Logging

```typescript
// In code (for developers)
import { logger } from './utils/logger';
logger.debug('Detailed message', { context: 'component' });
```

### Log Locations

```
logs/
  app.log         # Main application log
  error.log       # Errors only
  trading.log     # Trading-specific events (if implemented)
```

### Useful Log Queries

```bash
# Recent errors
grep ERROR logs/app.log | tail -20

# WebSocket events
grep "WebSocket" logs/app.log | tail -50

# Order activity
grep "order" logs/app.log | grep -v "orderbook" | tail -30

# Kill switch events
grep "kill" -i logs/app.log

# API errors
grep "status code" logs/app.log | tail -20
```

---

## Getting Help

**Still stuck? Here's how to get help:**

### 1. Check Documentation
- [Architecture Overview](./architecture-overview.md)
- [Runbook](./runbook.md)
- [Security Audit](../REPORTS/AUDIT.md)
- [Gap Analysis](../REPORTS/GAP_ANALYSIS.md)

### 2. Search Issues
- Check [GitHub Issues](https://github.com/sedarged/polymarket-bot/issues)
- Search for error message text

### 3. Create Issue
- Include error messages (redact private keys!)
- Include relevant logs
- Include steps to reproduce
- Include environment details (Node version, OS, etc.)

### 4. Emergency Support
- For critical production issues, follow [Runbook - Incident Response](./runbook.md#incident-response)

---

## Appendix: Error Code Reference

| Code | Name | Severity | Retry? |
|------|------|----------|--------|
| 400 | Bad Request | MEDIUM | No |
| 401 | Unauthorized | HIGH | No |
| 403 | Forbidden | HIGH | No |
| 404 | Not Found | MEDIUM | No |
| 429 | Too Many Requests | MEDIUM | Yes |
| 500 | Internal Server Error | HIGH | Yes |
| 502 | Bad Gateway | MEDIUM | Yes |
| 503 | Service Unavailable | MEDIUM | Yes |
| ECONNREFUSED | Connection Refused | HIGH | Yes |
| ETIMEDOUT | Connection Timeout | MEDIUM | Yes |
| ENOTFOUND | DNS Resolution Failed | HIGH | Yes |

**Related:** [Error Taxonomy](./error-taxonomy.md)

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-08  
**Next Review:** 2026-03-08 or after major incident
