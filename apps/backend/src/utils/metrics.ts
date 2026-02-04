/**
 * Prometheus metrics registry and instrumentation
 * 
 * Provides centralized metrics collection for:
 * - Order placement (successes, failures, latency)
 * - WebSocket connections (state, reconnections, messages)
 * - Circuit breakers (state, trips, failures)
 * - System health (memory, uptime)
 */

import * as promClient from 'prom-client';

// Create a global registry
export const register = new promClient.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
promClient.collectDefaultMetrics({ register });

// ============================================================================
// Order Metrics
// ============================================================================

/**
 * Counter for total orders placed
 */
export const ordersTotal = new promClient.Counter({
  name: 'polymarket_orders_total',
  help: 'Total number of orders placed',
  labelNames: ['side', 'result', 'mode'], // side: BUY/SELL, result: success/failure, mode: live/paper
  registers: [register],
});

/**
 * Histogram for order placement latency
 */
export const orderLatency = new promClient.Histogram({
  name: 'polymarket_order_latency_seconds',
  help: 'Order placement latency in seconds',
  labelNames: ['side', 'mode'], // side: BUY/SELL, mode: live/paper
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5], // 10ms to 5s
  registers: [register],
});

/**
 * Counter for order fills
 */
export const orderFills = new promClient.Counter({
  name: 'polymarket_order_fills_total',
  help: 'Total number of order fills',
  labelNames: ['side', 'mode'], // side: BUY/SELL, mode: live/paper
  registers: [register],
});

/**
 * Counter for order cancellations
 */
export const orderCancellations = new promClient.Counter({
  name: 'polymarket_order_cancellations_total',
  help: 'Total number of order cancellations',
  labelNames: ['reason', 'mode'], // reason: user/timeout/kill-switch, mode: live/paper
  registers: [register],
});

// ============================================================================
// WebSocket Metrics
// ============================================================================

/**
 * Gauge for WebSocket connection state
 * 0 = DISCONNECTED, 1 = CONNECTING, 2 = CONNECTED, 3 = RECONNECTING, 4 = CLOSED
 */
export const websocketState = new promClient.Gauge({
  name: 'polymarket_websocket_state',
  help: 'WebSocket connection state (0=DISCONNECTED, 1=CONNECTING, 2=CONNECTED, 3=RECONNECTING, 4=CLOSED)',
  labelNames: ['feed_type'], // feed_type: market/user/trade
  registers: [register],
});

/**
 * Counter for WebSocket reconnection attempts
 */
export const websocketReconnects = new promClient.Counter({
  name: 'polymarket_websocket_reconnects_total',
  help: 'Total number of WebSocket reconnection attempts',
  labelNames: ['feed_type', 'result'], // result: attempt/success
  registers: [register],
});

/**
 * Counter for WebSocket messages received
 */
export const websocketMessages = new promClient.Counter({
  name: 'polymarket_websocket_messages_total',
  help: 'Total number of WebSocket messages received',
  labelNames: ['feed_type', 'message_type'], // message_type: book/trade/ack/error
  registers: [register],
});

/**
 * Gauge for WebSocket connection uptime
 */
export const websocketUptime = new promClient.Gauge({
  name: 'polymarket_websocket_uptime_seconds',
  help: 'WebSocket connection uptime in seconds',
  labelNames: ['feed_type'],
  registers: [register],
});

/**
 * Counter for WebSocket errors
 */
export const websocketErrors = new promClient.Counter({
  name: 'polymarket_websocket_errors_total',
  help: 'Total number of WebSocket errors',
  labelNames: ['feed_type', 'error_type'], // error_type: connection/protocol/timeout
  registers: [register],
});

// ============================================================================
// Circuit Breaker Metrics
// ============================================================================

/**
 * Gauge for circuit breaker state
 * 0 = CLOSED (healthy), 1 = OPEN (tripped), 2 = HALF_OPEN (testing)
 */
export const circuitBreakerState = new promClient.Gauge({
  name: 'polymarket_circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
  labelNames: ['breaker_name'], // breaker_name: market-feed/trading-client/etc
  registers: [register],
});

/**
 * Counter for circuit breaker trips
 */
export const circuitBreakerTrips = new promClient.Counter({
  name: 'polymarket_circuit_breaker_trips_total',
  help: 'Total number of circuit breaker trips',
  labelNames: ['breaker_name'],
  registers: [register],
});

/**
 * Counter for circuit breaker failures
 */
export const circuitBreakerFailures = new promClient.Counter({
  name: 'polymarket_circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  labelNames: ['breaker_name'],
  registers: [register],
});

/**
 * Counter for circuit breaker successes
 */
export const circuitBreakerSuccesses = new promClient.Counter({
  name: 'polymarket_circuit_breaker_successes_total',
  help: 'Total number of circuit breaker successes',
  labelNames: ['breaker_name'],
  registers: [register],
});

// ============================================================================
// Trading Metrics
// ============================================================================

/**
 * Gauge for current open orders
 */
export const openOrders = new promClient.Gauge({
  name: 'polymarket_open_orders',
  help: 'Current number of open orders',
  labelNames: ['mode'], // mode: live/paper
  registers: [register],
});

// ============================================================================
// Orderbook Metrics
// ============================================================================

/**
 * Gauge for cached orderbooks
 */
export const cachedOrderbooks = new promClient.Gauge({
  name: 'polymarket_cached_orderbooks',
  help: 'Number of cached orderbooks',
  registers: [register],
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get metrics in Prometheus text format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics content type
 */
export function getContentType(): string {
  return register.contentType;
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}
