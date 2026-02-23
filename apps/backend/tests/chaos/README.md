# Chaos Engineering Tests

This directory contains chaos engineering tests that validate system resilience against artificial failures.

## Purpose

Chaos tests inject failures into the system to:
- Validate proper error handling and recovery
- Verify order reconciliation after failures
- Test restart and reconnection logic
- Document system behavior under adverse conditions
- Build confidence in production resilience

## Test Categories

### 1. WebSocket Failures (`websocket/`)
Tests for WebSocket connection failures and recovery:
- Sudden disconnects during critical operations
- Reconnection with exponential backoff
- Orderbook resync after reconnect
- Missed fill detection
- Heartbeat timeout handling
- Multiple rapid disconnects
- Max reconnection attempts
- State consistency after reconnect

### 2. API Failures (`api/`)
Tests for API client failures and recovery:
- Server errors (500, 502, 503)
- Timeouts and slow responses
- Rate limiting (429)
- Retry logic with exponential backoff
- Circuit breaker activation and reset
- Malformed responses
- Authentication failures
- Order reconciliation after recovery

### 3. Database/State Failures (`database/`)
Tests for persistence and state management failures:
- Order persistence failures
- State recovery after restart
- Position reconciliation
- Audit trail integrity
- Backup/restore procedures

### 4. Process/System Failures (`process/`)
Tests for process-level failures:
- Graceful shutdown
- Kill switch activation
- Startup reconciliation
- Memory leak prevention
- Resource cleanup

## Running Chaos Tests

```bash
# Run all chaos tests
npm run test:chaos

# Run specific category
npm run test:chaos -- websocket
npm run test:chaos -- api
npm run test:chaos -- database
npm run test:chaos -- process

# Run with verbose output
npm run test:chaos -- --reporter=verbose
```

## Writing Chaos Tests

### Test Structure

Each chaos test should follow this structure:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { waitForCondition, simulateNetworkLatency } from '../utils/chaosHelpers';

describe('Chaos: Feature Name', () => {
  // Setup
  beforeEach(() => {
    // Initialize test environment
  });

  afterEach(() => {
    // Clean up resources
  });

  it('should recover from [specific failure]', async () => {
    // 1. Setup normal operation
    // 2. Inject failure
    // 3. Observe system response
    // 4. Validate recovery
    // 5. Verify state consistency
  });
});
```

### Key Principles

1. **Document Expected Behavior**: Each test should clearly document what the system should do
2. **Validate Recovery**: Don't just inject failures - verify the system recovers correctly
3. **Check State Consistency**: After recovery, verify orders, positions, and state are correct
4. **Use Realistic Scenarios**: Model failures that can happen in production
5. **Measure Recovery Time**: Track how long recovery takes
6. **Test Edge Cases**: Multiple simultaneous failures, cascading failures, etc.

## Chaos Test Utilities

### `chaosHelpers.ts`

Provides utilities for:
- `simulateNetworkLatency(ms)` - Add artificial delays
- `waitForCondition(condition, timeout)` - Wait for system state
- `waitForEvent(emitter, event, timeout)` - Wait for specific events
- `CrashableWebSocketServer` - Server that can be crashed on demand
- `measureTime(operation)` - Measure recovery time
- `validateExponentialBackoff(delays)` - Verify backoff strategy

## Expected Behaviors

### WebSocket Reconnection
- **Expected**: Automatic reconnection with exponential backoff
- **Max Attempts**: Configurable (default: 10 attempts)
- **Backoff**: 1s → 2s → 4s → 8s → 16s → 30s (max)
- **Jitter**: ±10% to prevent thundering herd
- **Post-Reconnect**: Resync orderbook, positions, orders

### API Retry
- **Expected**: Retry with exponential backoff
- **Circuit Breaker**: Open after N consecutive failures
- **Rate Limit**: Respect 429 responses and retry-after headers
- **Timeout**: Fail fast on timeouts, don't block indefinitely

### Order Reconciliation
- **On Startup**: Fetch all open orders from API, reconcile with local state
- **After Reconnect**: Check for missed fills, update order status
- **Position Sync**: Recalculate positions from reconciled orders

## CI Integration

Chaos tests run in CI with `continue-on-error: true` initially to:
1. Gather baseline data on system behavior
2. Identify gaps in error handling
3. Track recovery metrics over time
4. Prevent blocking PRs while tests stabilize

Once tests are stable and passing consistently, remove `continue-on-error`.

## Chaos Playbook

When a chaos test fails:

1. **Investigate Logs**: Check what the system did when the failure was injected
2. **Reproduce Locally**: Run the specific test locally to debug
3. **Check Recovery Logic**: Is the recovery code being triggered?
4. **Verify State**: Is state being correctly maintained/restored?
5. **Update Tests**: If behavior is correct, update test expectations
6. **Fix Bugs**: If behavior is incorrect, fix the underlying issue

## Related Documentation

- [Testing Guide](../../../../docs/testing.md)
- [Decision Trees](../../../../docs/ai/decision-trees.md)
- [Common Pitfalls](../../../../docs/ai/common-pitfalls.md)
- [Troubleshooting](../../../../docs/troubleshooting.md)
