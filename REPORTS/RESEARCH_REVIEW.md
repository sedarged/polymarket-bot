# Polymarket CLOB/Gamma API Documentation Alignment Review

**Date:** 2026-02-01  
**Reviewer:** GitHub Copilot Agent  
**Status:** Complete  
**Version:** 1.0

---

## Executive Summary

This document provides a comprehensive review of the Polymarket trading bot repository implementation against official Polymarket API documentation. The review covers CLOB API, Gamma API, and Polygon integration, identifying alignment status, discrepancies, and recommendations for improvement.

**Overall Assessment:** The repository demonstrates **strong alignment** with official Polymarket APIs with only **minor discrepancies** in error handling completeness and rate limiting visibility. The implementation follows best practices and leverages the official `@polymarket/clob-client` SDK.

---

## Table of Contents

1. [Official Documentation Catalogue](#official-documentation-catalogue)
2. [Implementation Analysis](#implementation-analysis)
3. [Comparison Results](#comparison-results)
4. [Discrepancies and Gaps](#discrepancies-and-gaps)
5. [Recommendations](#recommendations)
6. [Cross-References](#cross-references)

---

## Official Documentation Catalogue

### 1. CLOB API Documentation

**Base URL:** `https://clob.polymarket.com`

#### Authentication Documentation
- **URL:** https://docs.polymarket.com/developers/CLOB/authentication
- **Key Concepts:**
  - **L1 Authentication:** Wallet signature-based (EIP-712) for credential derivation
  - **L2 Authentication:** API Key + Secret + Passphrase using HMAC-SHA256
  - Headers: `POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_NONCE`
- **Endpoints:**
  - `POST /auth/api-key` - Create API credentials
  - `GET /auth/derive-api-key` - Derive API credentials

#### Order Management Documentation
- **URL:** https://docs.polymarket.com/developers/CLOB/orders/create-order
- **Key Endpoints:**
  - `POST /order` - Create single order
  - `POST /orders` - Batch create orders (up to 15 per batch)
  - `DELETE /order/{orderId}` - Cancel single order
  - `DELETE /orders` - Cancel multiple orders
  - `GET /orders` - List open orders
- **Order Types:** GTC, GTD, FOK, FAK
- **Features:** `postOnly` flag, `clientOrderId` for idempotency

#### Rate Limits Documentation
- **URL:** https://docs.polymarket.com/quickstart/introduction/rate-limits
- **Limits (per 10 seconds):**
  - General CLOB: 9,000 requests
  - GET Balance Allowance: 200 requests
  - UPDATE Balance Allowance: 50 requests
  - Market Data Endpoints: 500-1,500 requests
  - Ledger Endpoints: 900 requests
- **Throttling:** Cloudflare-based; requests are queued, not rejected
- **Response:** HTTP 429 when rate limited

#### Error Handling Documentation
- **Common Error Codes:**
  - 401 Unauthorized - Invalid API credentials
  - 400 Bad Request - Validation errors (e.g., price out of bounds)
  - 429 Too Many Requests - Rate limit exceeded
- **Response Format:** `{ "success": false, "errorMsg": "<reason>" }`

### 2. Gamma API Documentation

**Base URL:** `https://gamma-api.polymarket.com`

#### Market Discovery Documentation
- **URL:** https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide
- **URL:** https://docs.polymarket.com/developers/gamma-markets-api/gamma-structure
- **Key Endpoints:**
  - `GET /markets` - List all markets
  - `GET /markets/slug/{slug}` - Get market by slug
  - `GET /events` - List all events
  - `GET /events/slug/{slug}` - Get event by slug
  - `GET /tags` - Get available tags
  - `GET /sports` - Get sports tags
- **Query Parameters:**
  - `active` - Filter by active status
  - `closed` - Filter by closed status
  - `limit` - Pagination limit
  - `offset` - Pagination offset
  - `order` - Sort order
  - `tag_id` - Filter by tag

#### Market Structure Documentation
- **URL:** https://docs.polymarket.com/developers/gamma-markets-api/gamma-structure
- **Relationships:**
  - Events contain Markets
  - Markets contain Tokens
  - Tags categorize Events and Markets

### 3. WebSocket API Documentation

**Market Data URL:** `wss://ws-subscriptions-clob.polymarket.com/ws/market`  
**User Data URL:** `wss://ws-subscriptions-clob.polymarket.com/ws/user`

#### WebSocket Documentation
- **URL:** https://docs.polymarket.com/developers/CLOB/websocket/wss-overview
- **URL:** https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart
- **Subscription Format (Market):**
  ```json
  {
    "type": "market",
    "assets_ids": ["<asset_id_1>", "<asset_id_2>"]
  }
  ```
- **Message Types:**
  - `book` - Full orderbook snapshot
  - `price_change` - Incremental price level update
  - `last_trade_price` - Last trade price update
- **Best Practices:**
  - Implement reconnection with exponential backoff
  - Resync orderbook state after reconnection
  - Send periodic pings (every 10s) to keep connection alive
  - Batch subscriptions where possible

#### Rate Limits (WebSocket)
- **Documentation:** Not explicitly specified in official docs
- **Community Guidance:**
  - Limit simultaneous connections
  - Avoid excessive subscription/unsubscription requests
  - Batch subscriptions (typically 50-100 assets per connection)

### 4. Polygon Integration Documentation

**Network:** Polygon Mainnet  
**Chain ID:** 137  
**Documentation:** https://docs.polymarket.com/developers/CLOB/introduction

#### Key Points:
- All trading occurs on Polygon (Chain ID 137)
- USDC is the settlement currency
- Orders are signed using EIP-712 structured data
- Wallet must be funded with USDC on Polygon
- Compatible with Ethereum-compatible wallets

---

## Implementation Analysis

### 1. CLOB Client Implementation

**File:** `apps/backend/src/clients/clob.ts`

#### Current Implementation:
```typescript
export class ClobClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.clobApiUrl, // https://clob.polymarket.com
      timeout: 10000,
    });
  }

  async getOrderbook(tokenId: string): Promise<Orderbook> {
    return retry(async () => {
      const response = await this.client.get<Orderbook>(`/book`, {
        params: { token_id: tokenId },
      });
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }
}
```

#### Alignment Status: ✅ **ALIGNED**
- Uses correct base URL
- Correct endpoint: `GET /book`
- Proper query parameter: `token_id`
- Implements retry logic for reliability
- Uses axios for HTTP requests

#### Notes:
- Limited to read-only orderbook fetching
- Write operations (order placement) handled by `@polymarket/clob-client` SDK in `tradingClient.ts`

### 2. Gamma Client Implementation

**File:** `apps/backend/src/clients/gamma.ts`

#### Current Implementation:
```typescript
export class GammaClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.gammaApiUrl, // https://gamma-api.polymarket.com
      timeout: 10000,
    });
  }

  async getActiveMarkets(limit?: number): Promise<Market[]> {
    return retry(async () => {
      const response = await this.client.get<Market[]>('/markets', {
        params: {
          active: true,
          closed: false,
          ...(limit && { limit }),
        },
      });
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }

  async getEvents(limit?: number): Promise<Event[]> {
    return retry(async () => {
      const response = await this.client.get<Event[]>('/events', {
        params: {
          active: true,
          closed: false,
          ...(limit && { limit }),
        },
      });
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }
}
```

#### Alignment Status: ✅ **ALIGNED**
- Uses correct base URL
- Correct endpoints: `/markets`, `/events`
- Proper query parameters: `active`, `closed`, `limit`
- Implements retry logic
- Follows official market discovery patterns

#### Notes:
- Does not implement slug-based lookups (not required for current use case)
- Does not implement tag filtering (not required for current use case)
- Pagination with `offset` not implemented (use `limit` only)

### 3. WebSocket Implementation

**File:** `apps/backend/src/clients/marketFeed.ts`

#### Current Implementation:
```typescript
export class MarketFeedClient extends EventEmitter {
  private wsClient: WebSocketClient;
  private cache: OrderbookCache;
  private clobClient: ClobClient;
  private tokenIds: string[];

  constructor(options: MarketFeedOptions) {
    super();
    this.wsClient = new WebSocketClient({
      url: options.url, // wss://ws-subscriptions-clob.polymarket.com/ws/market
      reconnectDelay: options.reconnectDelay,
      maxReconnectDelay: options.maxReconnectDelay,
    });
    this.setupEventHandlers();
  }

  private subscribe(): void {
    const subscription: WSMarketSubscription = {
      type: 'market',
      assets_ids: this.tokenIds,
    };
    this.wsClient.send(subscription);
    this.isSubscribed = true;

    if (this.cache.size() > 0) {
      this.resyncAll();
    }
  }

  private handleMessage(message: WSMarketMessage): void {
    switch (message.event_type) {
      case 'book':
        this.handleSnapshot(message as WSOrderbookSnapshot);
        break;
      case 'price_change':
        this.handlePriceChange(message as WSPriceChange);
        break;
      case 'last_trade_price':
        // Logged but not processed
        break;
    }
  }

  private async resyncOrderbook(tokenId: string): Promise<void> {
    const orderbook = await this.clobClient.getOrderbook(tokenId);
    this.cache.set(tokenId, orderbook);
    this.emit('snapshot', tokenId, orderbook);
  }
}
```

#### Alignment Status: ✅ **STRONGLY ALIGNED**
- Correct WebSocket URL
- Correct subscription message format: `{ type: 'market', assets_ids: [...] }`
- Handles all documented message types: `book`, `price_change`, `last_trade_price`
- Implements reconnection logic (via `WebSocketClient`)
- Implements resync after reconnect using REST API fallback
- Follows best practices from official documentation

#### Excellent Practices:
- ✅ Automatic reconnection with exponential backoff
- ✅ State resync after connection loss
- ✅ REST API fallback for orderbook refresh
- ✅ Idempotent resync operations (tracked via `resyncInProgress` set)
- ✅ Event-driven architecture for updates

### 4. Trading Client Implementation

**File:** `apps/backend/src/clients/tradingClient.ts`

#### Current Implementation:
```typescript
export class TradingClient {
  private client: ClobClient | null = null;
  private wallet: ethers.Wallet | null = null;

  async initialize(): Promise<void> {
    assertLiveTradingEnabled();
    
    this.wallet = new ethers.Wallet(config.privateKey);
    this.client = new ClobClient(
      config.clobApiUrl, // https://clob.polymarket.com
      config.chainId,    // 137 (Polygon Mainnet)
      this.wallet
    );

    await this.reconcile();
  }

  async createOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: string,
    size: string
  ): Promise<Order> {
    assertLiveTradingEnabled();
    
    const clientOrderId = `order-${Date.now()}-${process.pid}-${this.orderIdCounter++}`;
    
    const response = await this.client.createOrder({
      tokenID: tokenId,
      side: side === 'BUY' ? 'BUY' : 'SELL',
      price: Number(price),
      size: Number(size),
      clientOrderId,
    });

    return order;
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.client.cancelOrder(orderId);
  }

  async cancelAllOrders(): Promise<void> {
    const openOrders = this.state.orders.filter(o => o.status === 'OPEN');
    const cancellationPromises = openOrders.map(order =>
      this.cancelOrder(order.orderId).catch(...)
    );
    await Promise.allSettled(cancellationPromises);
  }
}
```

#### Alignment Status: ✅ **FULLY ALIGNED**
- Uses official `@polymarket/clob-client` SDK (v5.2.1)
- Correct Chain ID: 137 (Polygon Mainnet)
- Proper authentication flow: L1 wallet → L2 API credentials (handled by SDK)
- Implements `clientOrderId` for idempotency
- Implements startup reconciliation
- Parallel order cancellation for kill switch
- Uses ethers.js for wallet management

#### Security Alignment:
- ✅ Live trading gated by `LIVE_TRADING=true` AND `COMPLIANCE_ACCEPTED=true`
- ✅ Private key validation
- ✅ Fail-closed design
- ✅ Kill switch capability

### 5. Configuration Implementation

**File:** `apps/backend/src/config/index.ts`

#### Current Implementation:
```typescript
const envSchema = z.object({
  GAMMA_API_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  CLOB_API_URL: z.string().url().default('https://clob.polymarket.com'),
  WS_MARKET_URL: z.string().url().default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  TOKEN_IDS: z.string().default(''),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  RETRY_ATTEMPTS: numberFromEnv(3, z.number().int().positive()),
  RETRY_DELAY: numberFromEnv(1000, z.number().int().nonnegative()),
  LIVE_TRADING: booleanFromEnv.default(false),
  COMPLIANCE_ACCEPTED: booleanFromEnv.default(false),
  PORT: numberFromEnv(3000, z.number().int().positive()),
  PRIVATE_KEY: z.string().optional(),
  CHAIN_ID: numberFromEnv(137, z.number().int().positive()),
  // ... risk management and paper trading configs
});
```

#### Alignment Status: ✅ **FULLY ALIGNED**
- Correct default URLs for all Polymarket APIs
- Correct Chain ID default: 137
- Proper validation with Zod
- Security-first defaults (LIVE_TRADING and COMPLIANCE_ACCEPTED both false)
- Comprehensive environment variable documentation

---

## Comparison Results

### Summary Table

| Component | Implementation Status | Official API Alignment | Notes |
|-----------|----------------------|----------------------|-------|
| **CLOB Client** | ✅ Implemented | ✅ Fully Aligned | Read-only operations via REST |
| **Gamma Client** | ✅ Implemented | ✅ Fully Aligned | Market discovery and events |
| **WebSocket Feed** | ✅ Implemented | ✅ Strongly Aligned | Excellent reconnection & resync |
| **Trading Client** | ✅ Implemented | ✅ Fully Aligned | Uses official SDK |
| **Authentication** | ✅ Implemented | ✅ Fully Aligned | L1/L2 via official SDK |
| **Configuration** | ✅ Implemented | ✅ Fully Aligned | Correct defaults & validation |
| **Error Handling** | ⚠️ Partial | ⚠️ Needs Enhancement | See [Discrepancies](#discrepancies-and-gaps) |
| **Rate Limiting** | ⚠️ Basic | ⚠️ Needs Enhancement | See [Discrepancies](#discrepancies-and-gaps) |
| **Polygon Integration** | ✅ Implemented | ✅ Fully Aligned | Chain ID 137, correct setup |

### Detailed Comparison

#### ✅ Strengths (Aligned with Official Specs)

1. **API Endpoints:** All endpoints match official documentation exactly
2. **WebSocket Protocol:** Subscription format and message handling are correct
3. **Authentication:** Leverages official `@polymarket/clob-client` SDK for L1/L2 auth
4. **Reconnection Logic:** Implements best practices with exponential backoff and resync
5. **Idempotency:** Uses `clientOrderId` for order placement
6. **Security:** Dual-gate system for live trading (LIVE_TRADING + COMPLIANCE_ACCEPTED)
7. **Blockchain Integration:** Correct Chain ID and wallet management

#### ⚠️ Areas for Enhancement

1. **Rate Limit Handling:** Basic retry logic exists but no explicit rate limit awareness
2. **Error Code Mapping:** Generic error handling without specific HTTP status code handling
3. **Batch Operations:** Not implemented (CLOB supports up to 15 orders per batch)
4. **WebSocket User Channel:** Not implemented (only market data, no private user feed)

---

## Discrepancies and Gaps

### 1. Rate Limiting Implementation

**Discrepancy Type:** Implementation Gap

**Official Specification:**
- CLOB API: 9,000 requests per 10 seconds (general)
- Specific endpoints have lower limits (200-900 requests per 10 seconds)
- Cloudflare throttling queues requests rather than rejecting them
- HTTP 429 response when rate limited

**Current Implementation:**
```typescript
// apps/backend/src/utils/retry.ts
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, delay = 1000 } = options;
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Gap:**
- No awareness of rate limit headers or HTTP 429 responses
- Fixed delay between retries (no exponential backoff for rate limits)
- No request queuing or throttling to prevent hitting limits
- No tracking of request rates per endpoint

**Impact:** Low-Medium
- Current implementation will retry on any error, including 429
- Fixed delay may not be optimal for rate limit recovery
- No proactive rate limit avoidance

**Recommendation:** See [Recommendations](#recommendations) section

### 2. Error Handling Specificity

**Discrepancy Type:** Implementation Gap

**Official Specification:**
- 401 Unauthorized - Invalid API credentials
- 400 Bad Request - Validation errors with `errorMsg`
- 429 Too Many Requests - Rate limit exceeded
- Response format: `{ "success": false, "errorMsg": "<reason>" }`

**Current Implementation:**
```typescript
// Generic error handling in retry wrapper
catch (error) {
  logger.error('Failed to create order', {
    error: error instanceof Error ? error.message : String(error),
    tokenId, side, price, size,
  });
  throw error;
}
```

**Gap:**
- No differentiation between error types (401 vs 400 vs 429)
- No parsing of structured error responses (`success`, `errorMsg`)
- No specific handling for authentication failures vs validation errors
- Error messages are generic without context from API response

**Impact:** Low
- Errors are logged and propagated correctly
- Retry logic will handle transient failures
- Debugging may be more difficult without structured error info

**Recommendation:** See [Recommendations](#recommendations) section

### 3. Batch Order Operations

**Discrepancy Type:** Feature Gap (Non-Critical)

**Official Specification:**
- CLOB API supports: `POST /orders` (batch create up to 15 orders)
- Reduces API calls and improves efficiency
- Useful for market-making strategies

**Current Implementation:**
- Only single order creation: `POST /order`
- No batch order creation or cancellation

**Gap:**
- Missing batch order creation endpoint
- Market-making strategies may be less efficient

**Impact:** Low
- Single order operations work correctly
- Batch operations are an optimization, not a requirement
- Current rate limits (9,000 req/10s) sufficient for most use cases

**Recommendation:** Implement batch operations when scaling strategies that need high order throughput

### 4. WebSocket User Channel

**Discrepancy Type:** Feature Gap (Planned)

**Official Specification:**
- WebSocket endpoint: `wss://ws-subscriptions-clob.polymarket.com/ws/user`
- Provides real-time updates on user's orders and fills
- Requires L2 authentication

**Current Implementation:**
- Only market data WebSocket implemented
- Order updates fetched via reconciliation (REST polling)

**Gap:**
- No real-time order fill notifications
- Must poll REST API for order status updates

**Impact:** Low-Medium
- Affects latency of fill detection
- Less efficient than push-based updates
- Current reconciliation works but is polling-based

**Recommendation:** Implement user WebSocket for real-time order updates in future iteration

### 5. Order Type Support

**Discrepancy Type:** Feature Gap (Non-Critical)

**Official Specification:**
- Order types: GTC (Good-Till-Cancel), GTD (Good-Till-Date), FOK (Fill-Or-Kill), FAK (Fill-And-Kill)
- Post-only flag for maker-only orders

**Current Implementation:**
```typescript
const response = await this.client.createOrder({
  tokenID: tokenId,
  side: side === 'BUY' ? 'BUY' : 'SELL',
  price: Number(price),
  size: Number(size),
  clientOrderId,
  // No orderType or postOnly specified
});
```

**Gap:**
- Only default order type used (likely GTC)
- No support for FOK, FAK, or GTD
- No `postOnly` flag for maker-only orders

**Impact:** Low
- Default order type (GTC) suitable for most use cases
- Advanced order types needed for specific strategies

**Recommendation:** Add order type parameter when implementing advanced trading strategies

---

## Recommendations

### Priority 1 - High Impact

#### 1.1 Enhanced Rate Limit Handling

**Recommendation:** Implement rate limit awareness and exponential backoff

**Rationale:**
- Official docs specify detailed rate limits per endpoint
- Proactive rate limit management prevents throttling
- Better handling of HTTP 429 responses

**Implementation:**
```typescript
// Create rate limiter utility
export class RateLimiter {
  private requestCounts = new Map<string, number[]>();
  private readonly limits = {
    general: 9000,      // per 10 seconds
    balance: 200,       // per 10 seconds
    balanceUpdate: 50,  // per 10 seconds
  };

  async throttle(endpoint: string): Promise<void> {
    const now = Date.now();
    const windowMs = 10000; // 10 seconds
    
    const key = this.getEndpointKey(endpoint);
    const timestamps = this.requestCounts.get(key) || [];
    
    // Remove timestamps outside the window
    const validTimestamps = timestamps.filter(ts => now - ts < windowMs);
    
    const limit = this.limits[key] || this.limits.general;
    if (validTimestamps.length >= limit) {
      const oldestTimestamp = validTimestamps[0];
      const waitTime = windowMs - (now - oldestTimestamp);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    validTimestamps.push(now);
    this.requestCounts.set(key, validTimestamps);
  }
}

// Update retry logic to handle 429 specifically
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, baseDelay = 1000, maxDelay = 30000 } = options;
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        // Exponential backoff for rate limits
        const delay = Math.min(baseDelay * Math.pow(2, i), maxDelay);
        logger.warn('Rate limited, backing off', { attempt: i + 1, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (i === attempts - 1) {
        throw error;
      } else {
        await new Promise(resolve => setTimeout(resolve, baseDelay));
      }
    }
  }
}
```

**Files to Update:**
- `apps/backend/src/utils/retry.ts` - Add exponential backoff
- `apps/backend/src/utils/rateLimiter.ts` (new) - Add rate limiter
- `apps/backend/src/clients/clob.ts` - Integrate rate limiter
- `apps/backend/src/clients/gamma.ts` - Integrate rate limiter

**ADR:** Create `docs/adr/0002-rate-limiting-strategy.md`

#### 1.2 Structured Error Handling

**Recommendation:** Parse and handle API error responses according to official format

**Rationale:**
- Official API returns structured error responses
- Different error types require different handling strategies
- Better debugging and user feedback

**Implementation:**
```typescript
export class PolymarketApiError extends Error {
  constructor(
    public statusCode: number,
    public success: boolean,
    public errorMsg: string,
    public originalError?: any
  ) {
    super(`Polymarket API Error (${statusCode}): ${errorMsg}`);
    this.name = 'PolymarketApiError';
  }

  isAuthError(): boolean {
    return this.statusCode === 401;
  }

  isValidationError(): boolean {
    return this.statusCode === 400;
  }

  isRateLimitError(): boolean {
    return this.statusCode === 429;
  }
}

// Update API clients to parse errors
async function handleApiError(error: any): Promise<never> {
  if (axios.isAxiosError(error) && error.response) {
    const { status, data } = error.response;
    const errorMsg = data?.errorMsg || data?.error || error.message;
    throw new PolymarketApiError(status, false, errorMsg, error);
  }
  throw error;
}
```

**Files to Update:**
- `apps/backend/src/utils/errors.ts` (new) - Add error classes
- `apps/backend/src/clients/clob.ts` - Use structured errors
- `apps/backend/src/clients/gamma.ts` - Use structured errors
- `apps/backend/src/clients/tradingClient.ts` - Use structured errors

**ADR:** Create `docs/adr/0003-api-error-handling.md`

### Priority 2 - Medium Impact

#### 2.1 WebSocket User Channel

**Recommendation:** Implement private user WebSocket for real-time order updates

**Rationale:**
- Official API provides user-specific WebSocket channel
- Real-time order fills are more efficient than polling
- Better trading latency for active strategies

**Implementation:**
```typescript
export class UserFeedClient extends EventEmitter {
  private wsClient: WebSocketClient;
  
  constructor(options: { url: string; apiKey: string; secret: string; passphrase: string }) {
    super();
    this.wsClient = new WebSocketClient({ url: options.url });
    this.setupEventHandlers();
  }

  private subscribe(): void {
    const subscription = {
      type: 'user',
      apiKey: this.apiKey,
      secret: this.secret,
      passphrase: this.passphrase,
    };
    this.wsClient.send(subscription);
  }

  private handleMessage(message: any): void {
    switch (message.event_type) {
      case 'order':
        this.emit('order_update', message);
        break;
      case 'trade':
        this.emit('fill', message);
        break;
    }
  }
}
```

**Files to Create:**
- `apps/backend/src/clients/userFeed.ts` - User WebSocket client

**Files to Update:**
- `apps/backend/src/clients/tradingClient.ts` - Integrate user feed
- `packages/shared/src/index.ts` - Add user message types

**ADR:** Update `docs/adr/0001-initial-architecture.md`

#### 2.2 Batch Order Operations

**Recommendation:** Add support for batch order creation and cancellation

**Rationale:**
- Official API supports up to 15 orders per batch
- More efficient for market-making strategies
- Reduces API calls and improves throughput

**Implementation:**
```typescript
async createOrderBatch(
  orders: Array<{
    tokenId: string;
    side: 'BUY' | 'SELL';
    price: string;
    size: string;
  }>
): Promise<Order[]> {
  assertLiveTradingEnabled();
  
  if (orders.length > 15) {
    throw new Error('Maximum 15 orders per batch');
  }

  const orderRequests = orders.map((order, i) => ({
    tokenID: order.tokenId,
    side: order.side,
    price: Number(order.price),
    size: Number(order.size),
    clientOrderId: `batch-${Date.now()}-${i}`,
  }));

  const responses = await this.client.createOrders(orderRequests);
  
  return responses.map((response, i) => ({
    orderId: response.orderID || orderRequests[i].clientOrderId,
    clientOrderId: orderRequests[i].clientOrderId,
    tokenId: orders[i].tokenId,
    side: orders[i].side,
    price: orders[i].price,
    size: orders[i].size,
    status: 'OPEN',
    createdAt: Date.now(),
    filledSize: '0',
  }));
}
```

**Files to Update:**
- `apps/backend/src/clients/tradingClient.ts` - Add batch methods

### Priority 3 - Low Impact

#### 3.1 Order Type Support

**Recommendation:** Add support for all order types (GTC, GTD, FOK, FAK) and `postOnly` flag

**Rationale:**
- Advanced strategies may require specific order types
- Post-only orders are useful for pure market-making
- Enhances flexibility for future strategies

**Implementation:**
```typescript
export type OrderType = 'GTC' | 'GTD' | 'FOK' | 'FAK';

async createOrder(
  tokenId: string,
  side: 'BUY' | 'SELL',
  price: string,
  size: string,
  options?: {
    orderType?: OrderType;
    postOnly?: boolean;
    expiresAt?: number;
  }
): Promise<Order> {
  const response = await this.client.createOrder({
    tokenID: tokenId,
    side,
    price: Number(price),
    size: Number(size),
    clientOrderId,
    orderType: options?.orderType || 'GTC',
    postOnly: options?.postOnly || false,
    ...(options?.expiresAt && { expiration: options.expiresAt }),
  });
  
  return order;
}
```

**Files to Update:**
- `apps/backend/src/clients/tradingClient.ts` - Add order type parameter
- `packages/shared/src/index.ts` - Add OrderType enum

#### 3.2 Additional Gamma API Endpoints

**Recommendation:** Add support for slug-based lookups and tag filtering

**Rationale:**
- Complete coverage of Gamma API
- Useful for specific market discovery patterns
- Low effort to implement

**Implementation:**
```typescript
async getMarketBySlug(slug: string): Promise<Market> {
  const response = await this.client.get<Market>(`/markets/slug/${slug}`);
  return response.data;
}

async getEventBySlug(slug: string): Promise<Event> {
  const response = await this.client.get<Event>(`/events/slug/${slug}`);
  return response.data;
}

async getMarketsByTag(tagId: string, limit?: number): Promise<Market[]> {
  const response = await this.client.get<Market[]>('/markets', {
    params: { tag_id: tagId, ...(limit && { limit }) },
  });
  return response.data;
}
```

**Files to Update:**
- `apps/backend/src/clients/gamma.ts` - Add new methods

---

## Cross-References

### Code References

#### Authentication
- **Implementation:** `apps/backend/src/clients/tradingClient.ts:42-75` (initialize method)
- **SDK:** Uses `@polymarket/clob-client` v5.2.1 which handles L1/L2 auth internally
- **Configuration:** `apps/backend/src/config/index.ts:56` (PRIVATE_KEY)
- **Documentation:** https://docs.polymarket.com/developers/CLOB/authentication

#### API Endpoints
- **CLOB Client:** `apps/backend/src/clients/clob.ts:17-33`
- **Gamma Client:** `apps/backend/src/clients/gamma.ts:17-55`
- **Trading Client:** `apps/backend/src/clients/tradingClient.ts:128-185`
- **Configuration:** `apps/backend/src/config/index.ts:45-47`

#### WebSocket
- **Market Feed:** `apps/backend/src/clients/marketFeed.ts`
- **WebSocket Base:** `apps/backend/src/clients/websocket.ts`
- **Subscription:** `apps/backend/src/clients/marketFeed.ts:67-87`
- **Message Handling:** `apps/backend/src/clients/marketFeed.ts:118-191`
- **Documentation:** https://docs.polymarket.com/developers/CLOB/websocket/wss-overview

#### Rate Limiting
- **Retry Logic:** `apps/backend/src/utils/retry.ts`
- **CLOB Usage:** `apps/backend/src/clients/clob.ts:18`
- **Gamma Usage:** `apps/backend/src/clients/gamma.ts:18`
- **Configuration:** `apps/backend/src/config/index.ts:50-51` (RETRY_ATTEMPTS, RETRY_DELAY)
- **Documentation:** https://docs.polymarket.com/quickstart/introduction/rate-limits

#### Error Handling
- **Logger:** `apps/backend/src/utils/logger.ts`
- **CLOB Client:** `apps/backend/src/clients/clob.ts:18-32`
- **Trading Client:** `apps/backend/src/clients/tradingClient.ts:173-183`
- **WebSocket:** `apps/backend/src/clients/marketFeed.ts:137-142`

### Test References

#### Configuration Tests
- **File:** `apps/backend/tests/unit/config.test.ts:8-10`
- **Validates:** Default API URLs match official endpoints

#### Trading Client Tests
- **File:** `apps/backend/tests/unit/tradingClient.test.ts:11`
- **Validates:** CLOB API URL configuration

### Documentation References

#### Architecture Documentation
- **File:** `docs/architecture.md:426,460,498`
- **Contains:** API base URLs and WebSocket endpoints
- **Cross-references:** CLOB, Gamma, and WebSocket specifications

#### Runbook
- **File:** `docs/runbook.md:19-21`
- **Contains:** Production API endpoints
- **Cross-references:** Environment setup and operational procedures

#### Environment Guide
- **File:** `docs/environment.md:292-294`
- **Contains:** Environment variable examples with API URLs

#### Examples
- **File:** `docs/examples.md`
- **Contains:** CLI usage examples for market data fetching

#### ADR
- **File:** `docs/adr/0001-initial-architecture.md`
- **Contains:** WebSocket-first strategy decision
- **Cross-references:** Authentication, market data, and trading strategy decisions

---

## Appendix A: Official Documentation Index

### Primary Documentation
1. **Polymarket Developer Portal:** https://docs.polymarket.com/
2. **CLOB Introduction:** https://docs.polymarket.com/developers/CLOB/introduction
3. **CLOB Authentication:** https://docs.polymarket.com/developers/CLOB/authentication
4. **CLOB Quickstart:** https://docs.polymarket.com/developers/CLOB/quickstart
5. **Gamma API Overview:** https://docs.polymarket.com/developers/gamma-markets-api/overview
6. **Gamma Market Discovery:** https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide
7. **WebSocket Overview:** https://docs.polymarket.com/developers/CLOB/websocket/wss-overview
8. **WebSocket Quickstart:** https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart
9. **Rate Limits:** https://docs.polymarket.com/quickstart/introduction/rate-limits
10. **Endpoints Reference:** https://docs.polymarket.com/quickstart/reference/endpoints

### SDK Documentation
1. **CLOB Client (TypeScript):** https://github.com/Polymarket/clob-client
2. **CLOB Client (Python):** https://github.com/Polymarket/py-clob-client

### Community Resources
1. **Polymarket Python Tutorial:** https://www.polytrackhq.app/blog/polymarket-python-tutorial
2. **Go Gamma Client SDK:** https://github.com/ivanzzeth/polymarket-go-gamma-client

---

## Appendix B: Implementation Checklist

### Completed ✅
- [x] CLOB API client for orderbook fetching
- [x] Gamma API client for market discovery
- [x] WebSocket client with reconnection
- [x] Market feed with resync logic
- [x] Trading client using official SDK
- [x] L1/L2 authentication via SDK
- [x] Configuration with correct defaults
- [x] Basic retry logic
- [x] Idempotent order placement
- [x] Kill switch implementation
- [x] Polygon Chain ID 137 integration

### Recommended Enhancements ⚠️
- [ ] Rate limit awareness and throttling
- [ ] Exponential backoff for rate limits
- [ ] Structured error parsing
- [ ] HTTP status code specific handling
- [ ] WebSocket user channel
- [ ] Batch order operations
- [ ] Order type support (FOK, FAK, GTD)
- [ ] Post-only flag support
- [ ] Slug-based market lookups
- [ ] Tag-based market filtering

### Future Considerations 📋
- [ ] WebSocket connection pooling
- [ ] Request metrics and monitoring
- [ ] Circuit breaker patterns for API endpoints
- [ ] Advanced order types (iceberg, TWAP)
- [ ] Market data caching strategies
- [ ] Historical data integration

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-01 | 1.0 | GitHub Copilot Agent | Initial comprehensive review |

---

## Approval

This document should be reviewed and approved by the project owner before being considered final.

**Reviewer:** _Pending_  
**Approval Date:** _Pending_  
**Status:** Draft - Awaiting Review
