# Runbook

## Purpose
Operational procedures for running the Polymarket bot in production.

## Startup
1. **Environment prep**
   - Export required secrets (wallet private key, API key/secret/passphrase).
   - Confirm secrets are injected via env/secret manager (no plaintext files).
   - Verify system clock sync (NTP).
2. **Dependency checks**
   - Ensure network connectivity to Polygon and Polymarket endpoints.
   - Verify any database or local state store is reachable.
3. **Launch sequence**
   - Start the bot process (systemd, Docker, or npm script).
   - Confirm logs show config loaded and initial health checks passed.
4. **Auth validation**
   - Run a lightweight authenticated call to verify L2 credentials.
5. **State sync**
   - Fetch open orders and positions and reconcile local state.
6. **Market data**
   - Connect to market WS channels and validate snapshot ingestion.
7. **Activate strategy**
   - Enable trading only after WS and state reconciliation succeed.

## Health Checks
- **Connectivity:** REST + WS endpoints reachable and authenticated where required.
- **Order flow:** Place/cancel in paper mode and ensure lifecycle events are logged.
- **State integrity:** Open orders and positions reconcile without mismatch.

## Shutdown (Graceful)
1. Trigger shutdown via admin command or SIGTERM.
2. Cancel all open orders.
3. Stop strategy loop.
4. Flush logs and persist state.

## Kill Switch (Emergency)
- Use the kill switch endpoint/command to:
  1. Cancel all open orders immediately.
  2. Halt all trading loops.
  3. Emit a critical alert to operator channels.

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
