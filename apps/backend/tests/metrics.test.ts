import { describe, it, expect, beforeEach } from 'vitest';
import {
  register,
  ordersTotal,
  orderLatency,
  orderFills,
  orderCancellations,
  websocketState,
  websocketReconnects,
  websocketMessages,
  websocketUptime,
  websocketErrors,
  circuitBreakerState,
  circuitBreakerTrips,
  circuitBreakerFailures,
  circuitBreakerSuccesses,
  openOrders,
  positions,
  killSwitchActivations,
  killSwitchState,
  cachedOrderbooks,
  orderbookAge,
  getMetrics,
  getContentType,
  resetMetrics,
} from '../src/utils/metrics';

describe('Metrics Module', () => {
  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
  });

  describe('Basic Functionality', () => {
    it('should export Prometheus registry', () => {
      expect(register).toBeDefined();
    });

    it('should export all metric types', () => {
      expect(ordersTotal).toBeDefined();
      expect(orderLatency).toBeDefined();
      expect(orderFills).toBeDefined();
      expect(orderCancellations).toBeDefined();
      expect(websocketState).toBeDefined();
      expect(websocketReconnects).toBeDefined();
      expect(websocketMessages).toBeDefined();
      expect(websocketUptime).toBeDefined();
      expect(websocketErrors).toBeDefined();
      expect(circuitBreakerState).toBeDefined();
      expect(circuitBreakerTrips).toBeDefined();
      expect(circuitBreakerFailures).toBeDefined();
      expect(circuitBreakerSuccesses).toBeDefined();
      expect(openOrders).toBeDefined();
      expect(positions).toBeDefined();
      expect(killSwitchActivations).toBeDefined();
      expect(killSwitchState).toBeDefined();
      expect(cachedOrderbooks).toBeDefined();
      expect(orderbookAge).toBeDefined();
    });

    it('should return Prometheus content type', () => {
      const contentType = getContentType();
      expect(contentType).toContain('text/plain');
    });

    it('should return metrics in Prometheus format', async () => {
      const metrics = await getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('Order Metrics', () => {
    it('should increment order counter', async () => {
      ordersTotal.inc({ side: 'BUY', result: 'success', mode: 'live' });
      ordersTotal.inc({ side: 'SELL', result: 'success', mode: 'paper' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_orders_total');
      expect(metrics).toContain('side="BUY"');
      expect(metrics).toContain('side="SELL"');
      expect(metrics).toContain('result="success"');
    });

    it('should record order latency', async () => {
      orderLatency.observe({ side: 'BUY', mode: 'live' }, 0.5);
      orderLatency.observe({ side: 'BUY', mode: 'live' }, 1.0);
      orderLatency.observe({ side: 'BUY', mode: 'live' }, 0.3);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_order_latency_seconds');
      expect(metrics).toContain('side="BUY"');
    });

    it('should increment order fill counter', async () => {
      orderFills.inc({ side: 'BUY', mode: 'live' });
      orderFills.inc({ side: 'SELL', mode: 'paper' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_order_fills_total');
    });

    it('should increment order cancellation counter', async () => {
      orderCancellations.inc({ reason: 'user', mode: 'live' });
      orderCancellations.inc({ reason: 'kill-switch', mode: 'live' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_order_cancellations_total');
      expect(metrics).toContain('reason="user"');
      expect(metrics).toContain('reason="kill-switch"');
    });
  });

  describe('WebSocket Metrics', () => {
    it('should set WebSocket state', async () => {
      websocketState.set({ feed_type: 'market' }, 2); // CONNECTED
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_websocket_state');
      expect(metrics).toContain('feed_type="market"');
    });

    it('should increment reconnection counter', async () => {
      websocketReconnects.inc({ feed_type: 'market', result: 'success' });
      websocketReconnects.inc({ feed_type: 'market', result: 'failure' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_websocket_reconnects_total');
      expect(metrics).toContain('result="success"');
      expect(metrics).toContain('result="failure"');
    });

    it('should increment message counter', async () => {
      websocketMessages.inc({ feed_type: 'market', message_type: 'book' });
      websocketMessages.inc({ feed_type: 'market', message_type: 'trade' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_websocket_messages_total');
      expect(metrics).toContain('message_type="book"');
      expect(metrics).toContain('message_type="trade"');
    });

    it('should set WebSocket uptime', async () => {
      websocketUptime.set({ feed_type: 'market' }, 120.5);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_websocket_uptime_seconds');
    });

    it('should increment error counter', async () => {
      websocketErrors.inc({ feed_type: 'market', error_type: 'connection' });
      websocketErrors.inc({ feed_type: 'market', error_type: 'protocol' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_websocket_errors_total');
      expect(metrics).toContain('error_type="connection"');
      expect(metrics).toContain('error_type="protocol"');
    });
  });

  describe('Circuit Breaker Metrics', () => {
    it('should set circuit breaker state', async () => {
      circuitBreakerState.set({ breaker_name: 'market-feed' }, 0); // CLOSED
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_circuit_breaker_state');
      expect(metrics).toContain('breaker_name="market-feed"');
    });

    it('should increment trip counter', async () => {
      circuitBreakerTrips.inc({ breaker_name: 'market-feed' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_circuit_breaker_trips_total');
    });

    it('should increment failure counter', async () => {
      circuitBreakerFailures.inc({ breaker_name: 'market-feed' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_circuit_breaker_failures_total');
    });

    it('should increment success counter', async () => {
      circuitBreakerSuccesses.inc({ breaker_name: 'market-feed' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_circuit_breaker_successes_total');
    });
  });

  describe('Trading Metrics', () => {
    it('should set open orders gauge', async () => {
      openOrders.set({ mode: 'live' }, 5);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_open_orders');
      expect(metrics).toContain('mode="live"');
    });

    it('should increment and decrement open orders', async () => {
      openOrders.inc({ mode: 'live' });
      openOrders.inc({ mode: 'live' });
      openOrders.dec({ mode: 'live' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_open_orders');
    });

    it('should set positions gauge', async () => {
      positions.set({ mode: 'paper' }, 3);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_positions');
      expect(metrics).toContain('mode="paper"');
    });

    it('should increment kill switch activations', async () => {
      killSwitchActivations.inc({ reason: 'manual' });
      killSwitchActivations.inc({ reason: 'auto' });
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_kill_switch_activations_total');
      expect(metrics).toContain('reason="manual"');
      expect(metrics).toContain('reason="auto"');
    });

    it('should set kill switch state', async () => {
      killSwitchState.set({}, 1); // enabled
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_kill_switch_state');
    });
  });

  describe('Orderbook Metrics', () => {
    it('should set cached orderbooks gauge', async () => {
      cachedOrderbooks.set({}, 10);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_cached_orderbooks');
    });

    it('should record orderbook age histogram', async () => {
      orderbookAge.observe({ token_id: '12345' }, 5.2);
      orderbookAge.observe({ token_id: '12345' }, 10.8);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('polymarket_orderbook_age_seconds');
      expect(metrics).toContain('token_id="12345"');
    });
  });

  describe('Default Metrics', () => {
    it('should include Node.js default metrics', async () => {
      const metrics = await getMetrics();
      
      // Check for some standard Node.js metrics
      expect(metrics).toContain('process_cpu_user_seconds_total');
      expect(metrics).toContain('process_resident_memory_bytes');
      expect(metrics).toContain('nodejs_heap_size_used_bytes');
    });
  });

  describe('Metric Reset', () => {
    it('should reset all metrics', async () => {
      ordersTotal.inc({ side: 'BUY', result: 'success', mode: 'live' });
      openOrders.set({ mode: 'live' }, 10);
      
      resetMetrics();
      
      const metrics = await getMetrics();
      // After reset, counters should be 0 or not appear
      // Default metrics will still be present
      expect(metrics).toContain('process_cpu_user_seconds_total');
    });
  });
});
