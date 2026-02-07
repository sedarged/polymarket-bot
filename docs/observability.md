# Observability & Monitoring

This document describes the observability features of the Polymarket Trading Bot, including metrics collection, monitoring, and alerting.

## Overview

The bot integrates Prometheus for comprehensive metrics collection and provides a Grafana dashboard for visualization. This addresses gap **OB-001** from the gap analysis report.

## Metrics Endpoint

The bot exposes metrics in Prometheus format at:

```
GET /metrics
```

This endpoint returns all metrics in Prometheus text exposition format.

### Example Usage

```bash
curl http://localhost:3000/metrics
```

## Available Metrics

### Order Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `polymarket_orders_total` | Counter | side, result, mode | Total number of orders placed |
| `polymarket_order_latency_seconds` | Histogram | side, mode | Order placement latency in seconds |
| `polymarket_order_fills_total` | Counter | side, mode | Total number of order fills |
| `polymarket_order_cancellations_total` | Counter | reason, mode | Total number of order cancellations |

**Labels:**
- `side`: BUY or SELL
- `result`: success or failure
- `mode`: live or paper
- `reason`: user, timeout, kill-switch

### WebSocket Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `polymarket_websocket_state` | Gauge | feed_type | Current WebSocket connection state (0-4) |
| `polymarket_websocket_reconnects_total` | Counter | feed_type, result | Total reconnection attempts |
| `polymarket_websocket_messages_total` | Counter | feed_type, message_type | Total messages received |
| `polymarket_websocket_uptime_seconds` | Gauge | feed_type | Connection uptime in seconds |
| `polymarket_websocket_errors_total` | Counter | feed_type, error_type | Total WebSocket errors |

**State Values:**
- 0 = DISCONNECTED
- 1 = CONNECTING
- 2 = CONNECTED
- 3 = RECONNECTING
- 4 = CLOSED

**Labels:**
- `feed_type`: market, user, trade
- `result`: attempt, success
- `message_type`: book, trade, ack, error
- `error_type`: connection, protocol, timeout

### Circuit Breaker Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `polymarket_circuit_breaker_state` | Gauge | breaker_name | Circuit breaker state (0-2) |
| `polymarket_circuit_breaker_trips_total` | Counter | breaker_name | Total number of circuit trips |
| `polymarket_circuit_breaker_failures_total` | Counter | breaker_name | Total failures recorded |
| `polymarket_circuit_breaker_successes_total` | Counter | breaker_name | Total successes recorded |

**State Values:**
- 0 = CLOSED (healthy)
- 1 = OPEN (tripped)
- 2 = HALF_OPEN (testing recovery)

### Trading Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `polymarket_open_orders` | Gauge | mode | Current number of open orders |

### Orderbook Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `polymarket_cached_orderbooks` | Gauge | - | Number of cached orderbooks |

### System Metrics

The bot also exports standard Node.js metrics:

- `process_cpu_user_seconds_total` - User CPU time
- `process_cpu_system_seconds_total` - System CPU time
- `process_resident_memory_bytes` - Resident memory size
- `process_heap_bytes` - Heap size
- `nodejs_heap_size_used_bytes` - Heap usage
- `nodejs_heap_size_total_bytes` - Total heap size
- `nodejs_event_loop_lag_seconds` - Event loop lag

## Prometheus Configuration

Add this scrape config to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'polymarket-bot'
    static_configs:
      - targets: ['localhost:3000']
    scrape_interval: 5s
    scrape_timeout: 4s
```

## Grafana Dashboard

A pre-configured Grafana dashboard is available in `grafana/polymarket-dashboard.json`.

### Features

- **Order Placement Rate** - Real-time order rate by side and result
- **Order Latency** - p95 and p99 latency percentiles
- **WebSocket State** - Connection status with color coding
- **Circuit Breaker State** - Health of circuit breakers
- **Open Orders** - Current trading activity
- **Reconnection Rate** - WebSocket stability
- **Memory Usage** - System resource utilization
- **Process Uptime** - Bot availability

### Import Instructions

1. Open Grafana UI
2. Go to **Dashboards** > **Import**
3. Upload `grafana/polymarket-dashboard.json`
4. Select your Prometheus datasource
5. Click **Import**

See `grafana/README.md` for detailed setup instructions.

## Alerting

### Recommended Alerts

Configure these alerts in Prometheus Alertmanager or Grafana:

#### High Order Failure Rate
```yaml
- alert: HighOrderFailureRate
  expr: rate(polymarket_orders_total{result="failure"}[5m]) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High order failure rate detected"
    description: "Order failure rate is {{ $value }} orders/sec"
```

#### Circuit Breaker Tripped
```yaml
- alert: CircuitBreakerTripped
  expr: polymarket_circuit_breaker_state == 1
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Circuit breaker {{ $labels.breaker_name }} is open"
    description: "Service protection activated, requests are failing fast"
```

#### WebSocket Disconnected
```yaml
- alert: WebSocketDisconnected
  expr: polymarket_websocket_state{feed_type="market"} != 2
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "WebSocket {{ $labels.feed_type }} is not connected"
    description: "Current state: {{ $value }}"
```

#### High Order Latency
```yaml
- alert: HighOrderLatency
  expr: histogram_quantile(0.95, rate(polymarket_order_latency_seconds_bucket[5m])) > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High order placement latency"
    description: "p95 latency is {{ $value }}s (threshold: 2s)"
```

#### High Memory Usage
```yaml
- alert: HighMemoryUsage
  expr: process_resident_memory_bytes > 500000000
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High memory usage detected"
    description: "Memory usage is {{ $value | humanize }}B (threshold: 500MB)"
```

## Query Examples

### PromQL Queries

**Order success rate (last 5 minutes):**
```promql
rate(polymarket_orders_total{result="success"}[5m]) /
rate(polymarket_orders_total[5m])
```

**Average order latency:**
```promql
rate(polymarket_order_latency_seconds_sum[5m]) /
rate(polymarket_order_latency_seconds_count[5m])
```

**Circuit breaker error rate:**
```promql
rate(polymarket_circuit_breaker_failures_total[5m])
```

## Integration with Logging

Metrics complement but don't replace logging:

- **Metrics** - Track aggregate statistics, trends, and rates (e.g., orders/sec, latency percentiles)
- **Logs** - Capture individual events, errors, and context (e.g., "Order XYZ failed: insufficient balance")

Both are essential for production observability.

## Performance Considerations

### Metric Collection Overhead

- Metrics collection has minimal overhead (<1% CPU, <10MB memory)
- Counters and gauges are very lightweight
- Histograms have slightly higher overhead due to bucketing
- Default metrics scrape every 5 seconds

### Cardinality

Be mindful of metric cardinality (unique label combinations):

- **Low cardinality** (good): side=BUY/SELL, mode=live/paper
- **High cardinality** (avoid): order_id, token_id (use sparingly)

High cardinality can cause memory issues in Prometheus. Current metrics are designed with low cardinality.

## Testing

The metrics module has comprehensive unit tests:

```bash
npm test -- metrics.test.ts
```

Tests cover:
- All metric types (counters, gauges, histograms)
- Label combinations
- Prometheus format output
- Metric reset functionality

## Troubleshooting

### Metrics endpoint returns 500

Check logs for errors in metrics collection. The endpoint has error handling and will return JSON error responses.

### Missing metrics in Prometheus

1. Verify Prometheus is scraping: `curl http://localhost:9090/api/v1/targets`
2. Check metrics endpoint: `curl http://localhost:3000/metrics`
3. Verify no firewall blocking port 3000

### Stale metrics

Some metrics only appear after certain events:
- Order metrics require order placement
- Circuit breaker metrics require failures
- WebSocket metrics require connection events

## Future Enhancements

Potential improvements tracked in [STATUS.md](../STATUS.md):

- [ ] Business metrics (P&L, fill rate, Sharpe ratio) - OB-004
- [ ] Performance metrics (latency percentiles beyond p95/p99) - OB-003
- [ ] Distributed tracing (request IDs across services) - OB-005
- [x] Alerting system integration (Slack, Email) - OB-002 ✅ **COMPLETED**
- [ ] Orderbook staleness detection - OB-007

## Built-in Alerting System

**Status:** ✅ **IMPLEMENTED** (PR-010)

The bot includes a built-in alerting system that sends notifications to Slack and email for critical events.

### Configuration

Configure alerting via environment variables in `.env`:

```bash
# Slack webhook URL for critical alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX

# Email alerting (optional)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASSWORD=your-app-password
EMAIL_FROM_ADDRESS=polymarket-bot@example.com
EMAIL_TO_ADDRESSES=admin@example.com,ops@example.com

# Alert thresholds
ALERT_ERROR_RATE_THRESHOLD=5  # Alert when error rate exceeds 5%
ALERT_CIRCUIT_BREAKER_TRIPS=1  # Alert after 1 circuit breaker trip
```

### Setting Up Slack Alerts

1. Go to https://api.slack.com/messaging/webhooks
2. Create a new webhook for your Slack workspace
3. Copy the webhook URL
4. Add it to your `.env` file as `SLACK_WEBHOOK_URL`
5. Restart the bot

### Setting Up Email Alerts

**Status:** ⚠️ **PLACEHOLDER IMPLEMENTATION**

Email alerting configuration is accepted but not yet fully implemented. The bot will log that an email would be sent but will not actually send emails. Full email implementation requires adding the `nodemailer` library.

To enable email alerts in the future:

For Gmail:
1. Enable 2-factor authentication on your Google account
2. Generate an app-specific password at https://myaccount.google.com/apppasswords
3. Use the app password in `EMAIL_SMTP_PASSWORD`
4. Add recipient addresses to `EMAIL_TO_ADDRESSES` (comma-separated)
5. Restart the bot

For other SMTP servers, configure the appropriate host, port, and credentials.

**Current behavior:** Email configuration is validated and logged, but actual email sending is not implemented. Alerts will still be sent to Slack if configured.

### Alert Types

#### Critical Alerts 🚨

**Circuit Breaker Tripped**
- **Trigger:** Circuit breaker opens after consecutive failures
- **Context:** Breaker name, failure count
- **Example:**
  ```
  🚨 Circuit Breaker Tripped
  Breaker: market-feed
  Failures: 5
  Time: 2024-02-07T00:50:00Z
  ```
- **Action:** Investigate root cause immediately. System will auto-recover after timeout.

**Kill Switch Activated**
- **Trigger:** Kill switch manually or automatically activated
- **Context:** Reason, activated by (user/system)
- **Example:**
  ```
  🚨 Kill Switch Activated
  Reason: High error rate detected
  Activated By: system
  Time: 2024-02-07T00:50:00Z
  ```
- **Action:** Verify reason, resolve issue, reset kill switch when safe.

**Strategy Execution Error**
- **Trigger:** Trading strategy throws an exception
- **Context:** Strategy name, error message, stack trace, market context
- **Example:**
  ```
  🚨 Strategy Execution Error
  Strategy: momentum-strategy
  Error: Cannot read property 'price' of undefined
  Market: market-123
  Signals: {"rsi": 70, "macd": 0.5}
  ```
- **Action:** Review strategy code, fix bugs, redeploy.

#### Warning Alerts ⚠️

**High Error Rate**
- **Trigger:** Error rate exceeds threshold (default: 5%)
- **Context:** Current error rate, window size, threshold
- **Example:**
  ```
  ⚠️  High Error Rate Detected
  Error Rate: 8.5%
  Threshold: 5%
  Window: 100 operations
  ```
- **Action:** Monitor for escalation. Investigate if persistent.

### Alert Features

- **Rate Limiting:** Alerts are automatically rate-limited to prevent alert storms (1 minute cooldown per alert type)
- **Rich Formatting:** Slack alerts include emoji, colors, and structured fields
- **Alert History:** Last 1000 alerts kept in memory (accessible via API endpoint)
- **Multiple Channels:** Send to Slack, email, or both simultaneously
- **Contextual Information:** All alerts include relevant context for troubleshooting

### Alert Runbooks

#### Circuit Breaker Opened

1. **Check metrics:**
   ```bash
   curl http://localhost:3000/metrics | grep circuit_breaker
   ```

2. **Review logs:**
   ```bash
   grep -i "circuit breaker" logs/*.log
   ```

3. **Common causes:**
   - Network connectivity issues
   - API rate limiting
   - API service outage
   - Invalid credentials

4. **Resolution:**
   - If transient: Wait for auto-recovery (default: 60 seconds)
   - If persistent: Fix root cause, circuit breaker will self-heal
   - Monitor `polymarket_circuit_breaker_state` metric

#### Kill Switch Activated

1. **Check status:**
   ```bash
   curl http://localhost:3000/status
   ```

2. **Review alert context for reason**

3. **Common triggers:**
   - High error rate
   - Excessive drawdown
   - Manual activation
   - System anomaly detection

4. **Resolution:**
   ```bash
   # Verify issue is resolved, then reset
   curl -X POST http://localhost:3000/reset \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

#### High Error Rate

1. **Check current metrics:**
   ```bash
   curl http://localhost:3000/metrics | grep orders_total
   ```

2. **Review recent errors:**
   ```bash
   grep "ERROR" logs/*.log | tail -100
   ```

3. **Common causes:**
   - API rate limiting
   - Invalid order parameters
   - Insufficient balance
   - Market closed

4. **Resolution:**
   - Fix validation errors
   - Adjust rate limits
   - Ensure sufficient balance
   - Verify market status

### Testing Alerts

You can manually trigger test alerts for verification:

```bash
# Test Slack/email configuration
# Note: Requires implementing a test endpoint or using the alerting service directly in code
```

### Alert History API

Get recent alert history (last 100 alerts):

```bash
curl http://localhost:3000/alerts
```

Response:
```json
{
  "alerts": [
    {
      "severity": "critical",
      "title": "Circuit Breaker Tripped",
      "message": "Circuit breaker \"market-feed\" has opened",
      "context": {
        "breaker": "market-feed",
        "failures": 5
      },
      "timestamp": "2024-02-07T00:50:00.000Z"
    }
  ]
}
```

*Note: Alert history endpoint is available for monitoring/debugging purposes.*

### Monitoring Alerting Health

The alerting service logs all operations:

```bash
# Check if alerting service initialized
grep "Alerting service initialized" logs/*.log

# Check for alert sending failures
grep "Failed to send.*alert" logs/*.log

# View all sent alerts
grep "ALERT:" logs/*.log
```

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Gap Analysis Report](../REPORTS/GAP_ANALYSIS.md) - OB-001
- [Grafana Dashboard README](../grafana/README.md)
