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

### Wallet Requirements
- Funded with USDC on Polygon network
- Private key securely stored (use secret manager, not plaintext files)
- Separate from personal wallet (trading wallet only)
- Limited funds based on risk tolerance

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

# Market feed
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

Immediately cancel all open orders without shutting down the server.

### Via Dashboard
1. Open dashboard at http://localhost:8080
2. Scroll to bottom "Emergency Kill Switch" section
3. Click red "CANCEL ALL ORDERS" button
4. Confirm action in popup
5. All open orders will be cancelled immediately

### Via API
```bash
curl -X POST http://localhost:3000/kill-switch
```

**Response:**
```json
{
  "success": true,
  "message": "All orders cancelled"
}
```

**When to use:**
- Sudden adverse market movement
- Strategy malfunction detected
- System anomaly or unexpected behavior
- Need to immediately stop all trading activity
- Risk limit breach

**Post kill-switch:**
1. Review logs for root cause
2. Check final positions in dashboard
3. Reconcile state: `curl http://localhost:3000/state`
4. Fix issue before resuming trading
5. Restart server if necessary

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

## Routine Maintenance
- **Daily:** Review PnL, error rate logs, and open positions.
- **Weekly:** Check strategy parameters, market list, and compliance flags.
- **Monthly:** Review incident history and update runbook as needed.

## Backups and Retention
- Persist order/position snapshots daily.
- Retain logs and metrics for at least 30 days (adjust per policy).

## Rollback Procedure
1. Stop the bot via graceful shutdown.
2. Revert to last known good release.
3. Start bot in read-only/paper mode.
4. Validate connectivity and state before re-enabling trading.
