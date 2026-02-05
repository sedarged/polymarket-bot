# Timer Resource Management (Audit Finding A-016)

## Overview

This document describes the timer resource management strategy implemented to prevent memory leaks in long-running processes. Addresses **Audit Finding A-016**.

## Timer Inventory

### WebSocketClient (`apps/backend/src/clients/websocket.ts`)

**Timer:** `reconnectTimer: NodeJS.Timeout | null`
- **Purpose:** Schedules reconnection attempts with exponential backoff
- **Created in:** `scheduleReconnect()` method
- **Cleared in:** 
  - `close()` method (line 222)
  - Timer callback after firing (`reconnectTimer = null` at line 176, guard at lines 178–183)

> Note: The CircuitBreaker `transitionToClosed()` method manages its own internal timers and does not clear `WebSocketClient.reconnectTimer`.

**Fix Applied:**
Added guard in timer callback to prevent reconnection if `close()` was called after the reconnect timer fired but before the callback completed:
```typescript
if (!this.shouldReconnect || this.state === WebSocketState.CLOSED) {
  logger.debug('Reconnect cancelled, client is closed');
  return;
}
```

**Race Condition Fixed:**
Previously, if `close()` was called after the reconnect timer fired but before the callback completed, the client would still attempt to reconnect. The new guard prevents this.

### RateLimiter (`apps/backend/src/utils/rateLimiter.ts`)

**Timer:** `cleanupInterval: NodeJS.Timeout`
- **Purpose:** Periodically cleans up expired rate limit entries to prevent memory leaks
- **Created in:** Constructor (line 27), runs every 60 seconds
- **Cleared in:** `stop()` method (line 101)

**Cleanup Status:** ✅ Properly cleaned up in `server/index.ts` shutdown handler (line 526)

### TradingClient Reconciliation (`apps/backend/src/clients/tradingClient.ts`)

**Timer:** `reconciliationInterval: NodeJS.Timeout | null`
- **Purpose:** Periodic reconciliation of order state with exchange
- **Created in:** `startPeriodicReconciliation()` method (line 419)
- **Cleared in:** `stopPeriodicReconciliation()` method (line 440)
- **Special:** Uses `unref()` to prevent keeping Node.js alive (line 432)

**Cleanup Status:** ✅ Properly cleaned up in `server/index.ts` shutdown handler (line 535)

### CircuitBreaker (`apps/backend/src/utils/circuitBreaker.ts`)

**Timer:** `resetTimer: NodeJS.Timeout | null`
- **Purpose:** Automatically transitions circuit from OPEN to HALF_OPEN after timeout
- **Created in:** `transitionToOpen()` method (line 197)
- **Cleared in:** 
  - `transitionToClosed()` method (line 244)
  - `destroy()` method (line 294)

**Cleanup Status:** ✅ Properly cleaned up via `tradingClient.destroy()` in shutdown (line 549)

## Shutdown Sequence

The graceful shutdown sequence in `apps/backend/src/server/index.ts` properly cleans up all timers:

1. **Rate Limiter** (line 526): `rateLimiter.stop()`
2. **Market Feed Service** (line 530): `await marketFeedService.stop()`
   - This calls `await marketFeedClient.close()`
   - Which calls `await wsClient.close()`
   - Which clears the `reconnectTimer`
3. **Trading Client Reconciliation** (line 535): `tradingClient.stopPeriodicReconciliation()`
4. **Trading Client** (line 549): `tradingClient.destroy()`
   - This calls `clobRestClient.destroy()`
   - Which calls `circuitBreaker.destroy()`
   - Which clears the `resetTimer`

## Testing

Comprehensive timer leak detection tests added in `apps/backend/tests/timer-resource-leak.test.ts`:

### Test Coverage

1. **WebSocket Timer Cleanup**
   - Clear reconnect timer when close() is called ✅
   - No reconnect after close() even if timer fires ✅
   - Multiple rapid connect/close cycles ✅
   - Cleanup when reconnect is scheduled but not yet fired ✅

2. **MarketFeedClient Cleanup**
   - Cleanup all resources on close ✅
   - Handle close during active resync ✅

3. **RateLimiter Cleanup**
   - Stop cleanup interval on stop() ✅
   - Multiple start/stop cycles ✅

4. **CircuitBreaker Cleanup**
   - Clear reset timer on destroy() ✅
   - Multiple destroy calls ✅

5. **Integration Tests**
   - Multiple services cleanup ✅
   - Cleanup in any order ✅

6. **Memory Leak Detection**
   - No timer accumulation over many cycles ✅
   - Repeated schedule/cancel cycles ✅

All tests pass successfully.

## Best Practices

### When Creating Timers

1. **Store timer reference**: Always store `setTimeout`/`setInterval` return value
   ```typescript
   this.reconnectTimer = setTimeout(() => { ... }, delay);
   ```

2. **Initialize to null**: Declare timer properties as `NodeJS.Timeout | null`
   ```typescript
   private reconnectTimer: NodeJS.Timeout | null = null;
   ```

3. **Check before creating**: Prevent duplicate timers
   ```typescript
   if (this.reconnectTimer) {
     return; // Already scheduled
   }
   ```

### When Cleaning Up Timers

1. **Always check for null**: Before clearing
   ```typescript
   if (this.reconnectTimer) {
     clearTimeout(this.reconnectTimer);
     this.reconnectTimer = null;
   }
   ```

2. **Check state in callbacks**: Guard against stale callbacks
   ```typescript
   this.timer = setTimeout(() => {
     if (!this.isActive || this.state === 'closed') {
       return; // Don't proceed if closed
     }
     // ... do work
   }, delay);
   ```

3. **Provide cleanup methods**: Always provide a way to stop/destroy
   ```typescript
   stop(): void {
     clearInterval(this.cleanupInterval);
   }
   ```

4. **Call cleanup in shutdown**: Ensure graceful shutdown calls all cleanup methods
   ```typescript
   process.on('SIGTERM', async () => {
     await service.stop();
     client.destroy();
   });
   ```

### Special Considerations

1. **Use `unref()` for non-critical timers**: Prevents keeping Node.js alive
   ```typescript
   this.interval = setInterval(() => { ... }, 60000);
   this.interval.unref();
   ```

2. **Async cleanup**: Use `async` for cleanup methods that need to wait
   ```typescript
   async close(): Promise<void> {
     clearTimeout(this.timer);
     await this.connection.close();
   }
   ```

3. **Idempotent cleanup**: Safe to call multiple times
   ```typescript
   destroy(): void {
     if (this.timer) {
       clearTimeout(this.timer);
       this.timer = null;
     }
   }
   ```

## Verification

To verify no timer leaks in production:

1. **Monitor process handles**: Use `process._getActiveHandles().length`
2. **Check event loop lag**: High lag can indicate timer buildup
3. **Memory profiling**: Use heap snapshots to detect timer leaks
4. **Log timer lifecycle**: Enable debug logs for timer creation/destruction

## Related Audit Findings

- **A-016**: Timer resource leak (FIXED)
- **A-017**: Graceful shutdown (IMPLEMENTED)
- **A-018**: Circuit breaker auto-reset (Has timer but properly cleaned up)

## References

- WebSocket reconnection: `apps/backend/src/clients/websocket.ts`
- Rate limiting: `apps/backend/src/utils/rateLimiter.ts`
- Circuit breaker: `apps/backend/src/utils/circuitBreaker.ts`
- Periodic reconciliation: `apps/backend/src/clients/tradingClient.ts`
- Graceful shutdown: `apps/backend/src/server/index.ts`
- Timer leak tests: `apps/backend/tests/timer-resource-leak.test.ts`
