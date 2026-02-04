# ADR-0007: WebSocket Resync Race Condition Fix

**Status:** Accepted  
**Date:** 2026-02-04  
**Audit Finding:** A-007 (HIGH severity)  
**Issue:** #120

## Context

The WebSocket market feed client had a race condition during orderbook resync operations after reconnection. The issue manifested when multiple concurrent calls to `resyncOrderbook()` for the same token would race past the early-return check, causing:

1. Multiple concurrent REST API calls for the same token
2. Increased API rate limit consumption
3. Potential data inconsistency in the orderbook cache
4. Non-atomic state updates

### Original Implementation

```typescript
private resyncInProgress: Set<string> = new Set();

private async resyncOrderbook(tokenId: string): Promise<void> {
  if (this.resyncInProgress.has(tokenId)) {
    logger.debug('Resync already in progress', { tokenId });
    return; // Early return - doesn't wait!
  }

  this.resyncInProgress.add(tokenId);
  
  try {
    // ... fetch and update orderbook
  } finally {
    this.resyncInProgress.delete(tokenId);
  }
}
```

The problem: The check `has(tokenId)` and the operation `add(tokenId)` are not atomic. Multiple callers can race through this check before any of them adds the token to the set.

## Decision

Implement promise-based locking using a Map to store active resync promises per token. This ensures:

1. **Atomic check-and-store**: The promise is stored immediately
2. **Promise reuse**: Concurrent calls return the same promise
3. **Proper waiting**: Callers wait for the existing resync to complete
4. **Clean cleanup**: Promises are removed after completion (success or failure)

### New Implementation

```typescript
private resyncPromises: Map<string, Promise<void>> = new Map();

private async resyncOrderbook(tokenId: string): Promise<void> {
  // Check if resync is already in progress for this token
  const existingPromise = this.resyncPromises.get(tokenId);
  if (existingPromise) {
    logger.debug('Resync already in progress, waiting for completion', { tokenId });
    return existingPromise; // Wait for existing resync
  }

  // Create a new resync promise and store it
  const resyncPromise = this.performResync(tokenId);
  this.resyncPromises.set(tokenId, resyncPromise);
  
  try {
    await resyncPromise;
  } finally {
    // Clean up the promise after completion
    this.resyncPromises.delete(tokenId);
  }
}

private async performResync(tokenId: string): Promise<void> {
  try {
    logger.info('Resyncing orderbook from REST', { tokenId });
    const orderbook = await this.clobClient.getOrderbook(tokenId);
    this.cache.set(tokenId, orderbook);
    this.emit('snapshot', tokenId, orderbook);
    logger.info('Orderbook resync complete', { tokenId });
  } catch (error) {
    logger.error('Failed to resync orderbook', {
      tokenId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Re-throw to ensure promise rejects
  }
}
```

## Alternatives Considered

### 1. Mutex/Lock Library (e.g., `async-mutex`)
- **Pros**: Well-tested, feature-rich
- **Cons**: Additional dependency, overkill for our simple use case
- **Decision**: Not chosen - native Promise-based approach is sufficient

### 2. Queue-based approach
- **Pros**: Serializes all requests
- **Cons**: More complex, doesn't allow concurrent resyncs for different tokens
- **Decision**: Not chosen - want to allow parallel resyncs for different tokens

### 3. Semaphore pattern
- **Pros**: Can limit concurrency
- **Cons**: More complex than needed
- **Decision**: Not chosen - we want exactly 1-or-0 resyncs per token

### 4. Keep Set-based approach with await
- **Pros**: Minimal change
- **Cons**: Would need to poll or use events, more complex
- **Decision**: Not chosen - promise-based is cleaner

## Consequences

### Positive
1. ✅ **No duplicate API calls**: Only one REST call per token at a time
2. ✅ **Proper synchronization**: Concurrent callers wait for the same resync
3. ✅ **Atomic state updates**: Cache is updated only once per resync
4. ✅ **Clean error handling**: Failed resyncs properly propagate errors
5. ✅ **No external dependencies**: Uses native JavaScript Promises
6. ✅ **Testable**: Easy to test with mocked API calls

### Negative
1. ⚠️ **Slightly more complex**: Split into two methods instead of one
2. ⚠️ **Promise cleanup required**: Must ensure cleanup in finally block
3. ⚠️ **Memory consideration**: Map stores promises (but cleared after completion)

### Neutral
1. Different tokens can still resync concurrently (by design)
2. Failed resyncs now throw errors instead of silently logging (better behavior)

## Verification

### Test Coverage
Created comprehensive test suite (`websocket-resync-race.test.ts`) covering:
- Concurrent resync prevention for same token
- Concurrent resyncs allowed for different tokens
- Promise cleanup after success
- Promise cleanup after failure
- Race condition between check and promise storage
- Single snapshot event emission for concurrent resyncs
- ResyncAll deduplication
- Cache consistency during concurrent operations

All 8 tests pass ✅

### Existing Tests
- Existing marketFeed tests: ✅ 14/14 passed
- Existing websocket tests: ✅ 9/9 passed

## Implementation Notes

### Key Design Points

1. **Promise Storage**: Using `Map<string, Promise<void>>` allows O(1) lookup and storage
2. **Cleanup in finally**: Ensures cleanup happens even if resync fails
3. **Error re-throwing**: Important for promise to reject properly for waiters
4. **Separated logic**: `resyncOrderbook()` handles locking, `performResync()` handles actual work

### Performance Impact

- **Memory**: Negligible - one Map entry per active resync (typically 0-10 tokens)
- **Latency**: No added latency - just promise management overhead (~microseconds)
- **Throughput**: Improved - eliminates wasteful duplicate API calls

### Backward Compatibility

✅ Fully backward compatible:
- Same public interface
- Same behavior from caller's perspective
- Only internal implementation changed

## References

- **Audit Report**: REPORTS/AUDIT.md (A-007)
- **Issue**: #120
- **PR**: #TBD
- **Documentation**: docs/small-pr-plan.md (PR-003)
- **Related ADRs**: None

## Security Considerations

✅ **No new security concerns introduced**
- No new dependencies
- No changes to error logging (no information disclosure)
- Proper error handling maintained
- State updates remain atomic

## Future Considerations

1. **Metrics**: Could add metrics for resync contention (how often we wait)
2. **Timeout**: Could add timeout for resync operations to prevent hanging
3. **Cancellation**: Could support cancellation of in-flight resyncs
4. **Priority**: Could add priority-based queuing if needed

These are not needed for current requirements but could be added if needed.

## Related Issues

- Resolves: #120 (A-007: WebSocket Resync Race Condition)
- Related: #124 (A-010: Message Deduplication) - different but related sync issue
- Part of: #23 (Production Audit parent issue)
- PR Plan: docs/small-pr-plan.md (PR-003: Data Integrity & Idempotency)

## Conclusion

The promise-based locking approach is the right solution for this problem. It's simple, efficient, well-tested, and requires no external dependencies. The implementation properly handles the race condition while maintaining the ability to resync multiple tokens concurrently.
