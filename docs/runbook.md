# Runbook

## Purpose
Operational procedures for running the Polymarket bot in production.

## Official API Documentation
This runbook references the official Polymarket API documentation:
- **CLOB API:** https://docs.polymarket.com/developers/CLOB/introduction
- **Gamma API:** https://docs.polymarket.com/developers/gamma-markets-api/overview
- **WebSocket API:** https://docs.polymarket.com/developers/CLOB/websocket/wss-overview
- **Rate Limits:** https://docs.polymarket.com/quickstart/introduction/rate-limits

For detailed implementation alignment, see [REPORTS/RESEARCH_REVIEW.md](../REPORTS/RESEARCH_REVIEW.md).

## Prerequisites

### Required Environment Variables
```bash
# Trading gates (BOTH required for live trading)
LIVE_TRADING=true
COMPLIANCE_ACCEPTED=true

# Wallet credentials
PRIVATE_KEY=0x...your_private_key
CHAIN_ID=137  # Polygon Mainnet

# API endpoints (defaults are fine for production)
CLOB_API_URL=https://clob.polymarket.com
GAMMA_API_URL=https://gamma-api.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Monitoring
TOKEN_IDS=comma,separated,token,ids
PORT=3000
LOG_LEVEL=info
```

### Environment Validation Script

Run this script before starting the bot to validate your environment:

```bash
#!/bin/bash
# File: scripts/validate-env.sh

echo "=== Environment Validation ==="

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js version must be >= 20 (current: $(node -v))"
  exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Check .env file exists
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  echo "   Copy .env.example to .env and configure it"
  exit 1
fi
echo "✅ .env file exists"

# Safely load environment variables without executing arbitrary code
load_env_safe() {
  while IFS='=' read -r key value; do
    # Skip empty lines and comments
    case "$key" in
      ''|\#*) continue ;;
    esac
    
    # Trim whitespace from key
    key="${key%%[[:space:]]*}"
    
    # Trim leading/trailing whitespace from value
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    
    # Only accept safe shell variable names
    if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      export "$key=$value"
    fi
  done < .env
}

# Load environment variables safely
load_env_safe

check_var() {
  if [ -z "${!1}" ]; then
    echo "❌ $1 is not set"
    return 1
  else
    echo "✅ $1 is set"
    return 0
  fi
}

ERRORS=0

# Critical variables for live trading
if [ "$LIVE_TRADING" = "true" ]; then
  echo ""
  echo "=== Live Trading Mode Checks ==="
  
  if [ "$COMPLIANCE_ACCEPTED" != "true" ]; then
    echo "❌ COMPLIANCE_ACCEPTED must be 'true' for live trading"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ COMPLIANCE_ACCEPTED is true"
  fi
  
  if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ PRIVATE_KEY is required for live trading"
    ERRORS=$((ERRORS + 1))
  else
    # Check PRIVATE_KEY format
    if [[ ! "$PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
      echo "❌ PRIVATE_KEY format invalid (must be 0x + 64 hex chars)"
      ERRORS=$((ERRORS + 1))
    else
      echo "✅ PRIVATE_KEY format valid"
    fi
  fi
  
  if [ "$CHAIN_ID" != "137" ]; then
    echo "⚠️  CHAIN_ID is $CHAIN_ID (mainnet is 137)"
  else
    echo "✅ CHAIN_ID is 137 (Polygon Mainnet)"
  fi
  
  # Check ADMIN_TOKEN for kill switch access
  if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "change_me_to_a_strong_random_admin_token" ]; then
    echo "⚠️  ADMIN_TOKEN not configured or using default"
    echo "   Kill switch endpoint will be disabled"
  else
    echo "✅ ADMIN_TOKEN is configured"
  fi
else
  echo ""
  echo "=== Paper Trading Mode ==="
  echo "✅ Running in paper trading mode (safe)"
fi

# Check API endpoints
echo ""
echo "=== API Endpoint Checks ==="

check_endpoint() {
  local url=$1
  local name=$2
  
  if curl --output /dev/null --silent --head --fail "$url" 2>/dev/null; then
    echo "✅ $name is reachable: $url"
  else
    echo "❌ $name is not reachable: $url"
    ERRORS=$((ERRORS + 1))
  fi
}

check_endpoint "$CLOB_API_URL" "CLOB API"
check_endpoint "$GAMMA_API_URL" "Gamma API"

# WebSocket check
echo ""
echo "=== WebSocket Check ==="
if command -v wscat &> /dev/null; then
  timeout 5 wscat -c "$WS_MARKET_URL" -x 'ping' &> /dev/null
  if [ $? -eq 0 ] || [ $? -eq 124 ]; then
    echo "✅ WebSocket endpoint is reachable"
  else
    echo "❌ WebSocket endpoint is not reachable"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "⚠️  wscat not installed, skipping WebSocket test"
  echo "   Install with: npm install -g wscat"
fi

# Check dependencies
echo ""
echo "=== Dependency Checks ==="
if [ ! -d "node_modules" ]; then
  echo "❌ node_modules not found. Run: npm install"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ node_modules exists"
fi

# Check PORT availability
echo ""
echo "=== Port Check ==="
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "⚠️  Port $PORT is already in use"
  echo "   Another process may be running, or change PORT in .env"
else
  echo "✅ Port $PORT is available"
fi

# Final summary
echo ""
echo "=== Validation Summary ==="
if [ $ERRORS -eq 0 ]; then
  echo "✅ All checks passed! Ready to start the bot."
  exit 0
else
  echo "❌ $ERRORS error(s) found. Please fix before starting."
  exit 1
fi
```

To use:
```bash
chmod +x scripts/validate-env.sh
./scripts/validate-env.sh
```

### Wallet Requirements
- Funded with USDC on Polygon network
- Private key securely stored (use secret manager, not plaintext files)
- Separate from personal wallet (trading wallet only)
- Limited funds based on risk tolerance

## Security Configuration

### CORS (Cross-Origin Resource Sharing) Policy

**CRITICAL SECURITY REQUIREMENT:** The bot server has CORS protection to prevent unauthorized browser-based access.

#### Development vs Production

**Development (Local Testing):**
```bash
# Allow all origins (wildcard) - ONLY for local development
ALLOWED_ORIGINS=*
```

**Production (Live Trading):**
```bash
# REQUIRED: Specify exact allowed origins (comma-separated)
ALLOWED_ORIGINS=https://dashboard.example.com,https://admin.example.com

# Or for single origin:
ALLOWED_ORIGINS=https://dashboard.example.com
```

#### Configuration Rules

1. **Wildcard (`*`) is FORBIDDEN in production**
   - Bot will fail to start if `LIVE_TRADING=true` and `ALLOWED_ORIGINS=*`
   - Bot will fail to start if `NODE_ENV=production` and `ALLOWED_ORIGINS=*`
   - This prevents XSS attacks, session hijacking, and unauthorized access

2. **Allowed origins must be exact matches**
   - Use full URLs with protocol: `https://example.com`
   - Include ports if non-standard: `http://localhost:3000`
   - Multiple origins are comma-separated: `https://app1.com,https://app2.com`

3. **Default configuration**
   - If not specified, defaults to `http://localhost:3000`
   - Safe for local development
   - MUST be changed for production deployment

#### Verification

Check your CORS configuration before deployment:

```bash
# Verify the config is loaded correctly
node -e "require('dotenv').config(); console.log('ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS)"

# Test with production-like environment
LIVE_TRADING=true COMPLIANCE_ACCEPTED=true ALLOWED_ORIGINS=* npm run dev
# Should fail with: "CRITICAL SECURITY ERROR: Wildcard CORS (*) is not allowed in production"

# Test with proper configuration
LIVE_TRADING=true COMPLIANCE_ACCEPTED=true ALLOWED_ORIGINS=https://dashboard.example.com npm run dev
# Should start successfully
```

#### Deployment Checklist

- [ ] Set `ALLOWED_ORIGINS` to specific domain(s) in production `.env`
- [ ] Remove wildcard `*` from production configuration
- [ ] Update firewall rules to match allowed origins
- [ ] Test CORS headers with `curl`:
  ```bash
  # Should reflect the origin back
  curl -H "Origin: https://dashboard.example.com" \
       -I http://localhost:3000/health
  
  # Should NOT have CORS origin header
  curl -H "Origin: https://malicious.com" \
       -I http://localhost:3000/health
  ```
- [ ] Document all allowed origins in deployment notes
- [ ] Update load balancer/reverse proxy CORS settings if applicable

#### Troubleshooting CORS Issues

**Issue:** "CRITICAL SECURITY ERROR: Wildcard CORS (*) is not allowed in production"
- **Cause:** `ALLOWED_ORIGINS=*` with `LIVE_TRADING=true` or `NODE_ENV=production`
- **Fix:** Set `ALLOWED_ORIGINS` to specific domain(s)

**Issue:** Frontend can't connect to API
- **Cause:** Frontend origin not in `ALLOWED_ORIGINS`
- **Fix:** Add frontend domain to `ALLOWED_ORIGINS`, e.g., `ALLOWED_ORIGINS=https://dashboard.example.com`

**Issue:** API works from curl/Postman but not from browser
- **Cause:** Browser enforces CORS, curl/Postman don't
- **Fix:** Ensure frontend origin is in `ALLOWED_ORIGINS`

## Startup

1. **Environment prep**
   - Set `LIVE_TRADING=true` and `COMPLIANCE_ACCEPTED=true`
   - Export wallet private key via secure secret manager
   - Verify CHAIN_ID matches network (137 for Polygon Mainnet)
   - Confirm no secrets in plaintext files (.env should be .gitignored)
   - Verify system clock sync (NTP)

2. **Dependency checks**
   - Ensure network connectivity to Polygon RPC endpoints
   - Verify Polymarket API endpoints are reachable
   - Test wallet can sign transactions on Polygon
   - Confirm sufficient USDC balance in wallet

3. **Launch sequence**
   ```bash
   # Start backend server
   npm run dev
   
   # Verify startup logs show:
   # - "Trading client initialized" with wallet address
   # - "Starting reconciliation"
   # - "Reconciliation complete" with counts
   # - "Server listening"
   ```

4. **Verify initialization**
   ```bash
   # Check trading status
   curl http://localhost:3000/status
   
   # Should show:
   # - liveTrading: true
   # - tradingClientInitialized: true
   # - walletAddress: 0x...
   # - marketFeedConnected: true
   ```

5. **State reconciliation (automatic)**
   - Trading client fetches all open orders from CLOB
   - Fetches wallet balance and allowances
   - Recalculates positions from order history
   - Logs reconciliation summary

6. **Market data connection**
   - WebSocket connects to market feed
   - Subscribes to TOKEN_IDS if configured
   - Begins caching orderbook snapshots
   - Verify with: `curl http://localhost:3000/feed/status`

7. **Dashboard access**
   ```bash
   # In separate terminal
   cd apps/frontend
   npm run dev
   
   # Open browser to http://localhost:8080
   # Verify dashboard shows:
   # - "LIVE TRADING" badge (green)
   # - Wallet address
   # - Current balances
   # - Any existing orders/positions
   ```

## Health Checks

### API Endpoints
```bash
# System health
curl http://localhost:3000/health
# Expected: { status: "ok", uptime: ... }

# Trading status
curl http://localhost:3000/status
# Expected: { liveTrading: true, tradingClientInitialized: true, walletAddress: "0x...", ... }

# Market feed status
curl http://localhost:3000/feed/status
# Expected: { connected: true, tokenIds: [...], cachedOrderbooks: N }

# Trading state
curl http://localhost:3000/state
# Expected: { orders: [...], fills: [...], positions: [...], balances: [...] }

# Cached orderbooks
curl http://localhost:3000/orderbooks
# Expected: [ { tokenId, market, summary: { bestBid, bestAsk, mid, spread } }, ... ]
```

### Verification Checklist
- ✅ **Connectivity:** All API endpoints respond within 2s
- ✅ **WebSocket:** Market feed connected (feed/status shows connected: true)
- ✅ **Wallet:** Trading status shows correct wallet address
- ✅ **Reconciliation:** State endpoint returns current orders/positions
- ✅ **Dashboard:** Web UI loads and displays live data
- ✅ **Order flow:** Can place test order (if applicable)
- ✅ **State integrity:** Open orders match CLOB API, positions calculate correctly

## Shutdown (Graceful)

The server implements graceful shutdown on SIGTERM/SIGINT:

```bash
# Send shutdown signal (Ctrl+C or kill command)
kill -SIGTERM <pid>
```

**Automatic shutdown sequence:**
1. Server receives SIGTERM/SIGINT signal
2. If live trading enabled and client initialized:
   - Cancels all open orders
   - Waits for cancellations to complete
3. Closes WebSocket connections
4. Stops HTTP server
5. Logs "Server stopped" and exits

**Manual shutdown:**
```bash
# Trigger via Ctrl+C in terminal
# Or send signal:
kill -SIGTERM $(pgrep -f "npm run dev")
```

## Kill Switch (Emergency)

Immediately cancel all open orders and disable trading. **The kill switch state is persisted to disk and will remain active across process restarts.**

### Via Dashboard
1. Open dashboard at http://localhost:8080
2. Scroll to bottom "Emergency Kill Switch" section
3. Click red "CANCEL ALL ORDERS" button
4. Confirm action in popup
5. All open orders will be cancelled immediately

### Via API (Authenticated)
```bash
# Requires ADMIN_TOKEN to be set in environment
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" http://localhost:3000/kill
```

**Response:**
```json
{
  "success": true,
  "message": "Kill switch activated: all orders cancelled, trading disabled",
  "riskManager": {
    "killed": true,
    "recentErrors": 0,
    "circuitBreakerTripped": false
  }
}
```

### Via API (Legacy - Unauthenticated)
```bash
# Deprecated: Use authenticated /kill endpoint instead
curl -X POST http://localhost:3000/kill-switch
```

**When to use:**
- Sudden adverse market movement
- Strategy malfunction detected
- System anomaly or unexpected behavior
- Need to immediately stop all trading activity
- Risk limit breach

**Post kill-switch:**
1. **IMPORTANT:** Kill switch state is persistent - it will remain active even after process restart
2. Review logs for root cause: `grep -i "kill" logs/app.log`
3. Check final positions in dashboard
4. Reconcile state: `curl http://localhost:3000/state`
5. Fix issue before resuming trading
6. To resume trading after kill switch:
   - Delete state file: `rm apps/backend/.state/kill-switch.json`
   - Restart the server
   - **Note:** Deleting the state file will disable the kill switch on restart, allowing trading to resume (unless another issue triggers the kill switch again)

**Kill Switch State File:**
- Location: `apps/backend/.state/kill-switch.json`
- Format: JSON with `killed`, `timestamp`, and optional `reason` fields
- The `.state/` directory is automatically created on first use
- This directory is excluded from git via `.gitignore`
- State file behavior on startup:
  - If the file doesn't exist, trading is enabled on startup.
  - If the file exists with `killed: false`, trading is enabled on startup.
  - If the file exists with `killed: true`, trading remains disabled on startup.
- **Validation:** State file structure is validated using Zod schema. Invalid structure triggers fail-closed behavior (kill switch active).

## Incident Response
### WebSocket Disconnects
1. Pause trading.
2. Attempt reconnect with exponential backoff.
3. On reconnection, resync order books via REST.
4. If reconnect fails > N attempts, alert and keep trading disabled.

### API Error Spike
1. Detect elevated 4xx/5xx error rates.
2. Pause order placements and enter cooldown.
3. Retry with backoff; if persistent, alert operator.

### Sudden PnL Drawdown
1. Trigger circuit breaker if loss exceeds threshold.
2. Cancel open orders and stop trading.
3. Notify operator and require manual clearance before resuming.

### Market Volatility Spike
1. Cancel orders in affected market(s).
2. Pause quoting until volatility stabilizes.
3. Resume with wider spreads after cooldown.

### Data Corruption or State Mismatch
1. Stop trading and enter safe mode.
2. Reconcile state from API + persisted records.
3. If mismatch persists, alert operator and keep trading disabled.

## Alerts and Escalation
- **Sev-1:** Loss limit breached, kill switch triggered, or reconciliation failed.
- **Sev-2:** WS instability > N events/hour, API error rate above threshold.
- **Sev-3:** Minor retries, degraded performance.

Escalation target(s): TBD (Slack/Discord/Telegram).

## Monitoring and Alerting

### Observability Endpoints

The bot exposes several endpoints for monitoring and health checks:

#### Health Endpoint (Liveness)
```bash
curl http://localhost:3000/health
```

**Purpose**: Check if application is running and responsive (liveness probe).

**Response**: The top-level `status` field will be one of `"ok"`, `"degraded"`, or `"unhealthy"`.

```json
{
  "status": "ok",
  "timestamp": "2026-02-01T08:00:00.000Z",
  "liveTradingEnabled": false,
  "uptime": 123456,
  "checks": {
    "memory": {
      "status": "ok",
      "message": "128MB / 256MB used",
      "details": {
        "heapUsed": 128,
        "heapTotal": 256,
        "utilization": 50
      }
    },
    "uptime": {
      "status": "ok",
      "message": "123s",
      "details": {
        "uptimeMs": 123456,
        "startTime": "2026-02-01T07:58:00.000Z"
      }
    }
  }
}
```

**Status Codes**:
- `200 OK`: Endpoint is reachable. Application health is indicated by the JSON `status` field:
  - `ok`: Application is healthy
  - `degraded`: Application is experiencing partial issues but is still running
  - `unhealthy`: Application is unhealthy (investigation required)

**Use for**: Kubernetes liveness probe, basic health monitoring

---

#### Readiness Endpoint (Readiness)
```bash
curl http://localhost:3000/ready
```

**Purpose**: Check if application is ready to accept traffic (readiness probe).

**Response**:
```json
{
  "ready": true,
  "timestamp": "2026-02-01T08:00:00.000Z",
  "checks": {
    "marketFeed": {
      "ready": true,
      "message": "Market feed WebSocket connected"
    },
    "tradingClient": {
      "ready": true,
      "message": "Trading client initialized"
    },
    "circuitBreaker_clob-api": {
      "ready": true,
      "message": "Circuit breaker closed"
    }
  }
}
```

**Status Codes**:
- `200 OK`: Application is ready
- `503 Service Unavailable`: Application is not ready (check `checks` for details)

**Use for**: Kubernetes readiness probe, load balancer health check

---

#### Metrics Endpoint
```bash
curl http://localhost:3000/metrics
```

**Purpose**: Expose operational metrics for monitoring systems.

**Response**:
```json
{
  "timestamp": "2026-02-01T08:00:00.000Z",
  "uptime": 123.456,
  "memory": {
    "heapUsed": 128,
    "heapTotal": 256,
    "rss": 300
  },
  "trading": {
    "liveTrading": false,
    "initialized": true
  },
  "marketFeed": {
    "connected": true,
    "cachedOrderbooks": 5,
    "tokenIds": 5
  },
  "circuitBreakers": [
    {
      "name": "clob-api",
      "state": "closed",
      "failures": 2,
      "successes": 150,
      "consecutiveFailures": 0,
      "consecutiveSuccesses": 10,
      "lastFailureTime": 1769934415000,
      "lastSuccessTime": 1769934525000,
      "totalRequests": 152
    }
  ]
}
```

**Use for**: Prometheus scraping, Datadog, custom monitoring dashboards

---

### Key Metrics to Monitor

#### System Health Metrics
```bash
# CPU and Memory
curl http://localhost:3000/health

# Expected healthy values:
# - memory.used < memory.total * 0.8 (80%)
# - uptime > 0 and steadily increasing
# - status: "ok"
```

#### Trading Metrics
```bash
# Active orders count
curl http://localhost:3000/orders | jq 'length'

# Expected: Should be within RISK_MAX_OPEN_ORDERS limit

# Position exposure
curl http://localhost:3000/state | jq '.positions[] | {tokenId, size, marketValue}'

# Expected: Each position marketValue < RISK_MAX_EXPOSURE_PER_MARKET

# PnL status
curl http://localhost:3000/state | jq '.pnl'

# Expected: drawdown < RISK_MAX_DRAWDOWN
```

#### Connection Health
```bash
# Market feed status
curl http://localhost:3000/feed/status

# Expected:
# - connected: true
# - cachedOrderbooks: > 0
# - subscriptions array not empty
```

### Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Memory Usage | > 70% | > 85% | Restart server, investigate leak |
| Circuit Breaker State | half-open | open | Check service health, review errors |
| Circuit Breaker Failures | > 3 in 5min | > 10 in 5min | Investigate root cause, check service |
| Open Orders | > 80% of max | > 95% of max | Review strategy, cancel old orders |
| Drawdown | > 15% | > 18% | Pause trading, review positions |
| Error Rate | > 5% | > 8% | Investigate errors, check API status |
| WS Disconnects | > 3/hour | > 5/hour | Check network, API status |
| Order Rejections | > 10% | > 20% | Review risk parameters |
| API Response Time | > 2s | > 5s | Check API health, reduce load |
| Readiness Check | failing 1-2 checks | failing 3+ checks | Fix dependencies, check connectivity |

**Additional Circuit Breaker Alerts**:
- **Circuit opens**: Immediate Sev-2 alert, investigate service failure
- **Circuit stays open > 5min**: Escalate to Sev-1, manual intervention required
- **Circuit flapping** (open/close cycles): Investigate intermittent issues, adjust thresholds

### Log Monitoring

**Critical logs to watch:**
```bash
# Follow logs in real-time
npm run dev | grep -E "(ERROR|WARN|kill|circuit|reconciliation)"

# Error patterns to alert on:
# - "ERROR" - Any error log
# - "WebSocket disconnected" - Connection issues
# - "Reconciliation failed" - State mismatch
# - "Kill switch activated" - Emergency stop
# - "Circuit breaker triggered" - Risk limit breach
# - "Order rejected" - Risk check failure
```

**Log aggregation setup:**
```bash
# Export logs to file for analysis
npm run dev 2>&1 | tee -a logs/bot-$(date +%Y%m%d).log

# Rotate logs daily (add to crontab)
0 0 * * * find logs/ -name "bot-*.log" -mtime +30 -delete
```

## Troubleshooting Guide

### Issue: Bot won't start

**Symptoms:**
- Process exits immediately
- "Invalid configuration" error
- Missing environment variables

**Diagnosis:**
```bash
# Check configuration
npm run dev

# Look for config errors in output
# Common issues:
# - Missing LIVE_TRADING or COMPLIANCE_ACCEPTED
# - Invalid PRIVATE_KEY format
# - Missing required env vars
```

**Resolution:**
1. Verify `.env` file exists and is readable
2. Check all required variables are set (see `.env.example`)
3. Validate PRIVATE_KEY format: must start with `0x`
4. Ensure CHAIN_ID is 137 (mainnet) or 80002 (testnet)
5. Check file permissions: `chmod 600 .env`

### Issue: WebSocket keeps disconnecting

**Symptoms:**
- Frequent "WebSocket disconnected" logs
- "Reconnecting in..." messages
- Orderbook cache frequently cleared

**Diagnosis:**
```bash
# Check connection status
curl http://localhost:3000/feed/status

# Monitor reconnection frequency
npm run dev | grep -c "WebSocket disconnected"

# Test WebSocket endpoint directly
wscat -c wss://ws-subscriptions-clob.polymarket.com/ws/market
```

**Resolution:**
1. **Network issues:** Check firewall, proxy settings
2. **API rate limiting:** Reduce subscription count in TOKEN_IDS
3. **Server overload:** Check Polymarket status page
4. **Invalid subscriptions:** Verify TOKEN_IDS are valid, active markets
5. **Increase reconnect delays:** Adjust backoff parameters if needed

### Issue: Orders not being placed

**Symptoms:**
- Strategy generates signals but no orders submitted
- "Order rejected" logs
- Kill switch status shows active

**Diagnosis:**
```bash
# Check trading status
curl http://localhost:3000/status

# Expected: liveTrading: true, tradingClientInitialized: true

# Check risk manager state
curl http://localhost:3000/state | jq '{
  orders: .orders | length,
  exposure: .positions | map(.marketValue) | add,
  pnl: .pnl,
  balance: .balances
}'
```

**Resolution:**

1. **Emergency stop active:**
   ```bash
   # Check trading status
   curl http://localhost:3000/status
   
   # Kill switch state is persisted to disk
   # To resume trading:
   # 1. Fix the issue that triggered the kill switch
   # 2. Remove the state file: rm apps/backend/.state/kill-switch.json
   # 3. Restart the server
   # WARNING: Kill switch will remain active across restarts until manually cleared
   ```

2. **Risk limits breached:**
   - Check exposure < RISK_MAX_EXPOSURE_PER_MARKET
   - Check open orders < RISK_MAX_OPEN_ORDERS  
   - Check drawdown < RISK_MAX_DRAWDOWN
   - Adjust limits in `.env` if too restrictive

3. **Insufficient balance:**
   ```bash
   # Check USDC balance
   curl http://localhost:3000/state | jq '.balances'
   
   # Fund wallet if balance too low
   ```

4. **Live trading not enabled:**
   ```bash
   # Verify both flags are set
   grep -E "LIVE_TRADING|COMPLIANCE_ACCEPTED" .env
   
   # Both must be true for live trading
   ```

### Issue: State reconciliation fails

**Symptoms:**
- "Reconciliation failed" error on startup
- Mismatched order counts
- Incorrect position sizes

**Diagnosis:**
```bash
# Check local vs remote state
curl http://localhost:3000/state > local_state.json

# Compare with CLOB API (requires auth)
# Check for:
# - Orders in local state but not on exchange
# - Orders on exchange but not in local state
# - Position size mismatches
```

**Resolution:**
1. **Stale local state:** Restart server to force fresh reconciliation
2. **Network timeout:** Increase reconciliation timeout
3. **API errors:** Check CLOB API status and credentials
4. **State corruption:** If persistent, clear state and restart
   ```bash
   # Restart will fetch fresh state from exchange
   npm run dev
   ```

### Issue: High error rate

**Symptoms:**
- Circuit breaker triggers
- Error rate > 10%
- Frequent API failures

**Diagnosis:**
```bash
# Check recent errors
npm run dev | grep ERROR | tail -50

# Common error patterns:
# - 429 Too Many Requests - Rate limited
# - 401 Unauthorized - Invalid credentials
# - 500 Internal Server Error - API down
# - ECONNRESET - Connection issues
```

**Resolution:**

1. **Rate limiting (429 errors):**
   - Reduce order submission frequency
   - Increase retry delays
   - Check API rate limits: https://docs.polymarket.com/quickstart/introduction/rate-limits

2. **Authentication errors (401):**
   - Verify PRIVATE_KEY is correct
   - Check CHAIN_ID matches network
   - Regenerate API credentials if needed

3. **API downtime (500 errors):**
   - Check Polymarket status page
   - Enable circuit breaker to pause during outage
   - Monitor and retry when service recovers

4. **Network issues (ECONNRESET):**
   - Check internet connectivity
   - Verify firewall rules
   - Test with curl: `curl https://clob.polymarket.com`

### Issue: Circuit breaker opened

**Symptoms:**
- Logs show "Circuit breaker opened"
- Requests failing with "Circuit breaker is open" message
- Service degraded or unavailable

**Diagnosis:**
```bash
# Check circuit breaker status via metrics endpoint
curl http://localhost:3000/metrics | jq '.circuitBreakers'

# Example output:
# [{
#   "name": "clob-api",
#   "state": "open",
#   "failures": 5,
#   "consecutiveFailures": 5,
#   "lastFailureTime": 1234567890
# }]

# Check recent error logs
npm run dev | grep "Circuit breaker" | tail -20
```

**Resolution:**

1. **Identify root cause:**
   - Check service availability: `curl https://clob.polymarket.com`
   - Review error logs for failure patterns
   - Check if issue is network, auth, or service-side

2. **For transient issues (network, temporary outage):**
   ```bash
   # Wait for circuit breaker to automatically transition to half-open
   # Default reset timeout: 60 seconds
   # Monitor logs for "Circuit breaker half-open" message
   
   # Check circuit breaker status
   curl http://localhost:3000/metrics | jq '.circuitBreakers[].state'
   ```

3. **For persistent issues:**
   - Fix underlying problem (network, credentials, service outage)
   - Circuit breaker will automatically recover when service is healthy
   - If needed, restart bot to force fresh state

4. **Manual recovery (use with caution):**
   - Circuit breaker will auto-recover when service is healthy
   - No manual intervention needed in most cases
   - For testing only: call internal reset method (requires code access)

**Circuit Breaker States:**
- **closed**: Normal operation, requests pass through
- **open**: Service failing, requests rejected immediately (protecting from cascade failures)
- **half_open**: Testing if service recovered, allowing limited requests

**Prevention:**
- Ensure proper error handling in all API calls
- Monitor error rates and set up alerts
- Use retry logic with appropriate backoff
- Review and adjust circuit breaker thresholds if too sensitive

**See also:**
- [Error Taxonomy](./error-taxonomy.md) - Error classification and handling strategies
- Circuit breaker metrics: `GET /metrics` endpoint

### Issue: Incorrect PnL calculations

**Symptoms:**
- Unrealized PnL doesn't match expectations
- Realized PnL incorrect after closing position
- Balance doesn't add up

**Diagnosis:**
```bash
# Get detailed PnL breakdown
curl http://localhost:3000/state | jq '{
  pnl: .pnl,
  positions: .positions,
  fills: .fills | length,
  balance: .balances
}'

# Cross-check with exchange
# For paper trading, verify:
# - Slippage applied correctly (default 1%)
# - Fees deducted correctly (default 0.2%)
# - Position averaging calculated correctly
```

**Resolution:**
1. **Paper trading:** Check PAPER_TRADING_SLIPPAGE and PAPER_TRADING_FEE_RATE
2. **Missing fills:** Force reconciliation by restarting
3. **Stale prices:** Ensure orderbook updates are flowing
4. **Rounding errors:** Check decimal precision in calculations

### Issue: Dashboard not loading

**Symptoms:**
- Frontend shows blank page
- Connection refused on port 8080
- API calls timing out

**Diagnosis:**
```bash
# Check if frontend is running
curl http://localhost:8080

# Check if backend API is accessible
curl http://localhost:3000/health

# Check ports in use
lsof -i :3000
lsof -i :8080
```

**Resolution:**
1. **Frontend not started:**
   ```bash
   cd apps/frontend
   npm install
   npm run dev
   ```

2. **Port conflict:**
   - Change PORT in .env (backend)
   - Change port in frontend config

3. **CORS issues:**
   - Backend may need CORS headers for frontend
   - Check browser console for errors

4. **API timeout:**
   - Verify backend is healthy: `curl http://localhost:3000/health`
   - Check firewall rules

## Routine Maintenance

### Daily Checks
```bash
# Morning routine (5 minutes)
1. Check system health
   curl http://localhost:3000/health

2. Review overnight PnL
   curl http://localhost:3000/state | jq '.pnl'

3. Check error logs
   grep ERROR logs/bot-$(date +%Y%m%d).log | wc -l

4. Verify open positions
   curl http://localhost:3000/state | jq '.positions'

5. Check market feed status
   curl http://localhost:3000/feed/status

# Daily metrics to record:
# - Total PnL (realized + unrealized)
# - Number of trades
# - Error count
# - Uptime percentage
# - Max drawdown
```

### Weekly Reviews
```bash
# Weekly review (30 minutes)
1. Analyze strategy performance
   - Win rate
   - Average trade size
   - Best/worst trades
   - Market conditions

2. Review risk parameters
   - Are limits appropriate?
   - Any breaches this week?
   - Adjust if needed

3. Check compliance
   - LIVE_TRADING and COMPLIANCE_ACCEPTED still correct
   - No secret leaks in logs
   - Wallet security intact

4. Update market list
   - Remove inactive markets from TOKEN_IDS
   - Add new opportunities
   - Check liquidity

5. System updates
   - Check for npm package updates
   - Review changelog
   - Plan upgrade window
```

### Monthly Maintenance
```bash
# Monthly maintenance (2 hours)
1. Full incident review
   - Document all issues encountered
   - Update runbook with solutions
   - Identify patterns

2. Performance optimization
   - Analyze bottlenecks
   - Optimize queries
   - Review caching strategy

3. Security audit
   - Rotate credentials if needed
   - Review access logs
   - Check for vulnerabilities

4. Backup verification
   - Test backup restoration
   - Verify data integrity
   - Update backup procedures

5. Documentation updates
   - Update runbook
   - Record lessons learned
   - Update architecture docs
```

## Backup and Recovery

### State Backup
```bash
# Manual backup of current state
curl http://localhost:3000/state > backup/state-$(date +%Y%m%d-%H%M%S).json

# Automated daily backup (add to crontab)
0 2 * * * curl http://localhost:3000/state > /path/to/backup/state-$(date +%Y%m%d).json
```

### Configuration Backup
```bash
# Backup .env file (exclude secrets)
grep -v "PRIVATE_KEY" .env > backup/config-$(date +%Y%m%d).env.template

# Full backup including secrets (encrypted)
gpg -c .env > backup/env-$(date +%Y%m%d).env.gpg
```

### Log Retention
```bash
# Archive logs older than 30 days
find logs/ -name "bot-*.log" -mtime +30 -exec gzip {} \;

# Move to archive storage
mv logs/*.gz /path/to/archive/

# Delete very old archives (> 90 days)
find /path/to/archive/ -name "bot-*.log.gz" -mtime +90 -delete
```

### Recovery Procedure
```bash
# 1. Stop the bot
npm run dev  # Ctrl+C or kill switch

# 2. Restore from backup
cp backup/env-YYYYMMDD.env.gpg .env.gpg
gpg -d .env.gpg > .env
chmod 600 .env

# 3. Verify configuration
grep -E "LIVE_TRADING|COMPLIANCE_ACCEPTED|PRIVATE_KEY" .env

# 4. Start in paper mode first
sed -i.bak 's/LIVE_TRADING=true/LIVE_TRADING=false/' .env && rm -f .env.bak
npm run dev

# 5. Verify health
curl http://localhost:3000/health

# 6. Re-enable live trading if all checks pass
sed -i.bak 's/LIVE_TRADING=false/LIVE_TRADING=true/' .env && rm -f .env.bak
# Restart: Ctrl+C, then npm run dev
```

## Rollback Procedure

### Version Rollback
```bash
# 1. Stop the bot gracefully
# Use Ctrl+C or send SIGTERM to the process

# 2. Checkout previous version
git log --oneline  # Find last good commit
git checkout <commit-hash>

# 3. Reinstall dependencies
npm install

# 4. Start in paper mode for validation
sed -i.bak 's/LIVE_TRADING=true/LIVE_TRADING=false/' .env && rm -f .env.bak
npm run dev

# 5. Run smoke tests
npm test
curl http://localhost:3000/health

# 6. If tests pass, re-enable live trading
# Edit .env: LIVE_TRADING=true
npm run dev
```

### Emergency Rollback (Production Down)
```bash
# Ultra-fast rollback when production is broken

# 1. Kill switch + shutdown
curl -X POST http://localhost:3000/kill-switch
pkill -f "npm run dev"

# 2. Quick checkout to last stable
git checkout main  # or last known good tag
npm install --prefer-offline

# 3. Start immediately (assumes .env is still valid)
npm run dev &

# 4. Verify it's working
sleep 10
curl http://localhost:3000/health

# 5. Monitor logs closely
tail -f logs/bot-$(date +%Y%m%d).log
```
