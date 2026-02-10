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

## Deployment Options

### Docker Deployment (Recommended)

For production deployments, we recommend using Docker for consistency and reliability:

```bash
# Quick start with Docker Compose
docker-compose up -d

# Or production single container
docker run -d --name polymarket-bot \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  polymarket-bot:latest
```

**See [Docker Deployment Guide](./docker.md) for:**
- Complete Docker setup and configuration
- Production deployment best practices
- Container security hardening
- Health checks and monitoring
- CI/CD integration
- Troubleshooting guide

### Native Deployment

For development or when Docker is not available, see the sections below.

## Prerequisites

### Private Key Security

**CRITICAL:** Follow the [Security Guide](./security.md) for private key management.

This addresses **Audit Finding A-001** - Plaintext Private Key Storage.

Choose a security method appropriate for your environment:
- **Development:** Environment variable (least secure)
- **Staging:** Encrypted local storage
- **Production:** AWS Secrets Manager / HashiCorp Vault / Azure Key Vault

See [docs/security.md](./security.md) and [ADR-0005](./adr/0005-secrets-management.md) for detailed setup instructions.

### Required Environment Variables
```bash
# Trading gates (BOTH required for live trading)
LIVE_TRADING=true
COMPLIANCE_ACCEPTED=true

# Secret Management (Choose one method - see docs/security.md)
# Method 1 (Development): Direct environment variable
SECRET_SOURCE=env
PRIVATE_KEY=0x...your_private_key

# Method 2 (Improved): Encrypted local storage
SECRET_SOURCE=encrypted
ENCRYPTION_KEY=your_strong_passphrase
ENCRYPTED_PRIVATE_KEY=salt:iv:authTag:encryptedData

# Method 3 (Production): AWS/Vault/Azure KMS
SECRET_SOURCE=aws  # or vault, azure
AWS_SECRET_NAME=polymarket-bot/private-key
AWS_REGION=us-east-1

# Wallet configuration
CHAIN_ID=137  # Polygon Mainnet

# API endpoints (defaults are fine for production)
CLOB_API_URL=https://clob.polymarket.com
GAMMA_API_URL=https://gamma-api.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Monitoring
TOKEN_IDS=comma,separated,token,ids
PORT=3000
LOG_LEVEL=info

# Reconciliation (Gap RE-001)
RECONCILIATION_INTERVAL_SECONDS=300  # 5 minutes (default)
```

### Fee-enabled markets (Research §1.4)

Most Polymarket markets have **0% fees**. Some (e.g. 15-minute crypto markets) are fee-enabled: the CLOB returns `GET /fee-rate?token_id={id}` as `feeRateBps`. Order payloads must include `feeRateBps` (Research §1.2). The backend fetches fee rate per token (cached 5 min) for every live order and batch order and passes it into the order payload. See [archive/RESEARCH_VS_REPO_COMPARISON.md](../archive/RESEARCH_VS_REPO_COMPARISON.md) and Research §1.4, §12.1.

### Cancel policy, bucket_index, resolution (Research §5.2)

- **Cancel policy:** Use wider cancel thresholds to avoid excessive gas; aggressive cancel/replace can waste ~95% of gas (Research §4.1, §5.2 #4).
- **Multi-part trades:** Group orders by `bucket_index` where applicable; not grouping can cause incorrect matching (Research §5.2 #8).
- **Resolution delays:** Do not assume instant redemption; allow for challenge window and possible UMA disputes (Research §5.2 #9). See [UMA resolution and redemption](#uma-resolution-and-redemption-research-16) below.

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

3. **Startup compliance checks (Research §9.1, §10.1)**  
   The server runs these automatically at startup; configure via env vars (see [ENV_VARIABLE_REFERENCE.md](./ENV_VARIABLE_REFERENCE.md)):
   - **MIN_BALANCE_USDC**: If `LIVE_TRADING=true` and wallet USDC &lt; this value, the process **exits** (set to `0` to disable). Ensures you do not trade with insufficient funds.
   - **Ban-status**: On startup the server calls GET /ban-status. If `cert_required: true`, it logs and may send a Telegram alert; if `BAN_STATUS_EXIT_IF_CERT_REQUIRED=true`, the process exits. The check repeats every `BAN_STATUS_CHECK_INTERVAL_MS` (default 24h).
   - **Heartbeat**: If `HEARTBEAT_URL` is set (e.g. a healthchecks.io URL), the server sends a GET request every 1 minute. If the bot stops, your monitoring service can alert after ~5 minutes of missed pings.

4. **Launch sequence**
   ```bash
   # Start backend server
   npm run dev
   
   # Verify startup logs show:
   # - "Trading client initialized" with wallet address
   # - Ban-status check result (if enabled)
   # - Balance check passed or exit if below MIN_BALANCE_USDC
   # - "Starting reconciliation"
   # - "Reconciliation complete" with counts
   # - "Server listening"
   ```

5. **Verify initialization**
   ```bash
   # Check trading status
   curl http://localhost:3000/status
   
   # Should show:
   # - liveTrading: true
   # - tradingClientInitialized: true
   # - walletAddress: 0x...
   # - marketFeedConnected: true
   ```

6. **State reconciliation (automatic)**
   - Trading client fetches all open orders from CLOB
   - Fetches wallet balance and allowances
   - Recalculates positions from order history
   - Logs reconciliation summary

7. **Market data connection**
   - WebSocket connects to market feed
   - Subscribes to TOKEN_IDS if configured
   - Begins caching orderbook snapshots
   - Verify with: `curl http://localhost:3000/feed/status`

8. **Dashboard access**
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

### Health Check Procedures

**Frequency:** Every 5 minutes (automated) or on-demand

**Health Check Script:**
```bash
#!/bin/bash
# File: scripts/health-check.sh
# Run this script every 5 minutes via cron or monitoring system

set -euo pipefail

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track issues
ISSUES=0

# Function to send alert
send_alert() {
    local message="$1"
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"🚨 Health Check Alert: $message\"}" \
            2>/dev/null || true
    fi
    echo -e "${RED}ALERT: $message${NC}"
}

# Function to check endpoint
check_endpoint() {
    local endpoint="$1"
    local expected_code="${2:-200}"
    local timeout="${3:-5}"
    
    local code=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time "$timeout" \
        "$API_URL$endpoint" 2>/dev/null || echo "000")
    
    if [ "$code" = "$expected_code" ]; then
        echo -e "${GREEN}✅ $endpoint: $code${NC}"
        return 0
    else
        echo -e "${RED}❌ $endpoint: expected $expected_code, got $code${NC}"
        ISSUES=$((ISSUES + 1))
        return 1
    fi
}

echo "=== Polymarket Bot Health Check ==="
echo "Time: $(date)"
echo "API URL: $API_URL"
echo ""

# 1. Basic connectivity
echo "1. Checking API connectivity..."
if check_endpoint "/health" 200 5; then
    HEALTH_JSON=$(curl -s "$API_URL/health" 2>/dev/null)
    STATUS=$(echo "$HEALTH_JSON" | jq -r '.status // "unknown"')
    
    if [ "$STATUS" = "ok" ]; then
        echo -e "${GREEN}   Status: OK${NC}"
    elif [ "$STATUS" = "degraded" ]; then
        echo -e "${YELLOW}   Status: DEGRADED${NC}"
        send_alert "System is degraded"
        ISSUES=$((ISSUES + 1))
    else
        echo -e "${RED}   Status: UNHEALTHY${NC}"
        send_alert "System is unhealthy: $STATUS"
        ISSUES=$((ISSUES + 1))
    fi
else
    send_alert "Health endpoint unreachable"
fi

# 2. Readiness check
echo ""
echo "2. Checking system readiness..."
READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 5 "$API_URL/ready" 2>/dev/null || echo "000")

if [ "$READY_CODE" = "200" ]; then
    echo -e "${GREEN}✅ System is ready${NC}"
    READY_JSON=$(curl -s "$API_URL/ready" 2>/dev/null)
    
    # Check individual readiness components
    MARKET_FEED=$(echo "$READY_JSON" | jq -r '.checks.marketFeed.ready // false')
    TRADING_CLIENT=$(echo "$READY_JSON" | jq -r '.checks.tradingClient.ready // false')
    
    if [ "$MARKET_FEED" != "true" ]; then
        echo -e "${YELLOW}   ⚠️  Market feed not ready${NC}"
        send_alert "Market feed not ready"
        ISSUES=$((ISSUES + 1))
    fi
    
    if [ "$TRADING_CLIENT" != "true" ]; then
        echo -e "${YELLOW}   ⚠️  Trading client not ready${NC}"
    fi
else
    echo -e "${RED}❌ System not ready (HTTP $READY_CODE)${NC}"
    send_alert "System not ready: HTTP $READY_CODE"
    ISSUES=$((ISSUES + 1))
fi

# 3. Check trading status
echo ""
echo "3. Checking trading status..."
if [ -n "$ADMIN_TOKEN" ]; then
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 5 \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$API_URL/status" 2>/dev/null || echo "000")
    
    if [ "$STATUS_CODE" = "200" ]; then
        echo -e "${GREEN}✅ Status endpoint accessible${NC}"
        STATUS_JSON=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/status" 2>/dev/null)
    
    LIVE_TRADING=$(echo "$STATUS_JSON" | jq -r '.liveTrading // false')
    TRADING_INIT=$(echo "$STATUS_JSON" | jq -r '.tradingClientInitialized // false')
    MARKET_FEED_CONNECTED=$(echo "$STATUS_JSON" | jq -r '.marketFeedConnected // false')
    
    echo "   Live Trading: $LIVE_TRADING"
    echo "   Trading Client Initialized: $TRADING_INIT"
    echo "   Market Feed Connected: $MARKET_FEED_CONNECTED"
    
    if [ "$LIVE_TRADING" = "true" ] && [ "$TRADING_INIT" != "true" ]; then
        echo -e "${RED}   ⚠️  Live trading enabled but client not initialized${NC}"
        send_alert "Trading client not initialized despite live trading mode"
        ISSUES=$((ISSUES + 1))
    fi
    
    if [ "$MARKET_FEED_CONNECTED" != "true" ]; then
        echo -e "${YELLOW}   ⚠️  Market feed disconnected${NC}"
        send_alert "Market feed disconnected"
        ISSUES=$((ISSUES + 1))
    fi
fi

# 4. Check circuit breakers (from /status endpoint which includes them)
echo ""
echo "4. Checking circuit breakers..."
if [ -n "$ADMIN_TOKEN" ]; then
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 5 \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$API_URL/status" 2>/dev/null || echo "000")
    
    if [ "$STATUS_CODE" = "200" ]; then
        STATUS_JSON=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/status" 2>/dev/null)
        CB_COUNT=$(echo "$STATUS_JSON" | jq '.circuitBreakers | length')
        
        if [ "$CB_COUNT" -gt 0" ]; then
            echo "   Found $CB_COUNT circuit breaker(s)"
            
            # Check each circuit breaker
            echo "$STATUS_JSON" | jq -c '.circuitBreakers[]' | while read -r cb; do
            NAME=$(echo "$cb" | jq -r '.name')
            STATE=$(echo "$cb" | jq -r '.state')
            FAILURES=$(echo "$cb" | jq -r '.failures')
            
            if [ "$STATE" = "open" ]; then
                echo -e "${RED}   ❌ $NAME: OPEN (failures: $FAILURES)${NC}"
                send_alert "Circuit breaker $NAME is OPEN"
                ISSUES=$((ISSUES + 1))
            elif [ "$STATE" = "half_open" ]; then
                echo -e "${YELLOW}   ⚠️  $NAME: HALF-OPEN (recovering)${NC}"
            else
                echo -e "${GREEN}   ✅ $NAME: CLOSED${NC}"
            fi
        done
    else
        echo "   No circuit breakers configured"
    fi
fi

# 5. Check memory usage
echo ""
echo "5. Checking memory usage..."
if check_endpoint "/health" 200 5; then
    HEALTH_JSON=$(curl -s "$API_URL/health" 2>/dev/null)
    HEAP_USED=$(echo "$HEALTH_JSON" | jq -r '.checks.memory.details.heapUsed // 0')
    HEAP_TOTAL=$(echo "$HEALTH_JSON" | jq -r '.checks.memory.details.heapTotal // 0')
    
    if [ "$HEAP_TOTAL" -gt 0 ]; then
        UTILIZATION=$((HEAP_USED * 100 / HEAP_TOTAL))
        echo "   Heap: ${HEAP_USED}MB / ${HEAP_TOTAL}MB (${UTILIZATION}%)"
        
        if [ "$UTILIZATION" -gt 85 ]; then
            echo -e "${RED}   ❌ High memory usage: ${UTILIZATION}%${NC}"
            send_alert "High memory usage: ${UTILIZATION}%"
            ISSUES=$((ISSUES + 1))
        elif [ "$UTILIZATION" -gt 70 ]; then
            echo -e "${YELLOW}   ⚠️  Elevated memory usage: ${UTILIZATION}%${NC}"
        else
            echo -e "${GREEN}   ✅ Memory usage normal${NC}"
        fi
    fi
fi

# 6. Check error rate (if available)
echo ""
echo "6. Checking recent errors..."
if [ -f "logs/app.log" ]; then
    # Count errors in last 5 minutes
    FIVE_MIN_AGO=$(date -d '5 minutes ago' '+%Y-%m-%dT%H:%M' 2>/dev/null || date -v-5M '+%Y-%m-%dT%H:%M')
    ERROR_COUNT=$(grep -c "\"level\":\"ERROR\"" logs/app.log 2>/dev/null | tail -1 || echo "0")
    
    echo "   Errors in logs: $ERROR_COUNT"
    
    if [ "$ERROR_COUNT" -gt 50 ]; then
        echo -e "${RED}   ❌ High error rate: $ERROR_COUNT errors${NC}"
        send_alert "High error rate: $ERROR_COUNT errors in last 5 minutes"
        ISSUES=$((ISSUES + 1))
    elif [ "$ERROR_COUNT" -gt 20 ]; then
        echo -e "${YELLOW}   ⚠️  Elevated error rate: $ERROR_COUNT errors${NC}"
    else
        echo -e "${GREEN}   ✅ Error rate normal${NC}"
    fi
fi

# Final summary
echo ""
echo "=== Health Check Summary ==="
if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed${NC}"
    exit 0
elif [ "$ISSUES" -le 2 ]; then
    echo -e "${YELLOW}⚠️  $ISSUES issue(s) detected (degraded)${NC}"
    exit 1
else
    echo -e "${RED}❌ $ISSUES issue(s) detected (unhealthy)${NC}"
    exit 2
fi
```

**Setup automated health checks:**
```bash
# Make script executable
chmod +x scripts/health-check.sh

# Test manually
./scripts/health-check.sh

# Add to cron (every 5 minutes)
crontab -e
# Add: */5 * * * * /path/to/polymarket-bot/scripts/health-check.sh >> /var/log/health-check.log 2>&1
```

**Configure alerting:**
```bash
# In .env or environment
export ALERT_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
# or
export ALERT_WEBHOOK="https://discord.com/api/webhooks/YOUR/WEBHOOK/URL"
```

### Health Check Verification Checklist
- ✅ **Connectivity:** All API endpoints respond within 2s
- ✅ **WebSocket:** Market feed connected (feed/status shows connected: true)
- ✅ **Wallet:** Trading status shows correct wallet address
- ✅ **Reconciliation:** State endpoint returns current orders/positions
- ✅ **Dashboard:** Web UI loads and displays live data
- ✅ **Order flow:** Can place test order (if applicable)
- ✅ **State integrity:** Open orders match CLOB API, positions calculate correctly

## Shutdown (Graceful)

**Audit Finding A-017 Addressed:** The server implements proper graceful shutdown with WebSocket cleanup and resource management.

The server implements graceful shutdown on SIGTERM/SIGINT:

```bash
# Send shutdown signal (Ctrl+C or kill command)
kill -SIGTERM <pid>
```

**Automatic shutdown sequence:**
1. Server receives SIGTERM/SIGINT signal
2. 10-second shutdown timeout is initiated (prevents hanging)
3. Rate limiter cleanup is stopped
4. **WebSocket connections are closed gracefully:**
   - Pending resync operations complete
   - WebSocket connections close with proper cleanup
   - Reconnect timers are cleared
5. Trading client cleanup (if live trading enabled and initialized):
   - Periodic reconciliation is stopped
   - All open orders are cancelled
   - Client resources are destroyed
6. HTTP server closes all connections
7. Logs "Server stopped" and exits cleanly

**Shutdown timeout protection:**
- If shutdown takes longer than 10 seconds, the process forcibly exits
- Prevents hanging on stuck resources or network issues
- Ensures the bot can be reliably stopped in production

**Manual shutdown:**
```bash
# Trigger via Ctrl+C in terminal
# Or send signal:
kill -SIGTERM $(pgrep -f "npm run dev")
```

**Testing graceful shutdown:**
```bash
# Start the server
npm run dev &
PID=$!

# Wait for startup
sleep 5

# Trigger graceful shutdown
kill -SIGTERM $PID

# Verify clean shutdown (should see "Server stopped" in logs)
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

## Incident Response Procedures

**CRITICAL: Follow these procedures for production incidents.**

### Incident Severity Levels

| Severity | Description | Response Time | Example |
|----------|-------------|---------------|---------|
| **SEV-1** | Production down, trading halted, funds at risk | Immediate (< 5 min) | Kill switch triggered, reconciliation failed, wallet compromise |
| **SEV-2** | Service degraded, partial functionality lost | < 30 min | WebSocket instability, API error rate >10%, circuit breaker open |
| **SEV-3** | Minor issue, workaround available | < 4 hours | Slow response times, minor retries, dashboard issues |
| **SEV-4** | Cosmetic, no impact on trading | Next business day | Logging issues, UI formatting |

### Incident Response Process

**Step 1: Detect & Alert (0-2 minutes)**
```bash
# Automated detection (monitoring should alert on):
# - /health endpoint returns degraded/unhealthy
# - /ready endpoint returns 503
# - Kill switch activated
# - Circuit breaker opened
# - Error rate > threshold
# - WebSocket disconnects > threshold
# - Reconciliation failures

# Manual detection:
# - Check logs: tail -f logs/app.log | grep -E "(ERROR|CRITICAL)"
# - Check metrics: curl http://localhost:3000/metrics
# - Check health: curl http://localhost:3000/health
```

**Step 2: Assess & Triage (2-5 minutes)**
```bash
# Determine severity
# SEV-1: Activate kill switch immediately
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Gather initial data
curl http://localhost:3000/status > incident-status.json
curl http://localhost:3000/state > incident-state.json
curl http://localhost:3000/metrics > incident-metrics.json
grep -A 50 "ERROR" logs/app.log > incident-errors.log

# Document in incident channel (Slack/Discord)
# - Severity level
# - When detected
# - Impact (trading status, positions, balance)
# - Current actions taken
```

**Step 3: Mitigate (5-15 minutes)**

**For SEV-1 incidents:**
```bash
# 1. STOP all trading
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Snapshot current state
curl http://localhost:3000/state > incident-snapshot-$(date +%Y%m%d-%H%M%S).json

# 3. Check wallet security
# - Review recent transactions on Polygonscan
# - Verify no unauthorized access
# - Check for unusual activity

# 4. Preserve logs
cp logs/app.log incident-logs-$(date +%Y%m%d-%H%M%S).log

# 5. Notify stakeholders
# - Post incident summary
# - Estimated impact ($ amount at risk, positions affected)
# - Next steps
```

**For SEV-2 incidents:**
```bash
# 1. Reduce trading activity
# - Cancel non-essential orders
# - Reduce position sizes
# - Increase spread widths

# 2. Enable verbose logging
echo "LOG_LEVEL=debug" >> .env
# Restart: kill and npm run dev

# 3. Monitor closely
watch -n 5 'curl -s http://localhost:3000/metrics | jq ".circuitBreakers"'

# 4. Identify root cause
# - Check service status: curl https://clob.polymarket.com/health
# - Test network: ping clob.polymarket.com
# - Review error patterns: grep "ERROR" logs/app.log | tail -50
```

**Step 4: Resolve (15 minutes - 4 hours)**

See [Troubleshooting Guide](./troubleshooting.md) for specific issue resolution:

**Common incident types:**

### WebSocket Disconnects (SEV-2/SEV-3)
1. Bot automatically attempts reconnect with exponential backoff
2. On reconnection, resync order books via REST API
3. If reconnect fails > 10 attempts in 10 minutes:
   - Activate kill switch (SEV-2 escalation)
   - Alert operator
   - Check Polymarket service status
4. **Resolution:** Fix network/firewall, wait for service recovery
5. **Prevention:** Monitor WebSocket uptime, implement retry limits

**Detailed troubleshooting:** See [Troubleshooting Guide - WebSocket Issues](./troubleshooting.md#websocket-connection-issues)

### API Error Spike (SEV-2)
1. Circuit breaker automatically opens after 5 consecutive failures
2. All API requests rejected until circuit recovers
3. Circuit auto-transitions to half-open after 60 seconds
4. If persistent (>5 minutes):
   - Pause all order placements
   - Alert operator
   - Check rate limits, authentication, service status
5. **Resolution:** Fix root cause (rate limits, credentials, service outage)
6. **Prevention:** Implement client-side rate limiting, respect backoff signals

**Detailed troubleshooting:** See [Troubleshooting Guide - API Client Errors](./troubleshooting.md#api-client-errors)

### Sudden PnL Drawdown (SEV-1)
1. Circuit breaker triggers if loss exceeds RISK_MAX_DRAWDOWN
2. Cancel all open orders immediately
3. Stop all new trading (kill switch activated)
4. Notify operator - manual clearance required
5. **Root cause analysis:**
   ```bash
   # Review recent trades
   curl http://localhost:3000/state | jq '.fills[-20:]'
   
   # Check position changes
   curl http://localhost:3000/state | jq '.positions'
   
   # Analyze market conditions
   # - Was there a black swan event?
   # - Strategy malfunction?
   # - Fat finger error?
   ```
6. **Resolution:** Fix strategy, adjust risk limits, resume cautiously
7. **Prevention:** Set appropriate RISK_MAX_DRAWDOWN, test strategies in paper mode

### Market Volatility Spike (SEV-2)
1. Detect via rapid price movements in orderbook
2. Cancel orders in affected market(s)
3. Pause quoting until volatility stabilizes
4. Resume with wider spreads after cooldown period
5. **Resolution:** Wait for market stabilization, adjust strategy parameters
6. **Prevention:** Implement volatility filters, dynamic spread widening

### Data Corruption or State Mismatch (SEV-1)
1. Detect via reconciliation checks (startup or periodic)
2. Stop trading immediately and enter safe mode
3. Activate kill switch
4. Reconcile state from CLOB API + persisted records
5. If mismatch persists:
   - Alert operator
   - Keep trading disabled
   - Manual investigation required
6. **Recovery procedure:**
   ```bash
   # Force full reconciliation
   curl -X POST http://localhost:3000/api/reconcile \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   
   # Compare with exchange
   # - Open orders: curl "https://clob.polymarket.com/orders?address=..."
   # - Fills: curl "https://clob.polymarket.com/fills?address=..."
   # - Balances: check Polygonscan
   
   # If reconciliation fixes state:
   # - Remove kill switch: rm apps/backend/.state/kill-switch.json
   # - Restart bot
   
   # If mismatch persists:
   # - Manual investigation required
   # - Review audit trail
   # - Check for missing WebSocket messages
   # - Verify no external order placement
   ```
7. **Prevention:** Implement periodic reconciliation (every 5 minutes), enable audit trail

**Detailed troubleshooting:** See [Troubleshooting Guide - Balance & Reconciliation](./troubleshooting.md#balance--reconciliation-errors)

### Security Incident (SEV-1) 🚨
**Examples:** Private key exposed, unauthorized access, suspicious activity

**IMMEDIATE ACTIONS:**
```bash
# 1. KILL SWITCH
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. SHUTDOWN
pkill -f "npm run dev"

# 3. PRESERVE EVIDENCE
cp -r logs/ incident-evidence-$(date +%Y%m%d-%H%M%S)/
cp .env incident-evidence-$(date +%Y%m%d-%H%M%S)/config.env
curl http://localhost:3000/state > incident-evidence-$(date +%Y%m%d-%H%M%S)/final-state.json

# 4. SECURE WALLET
# - Rotate private key IMMEDIATELY
# - Transfer funds to new wallet
# - Monitor old wallet for unauthorized transactions

# 5. NOTIFY
# - Legal/compliance team
# - Polymarket (if ToS violation suspected)
# - Law enforcement (if criminal activity)
```

**DO NOT restart until:**
- ✅ Security issue is fully understood
- ✅ Vulnerability is patched
- ✅ New credentials are generated
- ✅ Audit log is reviewed
- ✅ Legal/compliance approval obtained

**See also:** [Compliance Guide - Security Incidents](./compliance.md#incident-response--reporting)

**Step 5: Document & Close (Post-incident)**

```bash
# Create incident report
cat > incident-report-$(date +%Y%m%d).md << 'EOF'
# Incident Report

**Date:** YYYY-MM-DD
**Severity:** SEV-X
**Duration:** Started HH:MM, Resolved HH:MM (total: X hours)
**Impact:** Trading halted, X positions affected, $Y potential loss

## Timeline
- HH:MM: Incident detected (description)
- HH:MM: Kill switch activated
- HH:MM: Root cause identified
- HH:MM: Fix applied
- HH:MM: Trading resumed

## Root Cause
(Detailed description of what went wrong and why)

## Impact
- Trading downtime: X minutes
- Positions affected: Y
- Financial impact: $Z (realized) + $W (unrealized)
- Orders cancelled: N

## Resolution
(What was done to fix the issue)

## Prevention
(Changes to prevent recurrence)
- [ ] Code changes: (description)
- [ ] Configuration changes: (description)
- [ ] Process changes: (description)
- [ ] Monitoring improvements: (description)

## Lessons Learned
(Key takeaways from the incident)

## Action Items
- [ ] Update runbook with new procedures
- [ ] Implement automated detection
- [ ] Add test coverage for scenario
- [ ] Review similar risks in codebase
EOF

# Update runbook with learnings
# Add new section or update existing procedures
```

**Step 6: Post-Incident Review**
- Schedule within 24 hours of incident resolution
- Invite all stakeholders
- Review timeline, root cause, resolution
- Identify action items to prevent recurrence
- Update documentation (runbook, troubleshooting guide)
- Implement monitoring improvements

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

By default the backend exposes a **dedicated metrics server on port 9090** (Research §7 Day 6, §9.1). The main API server (PORT, default 3000) also serves GET `/metrics` for backward compatibility. To use a single port for both API and metrics, set `METRICS_PORT` to the same value as `PORT` (e.g. `METRICS_PORT=3000`); then only the main server runs and `/metrics` is available on that port only.

```bash
# Default: dedicated metrics port 9090
curl http://localhost:9090/metrics

# Metrics are also available on the API port
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

**Reconciliation Monitoring (Gap RE-001, RE-002, RE-003)**:
- **Missing orders detected**: Investigate why local state diverged from exchange
  - Check for missed WebSocket messages
  - Review order cancellation logic
  - Verify no manual interventions bypassed the bot
- **Orphaned orders detected**: Review and manually cancel if necessary
  - May indicate orders placed outside the bot
  - Could be from previous bot instances
- **Balance drift > 10%**: High priority investigation
  - Verify no unauthorized transactions
  - Check for missed trade executions
  - Review audit trail for discrepancies
- **Position drift > 5%**: Review position reconciliation
  - Check for partial fill handling issues
  - Verify fill event processing
  - Compare with exchange position

**Reconciliation Alert Thresholds**:
| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Missing Orders | 1-2 orders | > 3 orders | Review order flow, check WebSocket |
| Balance Drift | > 5% | > 10% | Investigate transactions, verify fills |
| Position Drift | > 2% | > 5% | Check fill processing, review orders |
| Reconciliation Failures | 2 failures | 5 consecutive | Restart client, check API status |

### Log Monitoring

**Critical logs to watch:**
```bash
# Follow logs in real-time
npm run dev | grep -E "(ERROR|WARN|kill|circuit|reconciliation)"

# Error patterns to alert on:
# - "ERROR" - Any error log
# - "WebSocket disconnected" - Connection issues
# - "Reconciliation failed" - State mismatch
# - "Reconciliation: detected missing orders" - Gap RE-002
# - "Reconciliation: detected orphaned orders" - Gap RE-002
# - "Reconciliation: detected balance drift" - Gap RE-003
# - "Kill switch activated" - Emergency stop
# - "Circuit breaker triggered" - Risk limit breach
# - "Order rejected" - Risk check failure

# Reconciliation-specific log queries:
# Missing orders (critical)
npm run dev | grep "missing orders on exchange"

# Balance drift warnings
npm run dev | grep "balance drift"

# Position changes
npm run dev | grep "position size changed"

# Reconciliation failures
npm run dev | grep "Periodic reconciliation failed"
```

**Log aggregation setup:**
```bash
# Export logs to file for analysis
npm run dev 2>&1 | tee -a logs/bot-$(date +%Y%m%d).log

# Rotate logs daily (add to crontab)
0 0 * * * find logs/ -name "bot-*.log" -mtime +30 -delete
```

## Logging and Privacy (A-022)

### Sensitive Data Protection

**Addresses Audit Finding A-022:** The logging system automatically masks sensitive data to prevent privacy leaks.

**Automatically Masked Fields:**
The logger automatically masks these field names in all log metadata:
- `address` - Wallet addresses
- `privateKey` / `private_key` - Private keys
- `secret` - Secret values
- `apiKey` / `api_key` - API keys
- `token` - Authentication tokens
- `password` - Passwords
- Any field containing `key` in the name

**Masking Format:**
Long strings (>10 characters) are masked showing only the first 6 and last 4 characters:
- Full: `0x1234567890abcdef1234567890abcdef12345678`
- Masked: `0x1234...5678`

Short strings (≤10 characters) are fully masked as `***`.

### Log Level Configuration

Configure the log level via the `LOG_LEVEL` environment variable:

```bash
# Development - verbose output
LOG_LEVEL=debug

# Production - standard output (default)
LOG_LEVEL=info

# Production - minimal output
LOG_LEVEL=warn

# Emergency - errors only
LOG_LEVEL=error
```

**Log Levels:**
- `error` - Critical errors only
- `warn` - Warnings and errors
- `info` - Standard operational logs (default)
- `debug` - Detailed diagnostic logs

### Structured Logging

All logs are output as JSON for easy parsing and analysis:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "message": "Trading client initialized",
  "address": "0x1234...5678",
  "chainId": 137
}
```

### Log Analysis Examples

**Search for masked addresses:**
```bash
# Grep logs for wallet addresses (will show masked versions only)
grep "address" logs/app.log | jq '.address'
```

**Verify no plaintext sensitive data:**
```bash
# This should NOT find any full Ethereum addresses (42 chars)
grep -E '0x[a-fA-F0-9]{40}' logs/app.log

# Verify only masked addresses appear (10 chars: "0x1234...5678")
grep -oE '0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}' logs/app.log
```

**Extract logs by level:**
```bash
# Get all error logs
grep '"level":"ERROR"' logs/app.log | jq .

# Get all warning logs
grep '"level":"WARN"' logs/app.log | jq .
```

### Privacy Compliance

**Log Retention:**

These retention periods are operational recommendations and are **not** enforced by the bot itself. Configure actual log retention in your logging and storage infrastructure (for example, log management services, object storage lifecycle policies, or IaC-managed retention settings) to meet these targets and any local regulatory requirements.

- Development: 7 days (recommended)
- Staging: 30 days (recommended)
- Production: 90 days (recommended for regulatory compliance)

**Log Storage:**
- Ensure logs are stored securely with appropriate access controls
- Do not share logs publicly or with untrusted parties
- Redact even masked data when sharing logs externally

**Audit Trail:**
For order and fill history, use the dedicated audit trail (see Gap PA-002) rather than logs.

## Comprehensive Troubleshooting

**For detailed troubleshooting, see [docs/troubleshooting.md](./troubleshooting.md)** - Complete guide covering:
- Top 10 common issues with solutions
- WebSocket connection problems
- Trading gate failures
- API client errors
- Authentication issues
- Order placement failures
- Kill switch problems
- Balance & reconciliation errors
- Performance & reliability issues
- Security & compliance concerns

**Quick troubleshooting reference below:**

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

**Circuit Breaker States (Audit Finding A-018 - Auto-Reset):**
- **closed**: Normal operation, requests pass through
- **open**: Service failing, requests rejected immediately (protecting from cascade failures)
  - Auto-transitions to half_open after reset timeout (default: 60 seconds)
- **half_open**: Testing if service recovered, allowing limited requests
  - Transitions to closed after success threshold (default: 2 successes)
  - Transitions back to open on any failure

**Auto-Reset Configuration:**
```bash
# Circuit breaker settings in .env
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5      # Failures before opening (default: 5)
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=60000   # Time before retry (default: 60s)
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2      # Successes to close (default: 2)
```

**Monitoring Circuit Breaker:**
```bash
# Check circuit breaker state
curl http://localhost:3000/status | jq '.circuitBreakers'

# Expected output:
# [
#   {
#     "name": "risk-manager",
#     "state": "closed",
#     "failures": 0,
#     "successes": 150,
#     "consecutiveFailures": 0,
#     "consecutiveSuccesses": 10
#   }
# ]
```

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

## UMA resolution and redemption (Research §1.6)

Markets resolve via the UMA Optimistic Oracle. After resolution, winning shares can be redeemed for $1.00 USDC.

- **Typical resolution:** Proposal → 2-hour challenge period → settlement. If disputed, UMA DVM can take ~48–96 hours.
- **Auto-redemption:** Winning positions are typically redeemable via the Polymarket UI or API after settlement. The bot does not auto-redeem; plan to redeem manually or add a monitor that triggers redemption.
- **Settlement buffer:** If you hold positions to resolution, allow for dispute delays (up to ~96 hours) before treating value as final.

## Backup and Recovery

### Daily DB backup (Research §9.8)

For production, back up SQLite (or Postgres) daily. **Note:** Research §11 suggests Postgres for production at scale; the current implementation uses SQLite. If you migrate to Postgres, use equivalent backup (e.g. `pg_dump`) and document the connection string in your runbook.

Example (SQLite):

```bash
# Daily at 00:00 UTC; retain 30 days
0 0 * * * sqlite3 /path/to/data/audit.db ".dump" | gzip > /path/to/backups/audit-$(date +\%Y\%m\%d).sql.gz
# Prune: find /path/to/backups -name 'audit-*.sql.gz' -mtime +30 -delete
```

Optionally push backups to S3/Backblaze for off-host retention.

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
