# Grafana Dashboard for Polymarket Trading Bot

This directory contains pre-configured Grafana dashboards for monitoring the Polymarket trading bot.

## Dashboard: `polymarket-dashboard.json`

A comprehensive dashboard that tracks:

### Key Metrics

1. **Order Placement Rate**
   - Real-time order placement rate by side (BUY/SELL) and result (success/failure)
   - Helps identify spikes or drops in trading activity

2. **Order Latency (p95/p99)**
   - 95th and 99th percentile latency for order placement
   - Critical for detecting performance degradation

3. **WebSocket Connection State**
   - Current state of WebSocket connections (DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, CLOSED)
   - Color-coded: Green (CONNECTED), Yellow (CONNECTING), Orange (RECONNECTING), Red (DISCONNECTED/CLOSED)

4. **Circuit Breaker State**
   - Current state of circuit breakers (CLOSED, OPEN, HALF_OPEN)
   - Color-coded: Green (CLOSED/OK), Red (OPEN/TRIPPED), Yellow (HALF_OPEN/TESTING)

5. **Open Orders**
   - Current number of open orders
   - Thresholds: Green (0-9), Yellow (10-49), Red (50+)

6. **Cached Orderbooks**
   - Number of orderbooks currently cached in memory

7. **WebSocket Reconnections**
   - Rate of WebSocket reconnection attempts and successes
   - Helps identify connection stability issues

8. **Circuit Breaker Failures**
   - Rate of circuit breaker failures and trips
   - Early warning for service degradation

9. **Memory Usage**
   - RSS, Heap Used, and Heap Total
   - Helps detect memory leaks

10. **Process Uptime**
    - How long the bot has been running
    - Useful for detecting restarts

## Setup

### Prerequisites

- Prometheus server running
- Grafana instance running
- Polymarket bot exposing metrics on `/metrics` endpoint

### Import Dashboard

1. Open Grafana UI
2. Go to **Dashboards** > **Import**
3. Upload `polymarket-dashboard.json` or paste its contents
4. Select your Prometheus datasource
5. Click **Import**

### Configure Prometheus

Add this job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'polymarket-bot'
    static_configs:
      - targets: ['localhost:3000']  # Adjust port as needed
    scrape_interval: 5s
    scrape_timeout: 4s
```

## Alerts

Consider setting up alerts for:

- **High Order Failure Rate**: `rate(polymarket_orders_total{result="failure"}[5m]) > 0.1`
- **Circuit Breaker Tripped**: `polymarket_circuit_breaker_state == 1`
- **WebSocket Disconnected**: `polymarket_websocket_state{feed_type="market"} != 2`
- **High Latency**: `histogram_quantile(0.95, rate(polymarket_order_latency_seconds_bucket[5m])) > 2`
- **Memory Usage**: `process_resident_memory_bytes > 500000000` (>500MB)

## Customization

The dashboard can be customized to:
- Add more panels for business metrics (P&L, fill rate, etc.)
- Adjust thresholds based on your trading strategy
- Add custom alerts via Grafana alerting
- Create separate dashboards for different environments (dev, staging, prod)

## Metrics Endpoint

The bot exposes metrics at `GET /metrics` in Prometheus text format:

```bash
curl http://localhost:3000/metrics
```

## Troubleshooting

### No Data in Dashboard

1. Verify Prometheus is scraping the bot:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

2. Check metrics endpoint is accessible:
   ```bash
   curl http://localhost:3000/metrics
   ```

3. Verify Grafana datasource is configured correctly

### Missing Metrics

Some metrics may not appear until certain events occur:
- Order metrics require order placement
- Circuit breaker metrics require failures
- WebSocket metrics require connection events

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
