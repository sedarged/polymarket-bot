# ADR-0008: WebSocket Message Deduplication

## Status
Accepted

## Context
During the security audit (Finding A-010), it was identified that the WebSocket client lacks message deduplication logic. This creates a HIGH severity risk where:

1. **Duplicate messages** can be processed on WebSocket reconnect
2. **State divergence** can occur when the same orderbook update is applied multiple times
3. **Phantom fills or orders** may be recorded if messages are replayed
4. **Data integrity issues** arise from inconsistent state management

The Polymarket WebSocket API may replay messages during reconnection or catchup scenarios, especially after connection drops. Without deduplication, these replayed messages would be processed as new updates, leading to incorrect orderbook state and potentially incorrect trading decisions.

## Decision
We have implemented message deduplication in the `MarketFeedClient` using an LRU (Least Recently Used) cache approach:

### Implementation Details

1. **Message ID Generation**: 
   - Each incoming WebSocket message is assigned a unique ID based on:
     - Event type (`book`, `price_change`, `last_trade_price`)
     - Asset ID
     - Timestamp
     - Event-specific data (price, size, side for price changes; top book levels for snapshots)
   - This ensures the ID uniquely identifies the semantic content of the message

2. **LRU Cache**:
   - Uses a `Set<string>` to track processed message IDs
   - Maximum size: 10,000 messages (configurable via `MESSAGE_ID_CACHE_SIZE`)
   - When cache reaches size limit, oldest entries are removed (FIFO behavior mimics LRU)
   - Cache persists across WebSocket reconnections within the same process

3. **Deduplication Logic**:
   ```typescript
   if (this.processedMessageIds.has(messageId)) {
     logger.debug('Duplicate message ignored', { messageId });
     return; // Skip processing
   }
   ```

4. **Message ID Format**:
   - Base: `{event_type}-{asset_id}-{timestamp}`
   - Price change: `{base}-{side}-{price}-{size}`
   - Last trade: `{base}-{price}`
   - Book snapshot: `{base}-{top3bids}-{top3asks}`

### Rationale for Design Choices

**Why Set instead of Map?**
- We only need to track presence, not associated data
- Set provides O(1) lookup and insertion
- Simpler memory footprint

**Why 10,000 message cache size?**
- Typical WebSocket throughput: ~10-50 messages/second
- 10,000 messages = ~3-17 minutes of history
- Sufficient to cover most reconnection scenarios
- Low memory overhead (~500KB for IDs)
- Prevents unbounded memory growth

**Why include data in message ID?**
- Timestamp alone is insufficient (multiple events can share timestamps)
- Including price/size/side ensures semantic uniqueness
- Prevents false positives where different updates have same timestamp

**Why not use sequence numbers?**
- Polymarket WebSocket API doesn't provide sequence numbers
- Message ID generation is more flexible and works with any WebSocket provider
- Can be adapted if sequence numbers become available

## Consequences

### Positive
- ✅ **Prevents duplicate processing**: Duplicate messages are reliably rejected
- ✅ **State consistency**: Orderbook state remains accurate during reconnections
- ✅ **No external dependencies**: Pure JavaScript solution, no additional libraries
- ✅ **Configurable**: Cache size can be adjusted based on needs
- ✅ **Addresses A-010**: Fully resolves the audit finding

### Negative
- ⚠️ **Memory overhead**: 10,000 message IDs consume ~500KB RAM
- ⚠️ **False negatives possible**: After cache eviction, very old messages could be reprocessed
- ⚠️ **Process restart loses cache**: Cache doesn't persist across application restarts

### Mitigations
- Cache size is configurable and can be increased if needed
- False negatives are acceptable as they only occur for messages >10,000 messages old (17+ minutes)
- Process restarts are infrequent and typically followed by full resync anyway

## Alternatives Considered

### 1. Persist deduplication state to disk
**Rejected**: Adds complexity and I/O overhead for minimal benefit. Cache eviction is acceptable.

### 2. Use timestamp-only deduplication
**Rejected**: Insufficient granularity; multiple events can have identical timestamps.

### 3. Use Map with TTL (time-to-live)
**Rejected**: More complex; LRU approach with size limit is simpler and equally effective.

### 4. Sequence number tracking
**Rejected**: Polymarket API doesn't provide sequence numbers. Could be adopted if they become available.

## Testing
Comprehensive tests added in `tests/unit/websocket-deduplication.test.ts`:
- ✅ Duplicate message rejection (same snapshot, same price change)
- ✅ Reconnect scenarios with message replay
- ✅ Rapid message replay (catchup scenarios)
- ✅ LRU cache eviction behavior
- ✅ Edge cases (identical timestamps, concurrent duplicates)

All tests pass successfully.

## References
- **Audit Finding**: [REPORTS/AUDIT.md - A-010](../../REPORTS/AUDIT.md#a-010-high---no-websocket-message-deduplication)
- **Implementation**: `apps/backend/src/clients/marketFeed.ts`
- **Tests**: `apps/backend/tests/unit/websocket-deduplication.test.ts`
- **Related**: ADR-0007 (WebSocket Resync Race Fix)

## Author
GitHub Copilot

## Date
2026-02-04
