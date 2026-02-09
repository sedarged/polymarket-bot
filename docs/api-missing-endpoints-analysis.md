# Critical Findings: Missing Polymarket API Endpoints

**Date:** 2026-02-06 (Original Review)
**Last Updated:** 2026-02-09 (PR-014 - Gamma API Complete)  
**Review Type:** Comprehensive API Alignment Review  
**Reviewer:** GitHub Copilot  
**Issue:** #116

**UPDATE (2026-02-09 - PR-014):**
- ✅ All Gamma API endpoints now implemented (13 of 14, 93% coverage)
- ✅ User WebSocket channel implemented with authentication
- ✅ Historical data and replay functionality complete
- ✅ Overall API coverage increased from ~30% to ~85%

---

## 🚨 Critical Issues Found

### 1. Missing CLOB API Endpoints (High Priority)

#### A. Read Endpoints (Public - No Authentication)

| Endpoint | Purpose | Priority | Implementation Status | Impact |
|----------|---------|----------|----------------------|---------|
| **GET /price** | Get current best executable price | **HIGH** | ❌ Missing | Currently deriving from orderbook inefficiently |
| **GET /midpoint** | Get midpoint between bid/ask | **MEDIUM** | ❌ Missing | Calculating manually |
| **GET /lasttrade** | Get most recent trade price | **MEDIUM** | ❌ Missing | No last trade tracking |
| **GET /prices/history** | Historical price data | **LOW** | ❌ Missing | No historical analysis capability |
| **GET /spread** | Get bid-ask spread | **MEDIUM** | ❌ Missing | Calculating manually |

**Why These Matter:**
- **/price** provides optimized price discovery without fetching full orderbook
- **/lasttrade** needed for accurate market tracking and analytics
- **/spread** useful for liquidity analysis and trading decisions
- Missing these increases network overhead and latency

#### B. Batch Endpoints

| Endpoint | Purpose | Priority | Implementation Status | Impact |
|----------|---------|----------|----------------------|---------|
| **POST /orders** | Create multiple orders in one call | **HIGH** | ❌ Missing | Sequential submission = higher latency |
| **POST /orders/batchcancel** | Cancel multiple orders efficiently | **HIGH** | ❌ Missing | Kill switch uses sequential cancellation |
| **DELETE /orders** | Cancel multiple orders | **HIGH** | ❌ Missing | Same as batchcancel |
| **DELETE /orders/market** | Cancel all orders for specific market | **MEDIUM** | ❌ Missing | No market-specific cancellation |
| **DELETE /orders/all** | Cancel all open orders across all markets | **MEDIUM** | ❌ Missing | Using sequential approach |

**Why These Matter:**
- Batch operations critical for market-making strategies
- Sequential operations have ~50-100ms per order vs <10ms for batch
- Kill switch would be much faster with batch cancellation
- Current implementation may miss price opportunities

### 2. Missing Data API Endpoints (Critical for Trading)

**New Discovery:** Polymarket has a separate Data API (`https://data-api.polymarket.com`) that is NOT implemented at all.

| Endpoint | Purpose | Priority | Implementation Status | Impact |
|----------|---------|----------|----------------------|---------|
| **GET /positions** | Get current open positions for wallet | **CRITICAL** | ❌ Missing | No position tracking |
| **GET /activity** | Get user activity history | **HIGH** | ❌ Missing | Limited audit trail |
| **GET /trades** | Get trade history for wallet | **HIGH** | ❌ Missing | Missing fill history |

**Why These Are CRITICAL:**
- Current implementation lacks native position tracking
- Positions calculated from fills, but no verification against exchange
- Risk of position drift if fills are missed
- No way to validate actual exchange state
- **RECOMMENDATION:** Implement Data API for position reconciliation

### 3. Missing Account API (Balance Management)

**New Discovery:** Account API exists for balance operations.

| Endpoint | Purpose | Priority | Implementation Status | Impact |
|----------|---------|----------|----------------------|---------|
| **Account API /balance** | Get wallet balance | **HIGH** | ❌ Missing separate API | Using SDK method only |
| **Account API /allowance** | Get/update allowance | **MEDIUM** | ❌ Missing separate API | SDK handles internally |

**Current State:**
- TradingClient uses SDK's `getBalanceAllowance()` method
- No direct API access to balance endpoints
- Potential issue if SDK doesn't expose all functionality

---

## 📊 Implementation Gap Analysis

### Current vs Complete API Coverage

**CLOB API Coverage:**
- ✅ Implemented: 8 endpoints (/book, /tick-size, /price, /lasttrade, /spread, /midpoint, /prices/history, /orders/market)
- ❌ Missing: 4 endpoints (batch operations, some advanced features)
- **Coverage: ~67%** (was ~15%)

**Gamma API Coverage:**
- ✅ Implemented: 13 endpoints (PR-014 complete)
  - /markets, /events ✅
  - /account/{address}, /accounts ✅ (PR-014)
  - /market/{id}, /market/{id}/history, /market/{id}/replay ✅ (PR-014)
  - /series, /series/{id} ✅ (PR-014)
  - /tags, /tag/{id} ✅ (PR-014)
  - /event/{id} ✅ (PR-014)
  - /replay, /history ✅ (PR-014)
- ❌ Missing: 1 endpoint (/search - low priority)
- **Coverage: ~93%** (was ~22%) 🎉

**Data API Coverage:**
- ✅ Implemented: 3/3 endpoints (PR-001)
- **Coverage: 100%**

**Account API Coverage:**
- ⚠️ Partial via SDK only
- **Coverage: ~50% (via SDK)**

**Overall API Coverage: ~85%** (up from ~30%)

---

## 🎯 Prioritized Recommendations

### Priority 1 - CRITICAL (Implement Immediately)

#### 1.1 Data API Client (NEW)
```typescript
// apps/backend/src/clients/dataApi.ts

export class DataApiClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: 'https://data-api.polymarket.com',
      timeout: 10000,
    });
  }
  
  /**
   * Get current positions for a wallet
   * CRITICAL for position reconciliation
   */
  async getPositions(address: string): Promise<Position[]> {
    const response = await this.client.get<Position[]>('/positions', {
      params: { address }
    });
    return response.data;
  }
  
  /**
   * Get trade history for a wallet
   * CRITICAL for fill verification
   */
  async getTrades(address: string, params?: {
    market?: string;
    limit?: number;
    offset?: number;
  }): Promise<Trade[]> {
    const response = await this.client.get<Trade[]>('/trades', {
      params: { address, ...params }
    });
    return response.data;
  }
  
  /**
   * Get activity history
   */
  async getActivity(address: string): Promise<Activity[]> {
    const response = await this.client.get<Activity[]>('/activity', {
      params: { address }
    });
    return response.data;
  }
}
```

**Why Critical:**
- Currently no way to verify positions against exchange
- Risk of position drift if reconciliation misses fills
- Essential for production trading

#### 1.2 Batch Order Operations
```typescript
// apps/backend/src/clients/clob.ts

/**
 * Create multiple orders in one API call
 * Up to 15 orders per batch (per official docs)
 */
async createOrderBatch(orders: OrderRequest[]): Promise<Order[]> {
  if (orders.length > 15) {
    throw new Error('Maximum 15 orders per batch');
  }
  
  const response = await this.client.post('/orders', { orders });
  return response.data;
}

/**
 * Cancel multiple orders efficiently
 */
async cancelOrdersBatch(orderIds: string[]): Promise<void> {
  await this.client.post('/orders/batchcancel', { orderIds });
}

/**
 * Cancel all orders for a specific market
 */
async cancelMarketOrders(tokenId: string): Promise<void> {
  await this.client.delete('/orders/market', {
    params: { token_id: tokenId }
  });
}

/**
 * Cancel all open orders (improved kill switch)
 */
async cancelAllOrders(): Promise<void> {
  await this.client.delete('/orders/all');
}
```

**Why Critical:**
- Current kill switch is slow (sequential cancellation)
- Market-making strategies need batch order placement
- Can reduce latency by 10-50x for multi-order operations

#### 1.3 Price Endpoint
```typescript
// apps/backend/src/clients/clob.ts

/**
 * Get current best executable price
 * More efficient than fetching full orderbook
 */
async getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<string> {
  const response = await this.client.get<{ price: string }>('/price', {
    params: { 
      token_id: tokenId,
      side 
    }
  });
  return response.data.price;
}
```

**Why Critical:**
- Currently fetching full orderbook just to get price
- Wastes bandwidth and increases latency
- Official endpoint is optimized for this use case

### Priority 2 - HIGH (Implement Soon)

#### 2.1 Trade and Spread Endpoints
```typescript
/**
 * Get last trade price
 */
async getLastTrade(tokenId: string): Promise<{ price: string; timestamp: number }> {
  const response = await this.client.get('/lasttrade', {
    params: { token_id: tokenId }
  });
  return response.data;
}

/**
 * Get bid-ask spread
 */
async getSpread(tokenId: string): Promise<{ spread: string; bid: string; ask: string }> {
  const response = await this.client.get('/spread', {
    params: { token_id: tokenId }
  });
  return response.data;
}
```

#### 2.2 User WebSocket (From Previous Review)
- Real-time order and fill updates
- Reduces need for polling
- See RESEARCH_REVIEW.md Section 5.2.1

### Priority 3 - MEDIUM (Plan for Future)

#### 3.1 Historical Data
```typescript
/**
 * Get historical price data
 */
async getPriceHistory(tokenId: string, params: {
  interval: '1m' | '1h' | '6h' | '1d' | '1w';
  startTs?: number;
  endTs?: number;
}): Promise<PricePoint[]> {
  const response = await this.client.get('/prices/history', {
    params: { token_id: tokenId, ...params }
  });
  return response.data;
}
```

#### 3.2 Complete Gamma API Coverage
- Slug-based lookups
- Tag filtering
- Search endpoint
- See RESEARCH_REVIEW.md Section 5.3.2

---

## 🔧 Issues Found in Current Implementation

### Issue 1: Inefficient Price Discovery
**Problem:** Fetching full orderbook to get best price  
**Impact:** Higher latency, unnecessary bandwidth usage  
**Fix:** Implement GET /price endpoint

### Issue 2: Slow Kill Switch
**Problem:** Sequential order cancellation (50-100ms per order)  
**Impact:** In emergency, may take 5-10 seconds to cancel 100 orders  
**Fix:** Implement DELETE /orders/all endpoint

### Issue 3: No Position Verification
**Problem:** Positions calculated from fills only, no exchange verification  
**Impact:** Risk of position drift, no ground truth  
**Fix:** Implement Data API GET /positions endpoint

### Issue 4: Missing Fill Verification
**Problem:** No way to query exchange for actual trades  
**Impact:** If reconciliation misses a fill, position is wrong  
**Fix:** Implement Data API GET /trades endpoint

### Issue 5: Gamma Client Missing Circuit Breaker
**Problem:** GammaClient has retry logic but no circuit breaker  
**Impact:** Cascading failures if Gamma API has issues  
**Contrast:** ClobClient has circuit breaker implemented  
**Fix:** Add CircuitBreaker to GammaClient like ClobClient

```typescript
// apps/backend/src/clients/gamma.ts - ISSUE FOUND

export class GammaClient {
  private client: AxiosInstance;
  // ❌ MISSING: private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = axios.create({
      baseURL: config.gammaApiUrl,
      timeout: 10000,
    });
    // ❌ MISSING: Circuit breaker initialization
  }
  
  // Methods use retry() but not wrapped in circuitBreaker.execute()
}
```

---

## 📋 Complete Missing Endpoint List

### CLOB API (https://clob.polymarket.com)

**Read Endpoints:**
1. ❌ GET /price - Current best price
2. ❌ GET /midpoint - Midpoint price
3. ❌ GET /lasttrade - Last trade price
4. ❌ GET /prices/history - Historical prices
5. ❌ GET /spread - Bid-ask spread

**Write Endpoints:**
6. ❌ POST /orders - Batch create orders (up to 15)
7. ❌ POST /orders/batchcancel - Batch cancel orders
8. ❌ DELETE /orders - Cancel multiple orders
9. ❌ DELETE /orders/market - Cancel all orders for market
10. ❌ DELETE /orders/all - Cancel all open orders

### Data API (https://data-api.polymarket.com) - NOT IMPLEMENTED

**Critical Endpoints:**
1. ❌ GET /positions - Get wallet positions
2. ❌ GET /trades - Get trade history
3. ❌ GET /activity - Get activity history

**Impact:** No position verification or trade history capability

### Gamma API (https://gamma-api.polymarket.com)

**Optional Endpoints:**
1. ❌ GET /markets/{id} - Market by ID
2. ❌ GET /events/{id} - Event by ID
3. ❌ GET /markets/slug/{slug} - Market by slug
4. ❌ GET /events/slug/{slug} - Event by slug
5. ❌ GET /tags - Available tags
6. ❌ GET /series - Event series
7. ❌ GET /search - Search markets/events

---

## 🎯 Recommended Action Plan

### Phase 1 - Critical Fixes (Week 1)
1. **Implement Data API Client**
   - GET /positions
   - GET /trades
   - GET /activity
   - Integrate with reconciliation service

2. **Add Circuit Breaker to GammaClient**
   - Match ClobClient pattern
   - Add metrics and monitoring

3. **Implement Batch Operations in ClobClient**
   - POST /orders (batch create)
   - DELETE /orders/all (improved kill switch)

### Phase 2 - High Priority (Week 2)
1. **Implement Core Price Endpoints**
   - GET /price
   - GET /lasttrade
   - GET /spread

2. **Enhance TradingClient**
   - Use batch operations for multi-order placement
   - Use /orders/all for kill switch

### Phase 3 - Medium Priority (Week 3-4)
1. **Historical Data Support**
   - GET /prices/history
   - Analytics and backtesting support

2. **User WebSocket Channel**
   - Real-time order/fill updates
   - Reduce polling overhead

### Phase 4 - Low Priority (Future)
1. **Complete Gamma API Coverage**
2. **Advanced Order Types** (GTD, FOK, FAK)
3. **Additional Optimization**

---

## 📈 Expected Impact

### After Phase 1 Implementation:
- ✅ Position verification against exchange
- ✅ Fill history validation
- ✅ 10-50x faster kill switch
- ✅ Circuit breaker on all API clients
- ✅ Batch order placement capability

### After Phase 2 Implementation:
- ✅ Efficient price discovery
- ✅ Reduced network overhead
- ✅ Better market analytics

### API Coverage After All Phases:
- **CLOB API:** ~75% (from 15%)
- **Gamma API:** ~35% (from 22%)
- **Data API:** ~100% (from 0%)
- **Overall:** ~65% complete coverage

---

## 🔍 Testing Requirements

For each new endpoint, add:
1. Unit tests with mocked responses
2. Integration tests with error scenarios
3. Rate limit testing
4. Circuit breaker testing (where applicable)
5. Documentation in api-alignment.test.ts

---

## 📚 References

**Official Documentation:**
- CLOB API: https://docs.polymarket.com/quickstart/reference/endpoints
- Trading Docs: https://docs.polymarket.com/developers/market-makers/trading
- Data API: https://data-api.polymarket.com
- Account API: https://docs.polymarket.us/api-reference/account/overview

**Implementation Reference:**
- Python CLOB Client: https://github.com/Polymarket/py-clob-client
- Existing Review: REPORTS/RESEARCH_REVIEW.md

---

## ✅ Conclusion

**Key Finding:** Implementation has significant gaps beyond optional features:
1. **Data API not implemented** - Critical for position verification
2. **Batch operations missing** - Impacts performance and safety
3. **Price endpoints missing** - Inefficient resource usage
4. **GammaClient missing circuit breaker** - Reliability issue

**Recommendation:** Prioritize Phase 1 implementation before production deployment.
