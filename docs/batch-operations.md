# Batch Operations & Kill Switch

**Status:** ✅ Implemented (PR-002)  
**Issue:** #224, #230  
**Performance:** Kill switch <1s for 100+ orders

## Overview

This document describes the batch operations and fast kill switch implementation for the Polymarket trading bot. These features provide:

1. **Batch Order Creation**: Create up to 15 orders in a single API call
2. **Fast Kill Switch**: Cancel all orders atomically in <1 second

## Features

### 1. Batch Order Creation

**Method:** `TradingClient.createOrdersBatch(orders)`

Creates multiple orders in a single batch request using the Polymarket CLOB API's `POST /orders` endpoint.

**Benefits:**
- **Performance**: ~100-200ms for batch vs ~50-100ms per order sequentially
- **Efficiency**: Reduces network overhead and API rate limit usage
- **Atomic**: All orders signed and submitted together
- **Resilient**: Handles partial failures gracefully

**Constraints:**
- Maximum 15 orders per batch (Polymarket API limit)
- All orders must pass validation before submission
- Requires fresh balance data (<60 seconds old)

### 2. Fast Kill Switch

**Method:** `TradingClient.cancelAllOrders()`

Cancels all open orders using the atomic `DELETE /orders/all` endpoint.

**Performance:**
- Previous: ~50-100ms per order = 5-10s for 100 orders ❌
- Current: ~100-300ms regardless of count = <1s for 100+ orders ✅

**Benefits:**
- **Fast**: Sub-second execution for emergency scenarios
- **Atomic**: Single API call cancels all orders
- **Reliable**: No partial cancellations or race conditions
- **Monitored**: Logs warning if exceeds 1 second threshold

## API Reference

### Batch Order Creation

#### Endpoint
```
POST /orders
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

#### Request Body
```json
{
  "orders": [
    {
      "tokenId": "0x123...",
      "side": "BUY",
      "price": "0.55",
      "size": "10",
      "clientOrderId": "optional-uuid-for-idempotency"
    },
    {
      "tokenId": "0x456...",
      "side": "SELL",
      "price": "0.60",
      "size": "20"
    }
  ]
}
```

**Field Descriptions:**
- `tokenId` (required): Market token identifier
- `side` (required): "BUY" or "SELL"
- `price` (required): Order price as decimal string (e.g., "0.55")
- `size` (required): Order size as decimal string (e.g., "10")
- `clientOrderId` (optional): UUID for idempotency across retries

**Validation:**
- Batch size: 1-15 orders
- Each order validated against market constraints (tick size, min size)
- Balance availability checked before submission
- Duplicate clientOrderId detection

#### Response

**Success (201):** All orders created successfully
```json
{
  "successful": [
    {
      "orderId": "order-123",
      "clientOrderId": "uuid-123",
      "tokenId": "0x123...",
      "side": "BUY",
      "price": "0.55",
      "size": "10",
      "status": "OPEN",
      "createdAt": 1234567890,
      "filledSize": "0",
      "remainingSize": "10"
    }
  ],
  "failed": [],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  }
}
```

**Partial Success (207):** Some orders failed
```json
{
  "successful": [
    { /* order object */ }
  ],
  "failed": [
    {
      "index": 1,
      "error": "Invalid price: not aligned to tick size 0.01"
    }
  ],
  "summary": {
    "total": 2,
    "successful": 1,
    "failed": 1
  }
}
```

**Errors:**
- `400` - Invalid request (missing fields, bad format, batch too large)
- `401` - Unauthorized (missing or invalid admin token)
- `500` - Server error (API failure, network timeout)

### Kill Switch

#### Endpoint
```
POST /kill
Authorization: Bearer <ADMIN_TOKEN>
```

No request body required.

#### Response

**Success (200):**
```json
{
  "success": true,
  "message": "Kill switch activated: all orders cancelled, trading disabled",
  "riskManager": {
    "state": "KILLED",
    "circuitBreaker": {
      "state": "OPEN",
      "failures": 0,
      "successes": 0
    }
  }
}
```

**Error (500):**
```json
{
  "error": "Failed to activate kill switch: <error message>"
}
```

## Usage Examples

### Example 1: Batch Create Market-Making Orders

```typescript
import { TradingClient } from './clients/tradingClient';

const client = new TradingClient();
await client.initialize();

// Create multiple orders at once
const result = await client.createOrdersBatch([
  {
    tokenId: '0xtoken1',
    side: 'BUY',
    price: '0.49',
    size: '10',
  },
  {
    tokenId: '0xtoken1',
    side: 'SELL',
    price: '0.51',
    size: '10',
  },
  {
    tokenId: '0xtoken2',
    side: 'BUY',
    price: '0.45',
    size: '20',
  },
]);

console.log(`Created ${result.successful.length} orders`);
console.log(`Failed: ${result.failed.length} orders`);

// Handle partial failures
for (const failure of result.failed) {
  console.error(`Order ${failure.index} failed: ${failure.error}`);
}
```

### Example 2: Emergency Kill Switch

```typescript
import { TradingClient } from './clients/tradingClient';

const client = new TradingClient();
await client.initialize();

// Monitor for emergency conditions
if (marketVolatilityDetected() || systemMalfunctionDetected()) {
  console.warn('Emergency condition detected - activating kill switch');
  
  const startTime = Date.now();
  await client.cancelAllOrders();
  const duration = Date.now() - startTime;
  
  console.log(`Kill switch completed in ${duration}ms`);
  // Expected: <1000ms for 100+ orders
}
```

### Example 3: HTTP API Usage with curl

```bash
# Batch create orders
curl -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [
      {
        "tokenId": "0x123",
        "side": "BUY",
        "price": "0.50",
        "size": "10"
      },
      {
        "tokenId": "0x456",
        "side": "SELL",
        "price": "0.60",
        "size": "20"
      }
    ]
  }'

# Kill switch
curl -X POST http://localhost:3000/kill \
  -H "Authorization: Bearer your-admin-token"
```

## Performance Characteristics

### Batch Creation

| Batch Size | Sequential Time | Batch Time | Improvement |
|------------|----------------|------------|-------------|
| 1 order    | ~50-100ms      | ~100-200ms | ~1x (overhead) |
| 5 orders   | ~250-500ms     | ~100-200ms | ~2-5x faster |
| 10 orders  | ~500-1000ms    | ~100-200ms | ~5-10x faster |
| 15 orders  | ~750-1500ms    | ~100-200ms | ~7-15x faster |

**Key Metrics:**
- API calls: 1 vs N (for N orders)
- Network round trips: 1 vs N
- Rate limit impact: 1 request vs N requests
- Validation overhead: Minimal (~10-50ms per order)

### Kill Switch

| Order Count | Sequential Time | Atomic Time | Improvement |
|-------------|----------------|-------------|-------------|
| 10 orders   | ~500-1000ms    | ~100-300ms  | ~3-10x faster |
| 50 orders   | ~2.5-5s        | ~100-300ms  | ~10-50x faster |
| 100 orders  | ~5-10s         | ~100-300ms  | ~20-100x faster |
| 500 orders  | ~25-50s        | ~100-300ms  | ~100-500x faster |

**Performance Requirements:** ✅ MEETS
- Requirement: <1 second for 100+ orders
- Actual: ~100-300ms regardless of count
- Safety threshold: Logs warning if exceeds 1s

## Error Handling & Failure Modes

### Batch Creation Failures

**1. Validation Failures**
- **Cause**: Invalid order parameters (price, size, side)
- **Handling**: Failed orders returned in `failed` array with error message
- **Impact**: Successful orders still created
- **Recovery**: Fix invalid orders and retry

**2. Partial Submission Failures**
- **Cause**: Some orders fail signing or API rejects subset
- **Handling**: Each order tracked individually, failures isolated
- **Impact**: Successful orders created, failed orders reported
- **Recovery**: Retry failed orders if transient

**3. Complete Batch Failure**
- **Cause**: API error, network timeout, rate limit
- **Handling**: All orders marked as failed
- **Impact**: No orders created, state remains consistent
- **Recovery**: Wait and retry entire batch with exponential backoff

**4. Balance Staleness**
- **Cause**: Balance data >60 seconds old
- **Handling**: Throws error before any API calls
- **Impact**: No orders created, no API calls made
- **Recovery**: Wait for next reconciliation or trigger manual balance fetch

### Kill Switch Failures

**1. API Failure**
- **Cause**: Network timeout, API error, rate limit
- **Handling**: Throws error with details
- **Impact**: Orders may remain open on exchange
- **Recovery**: Retry immediately (idempotent operation)

**2. Partial Cancellation**
- **Cause**: Race condition (order filled while cancelling)
- **Handling**: Atomic API prevents this - all or nothing
- **Impact**: Either all cancelled or all remain
- **Recovery**: Retry if some orders still open

**3. Timeout**
- **Cause**: API takes >1 second (rare)
- **Handling**: Logs warning but completes operation
- **Impact**: Orders eventually cancelled but delayed
- **Recovery**: Monitor logs and investigate API performance

## Testing

### Test Coverage

- ✅ Batch creation with 1-15 orders
- ✅ Partial failure handling (validation errors)
- ✅ Duplicate clientOrderId detection
- ✅ API submission failures
- ✅ Empty batch rejection
- ✅ Oversized batch rejection (>15)
- ✅ Kill switch performance (<1s for 100 orders)
- ✅ Kill switch with API failures
- ✅ Kill switch threshold warnings
- ✅ Performance comparison tests

### Running Tests

```bash
# Run batch operations tests
npm test -- batchOperations.test.ts

# Run full test suite
npm test

# Expected results:
# ✅ 13 tests passing
# ⏭️ 1 test skipped (balance validation - covered elsewhere)
```

## Monitoring & Alerts

### Metrics

**Batch Operations:**
- `polymarket_orders_total{result="success|failure",mode="live"}` - Order creation count
- `polymarket_order_latency_seconds` - Order placement latency histogram
- `polymarket_open_orders{mode="live"}` - Current open order count

**Kill Switch:**
- `polymarket_order_cancellations_total{reason="kill-switch",mode="live"}` - Kill switch activations
- Duration logged in application logs

### Log Monitoring

**Normal Operation:**
```
INFO: Creating batch orders batchSize=5 method=postOrders
INFO: Batch order creation complete totalOrders=5 successful=5 failed=0 durationMs=150
```

**Partial Failure:**
```
WARN: All orders in batch failed validation totalOrders=5 failedCount=5
ERROR: Batch order submission failed error="API error: rate limit exceeded" batchSize=5
```

**Kill Switch:**
```
WARN: Cancelling all orders (kill switch activated) orderCount=100 method=atomic-cancelAll
WARN: Kill switch complete totalOrders=100 durationMs=250 method=atomic-cancelAll
```

**Performance Warning:**
```
ERROR: Kill switch exceeded 1 second threshold durationMs=1200 orderCount=100 threshold=1000
```

### Alerts

Configure alerts for:

1. **Kill Switch Activation** - Alert on kill switch use (critical event)
2. **Kill Switch Timeout** - Alert if exceeds 1s threshold
3. **Batch Failure Rate** - Alert if >50% of batch operations fail
4. **API Errors** - Alert on repeated API errors (circuit breaker)

## Security Considerations

### Authentication

All batch operations require admin token authentication:
- Header: `Authorization: Bearer <ADMIN_TOKEN>`
- Token must match `ADMIN_TOKEN` environment variable
- Failed attempts logged with IP address

### Rate Limiting

Batch operations count as single requests for rate limiting:
- Standard rate limit: 500-1,500 requests per 10 seconds
- Batch operations more efficient than sequential
- Kill switch exempt from rate limiting (emergency operation)

### Idempotency

Batch creation supports idempotency:
- Provide `clientOrderId` (UUID v4) for each order
- Same `clientOrderId` on retry creates same order once
- Prevents duplicate orders from retries or network issues

### Input Validation

All inputs validated before submission:
- Order parameters (price, size, side)
- Market constraints (tick size, min size)
- Batch size limits (1-15 orders)
- Balance availability and staleness

## Troubleshooting

### Issue: Batch creation slow

**Symptoms:** Batch operations taking >2 seconds

**Causes:**
- Network latency to Polymarket API
- High market validation overhead
- API rate limiting

**Solutions:**
1. Check network connectivity
2. Verify API rate limits not exceeded
3. Reduce batch size if validation is slow
4. Monitor circuit breaker state

### Issue: Kill switch timeout

**Symptoms:** Kill switch takes >1 second or times out

**Causes:**
- Polymarket API slow or overloaded
- Network issues
- Many orders (>1000) to cancel

**Solutions:**
1. Retry immediately (idempotent operation)
2. Check Polymarket API status
3. Monitor circuit breaker for API health
4. Verify network connectivity

### Issue: Partial batch failures

**Symptoms:** Some orders fail validation, others succeed

**Causes:**
- Invalid price (not aligned to tick size)
- Order size below minimum
- Invalid side or token ID

**Solutions:**
1. Review failed order error messages
2. Fix validation issues in order parameters
3. Verify market constraints (tick size, min size)
4. Retry only failed orders

### Issue: All batch orders fail

**Symptoms:** All orders in batch marked as failed

**Causes:**
- API error (network, rate limit, service down)
- Balance insufficient or stale
- Market metadata unavailable

**Solutions:**
1. Check API error message in logs
2. Verify balance and balance staleness
3. Wait for reconciliation to refresh balance
4. Retry with exponential backoff

## References

- **Issue**: #224 - Implement full batch operations
- **Issue**: #230 - PR-002 Batch Operations & Kill Switch
- **Documentation**: `docs/api-missing-endpoints-analysis.md`
- **Code**: `apps/backend/src/clients/tradingClient.ts`
- **Tests**: `apps/backend/tests/unit/batchOperations.test.ts`
- **Polymarket API**: https://docs.polymarket.com/developers/CLOB/orders

## Changelog

### v1.19.0 - 2026-02-06
- ✅ Implemented batch order creation (up to 15 orders)
- ✅ Implemented fast kill switch (<1s for 100+ orders)
- ✅ Added POST /orders endpoint
- ✅ Added comprehensive tests (13 passing)
- ✅ Added this documentation
