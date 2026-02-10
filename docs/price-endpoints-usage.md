# Price & Market Endpoints - Usage Guide

**Related Issue:** [PR-005] Price & Market Endpoints (#233)  
**Date:** 2026-02-06  
**Status:** ✅ Implemented

---

## Overview

The CLOB Client now provides efficient price query endpoints that enable the bot to retrieve market data without fetching full orderbooks. These endpoints are optimized for high-frequency queries and provide accurate pricing information for trading decisions.

## New Endpoints

### 1. GET /price - Current Market Price

Get the best executable price for immediate execution on a specific side.

**Method:** `ClobClient.getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<string>`

**Parameters:**
- `tokenId` - The token/asset ID for the market
- `side` - `'BUY'` returns best ask price, `'SELL'` returns best bid price

**Returns:** Price as a string for precision

**Example:**
```typescript
import { ClobClient } from './clients/clob';

const clobClient = new ClobClient();

// Get the best price to buy (best ask)
const buyPrice = await clobClient.getPrice('0x123...abc', 'BUY');
console.log('Best ask price:', buyPrice); // "0.55"

// Get the best price to sell (best bid)
const sellPrice = await clobClient.getPrice('0x123...abc', 'SELL');
console.log('Best bid price:', sellPrice); // "0.45"
```

**Use Cases:**
- Quick price checks before order placement
- Real-time price monitoring
- Market opportunity detection
- Dashboard display

**Benefits:**
- Much faster than fetching full orderbook (~10x less bandwidth)
- Lower API rate limit consumption
- Reduced latency for price discovery

---

### 2. GET /lasttrade - Most Recent Trade

Get the most recent trade executed on the market, including price, size, and timestamp.

**Method:** `ClobClient.getLastTrade(tokenId: string): Promise<LastTrade>`

**Parameters:**
- `tokenId` - The token/asset ID for the market

**Returns:** Object with:
```typescript
{
  token_id: string;
  price: string;      // Last trade price
  size: string;       // Trade size
  timestamp: string;  // ISO 8601 timestamp
}
```

**Example:**
```typescript
const lastTrade = await clobClient.getLastTrade('0x123...abc');

console.log('Last trade price:', lastTrade.price);
console.log('Trade size:', lastTrade.size);
console.log('Executed at:', lastTrade.timestamp);

// Check if market has recent activity
const tradeAge = Date.now() - new Date(lastTrade.timestamp).getTime();
const isActive = tradeAge < 5 * 60 * 1000; // Active if traded in last 5 minutes
console.log('Market is active:', isActive);
```

**Use Cases:**
- Market activity monitoring
- Volume analysis
- Trading analytics
- Historical price tracking
- Liquidity assessment

---

### 3. GET /spread - Bid-Ask Spread

Get the current bid-ask spread, which indicates market liquidity.

**Method:** `ClobClient.getSpread(tokenId: string): Promise<SpreadData>`

**Parameters:**
- `tokenId` - The token/asset ID for the market

**Returns:** Object with:
```typescript
{
  token_id: string;
  bid: string;        // Best bid price
  ask: string;        // Best ask price
  spread: string;     // Difference (ask - bid)
}
```

**Example:**
```typescript
const spread = await clobClient.getSpread('0x123...abc');

console.log('Bid:', spread.bid);           // "0.48"
console.log('Ask:', spread.ask);           // "0.52"
console.log('Spread:', spread.spread);     // "0.04"

// Calculate spread percentage
const spreadPercent = (parseFloat(spread.spread) / parseFloat(spread.bid)) * 100;
console.log('Spread %:', spreadPercent.toFixed(2)); // "8.33%"

// Determine if market is liquid
const isLiquid = parseFloat(spread.spread) < 0.05; // Spread < 5 cents
console.log('Market is liquid:', isLiquid);
```

**Use Cases:**
- Liquidity analysis
- Market making strategies
- Trading cost estimation
- Market quality assessment
- Entry/exit decision making

**Interpretation:**
- **Tight spread** (< 0.02): Very liquid market, low trading costs
- **Normal spread** (0.02 - 0.05): Reasonable liquidity
- **Wide spread** (> 0.05): Low liquidity, higher trading costs

---

### 4. GET /midpoint - Fair Value Estimate

Get the midpoint between best bid and best ask, often used as a "fair value" estimate.

**Method:** `ClobClient.getMidpoint(tokenId: string): Promise<MidpointData>`

**Parameters:**
- `tokenId` - The token/asset ID for the market

**Returns:** Object with:
```typescript
{
  token_id: string;
  midpoint: string;   // Average of bid and ask
}
```

**Example:**
```typescript
const midpoint = await clobClient.getMidpoint('0x123...abc');
console.log('Fair value:', midpoint.midpoint); // "0.50"

// Use for limit order placement
const orderPrice = parseFloat(midpoint.midpoint);
const limitPrice = (orderPrice * 1.01).toFixed(6); // 1% above fair value
console.log('Limit order price:', limitPrice);
```

**Use Cases:**
- Fair value estimation
- Limit order pricing
- Market analysis
- Performance measurement
- Arbitrage detection

**Note:** Midpoint may be undefined if either side of the orderbook is empty.

---

## Integration with Trading Logic

### Example 1: Pre-Order Price Check

Check if the market price is favorable before placing an order:

```typescript
async function placeOrderWithPriceCheck(
  clobClient: ClobClient,
  tradingClient: TradingClient,
  tokenId: string,
  targetPrice: string,
  side: 'BUY' | 'SELL'
) {
  // Get current market price
  const currentPrice = await clobClient.getPrice(tokenId, side);
  
  // Check if price is favorable
  const isFavorable = side === 'BUY' 
    ? parseFloat(currentPrice) <= parseFloat(targetPrice)
    : parseFloat(currentPrice) >= parseFloat(targetPrice);
    
  if (!isFavorable) {
    logger.warn('Price not favorable', { currentPrice, targetPrice, side });
    return null;
  }
  
  // Place order
  return await tradingClient.createOrder({
    tokenId,
    price: targetPrice,
    size: '100',
    side,
  });
}
```

### Example 2: Market Quality Assessment

Evaluate market quality before entering:

```typescript
async function assessMarketQuality(
  clobClient: ClobClient,
  tokenId: string
): Promise<{ isGoodMarket: boolean; reason: string }> {
  const [spread, lastTrade] = await Promise.all([
    clobClient.getSpread(tokenId),
    clobClient.getLastTrade(tokenId),
  ]);
  
  // Check spread (tight spread = good liquidity)
  const spreadValue = parseFloat(spread.spread);
  if (spreadValue > 0.05) {
    return { isGoodMarket: false, reason: 'Spread too wide' };
  }
  
  // Check recent activity
  const tradeAge = Date.now() - new Date(lastTrade.timestamp).getTime();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  if (tradeAge > maxAge) {
    return { isGoodMarket: false, reason: 'No recent trades' };
  }
  
  return { isGoodMarket: true, reason: 'Market is liquid and active' };
}
```

### Example 3: Smart Limit Order Placement

Place limit orders at competitive prices:

```typescript
async function placeSmartLimitOrder(
  clobClient: ClobClient,
  tradingClient: TradingClient,
  tokenId: string,
  size: string,
  side: 'BUY' | 'SELL',
  aggressiveness: 'passive' | 'moderate' | 'aggressive'
) {
  const [spread, midpoint] = await Promise.all([
    clobClient.getSpread(tokenId),
    clobClient.getMidpoint(tokenId),
  ]);
  
  // Calculate price based on aggressiveness
  const mid = parseFloat(midpoint.midpoint);
  const spreadValue = parseFloat(spread.spread);
  
  let price: number;
  switch (aggressiveness) {
    case 'passive':
      // Join the bid/ask
      price = side === 'BUY' 
        ? parseFloat(spread.bid)
        : parseFloat(spread.ask);
      break;
      
    case 'moderate':
      // Price slightly inside the spread
      price = side === 'BUY'
        ? mid - (spreadValue * 0.25)
        : mid + (spreadValue * 0.25);
      break;
      
    case 'aggressive':
      // Cross the spread (take liquidity)
      price = side === 'BUY'
        ? parseFloat(spread.ask)
        : parseFloat(spread.bid);
      break;
  }
  
  return await tradingClient.createOrder({
    tokenId,
    price: price.toFixed(6),
    size,
    side,
  });
}
```

### Example 4: Periodic Price Monitoring

Monitor prices for arbitrage or trading opportunities:

```typescript
class PriceMonitor {
  private intervals = new Map<string, NodeJS.Timeout>();
  
  constructor(private clobClient: ClobClient) {}
  
  async startMonitoring(
    tokenId: string,
    intervalMs: number,
    callback: (priceData: PriceData) => void
  ) {
    const interval = setInterval(async () => {
      try {
        const [buyPrice, sellPrice, spread, lastTrade] = await Promise.all([
          this.clobClient.getPrice(tokenId, 'BUY'),
          this.clobClient.getPrice(tokenId, 'SELL'),
          this.clobClient.getSpread(tokenId),
          this.clobClient.getLastTrade(tokenId),
        ]);
        
        callback({
          tokenId,
          buyPrice,
          sellPrice,
          spread: spread.spread,
          lastTradePrice: lastTrade.price,
          lastTradeTime: lastTrade.timestamp,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Price monitoring error', { tokenId, error });
      }
    }, intervalMs);
    
    this.intervals.set(tokenId, interval);
  }
  
  stopMonitoring(tokenId: string) {
    const interval = this.intervals.get(tokenId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(tokenId);
    }
  }
  
  stopAll() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
  }
}

interface PriceData {
  tokenId: string;
  buyPrice: string;
  sellPrice: string;
  spread: string;
  lastTradePrice: string;
  lastTradeTime: string;
  timestamp: string;
}
```

---

## Error Handling

All price endpoints include comprehensive error handling:

### Network Errors
```typescript
try {
  const price = await clobClient.getPrice(tokenId, 'BUY');
} catch (error) {
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    // Network error - will auto-retry
    logger.warn('Network error, retrying...', { error });
  }
}
```

### API Errors
```typescript
try {
  const lastTrade = await clobClient.getLastTrade(tokenId);
} catch (error) {
  if (error.response?.status === 404) {
    // No trades yet for this market
    logger.info('No trades found for market', { tokenId });
  } else if (error.response?.status === 429) {
    // Rate limited - will auto-retry
    logger.warn('Rate limited, backing off...', { tokenId });
  }
}
```

### Empty Orderbook
```typescript
try {
  const midpoint = await clobClient.getMidpoint(tokenId);
} catch (error) {
  if (error.response?.status === 400) {
    // Orderbook empty, midpoint undefined
    logger.warn('Cannot calculate midpoint - orderbook empty', { tokenId });
  }
}
```

---

## Performance Considerations

### Rate Limits
- CLOB API allows 500-1,500 requests per 10 seconds for market data endpoints
- Price endpoints consume less bandwidth than full orderbook queries
- Consider caching prices for short durations (1-5 seconds) for high-frequency strategies

### Optimization Tips

1. **Batch Queries:** Fetch multiple data points in parallel when needed
   ```typescript
   const [price, spread, lastTrade] = await Promise.all([
     clobClient.getPrice(tokenId, 'BUY'),
     clobClient.getSpread(tokenId),
     clobClient.getLastTrade(tokenId),
   ]);
   ```

2. **Smart Caching:** Cache prices for brief periods
   ```typescript
   class PriceCache {
     private cache = new Map<string, { price: string; timestamp: number }>();
     private ttl = 2000; // 2 seconds
     
     async getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<string> {
       const key = `${tokenId}:${side}`;
       const cached = this.cache.get(key);
       
       if (cached && Date.now() - cached.timestamp < this.ttl) {
         return cached.price;
       }
       
       const price = await this.clobClient.getPrice(tokenId, side);
       this.cache.set(key, { price, timestamp: Date.now() });
       return price;
     }
   }
   ```

3. **Choose the Right Endpoint:**
   - Need just the price? → Use `getPrice()` (fastest)
   - Need bid, ask, and spread? → Use `getSpread()` (one call gets all three)
   - Need full orderbook depth? → Use `getOrderbook()` (most data)

---

## Circuit Breaker Integration

All price endpoints are protected by the circuit breaker pattern, which prevents cascade failures:

```typescript
// Circuit breaker automatically handles failures
try {
  const price = await clobClient.getPrice(tokenId, 'BUY');
} catch (error) {
  // If API is down, circuit breaker will open
  // Further requests will fail fast without hitting the API
  logger.error('Circuit breaker may be open', {
    metrics: clobClient.getCircuitBreakerMetrics()
  });
}

// Check circuit breaker state
const metrics = clobClient.getCircuitBreakerMetrics();
console.log('Circuit state:', metrics.state); // 'closed', 'open', or 'half-open'
console.log('Failures:', metrics.failures);
console.log('Successes:', metrics.successes);
```

---

## Testing

See `apps/backend/tests/unit/clob.test.ts` for comprehensive test coverage:
- Success cases for all endpoints
- Error handling (network, API, empty orderbook)
- Retry logic and exponential backoff
- Rate limiting
- Circuit breaker integration
- Edge cases (tight/wide spreads, high precision)

---

## API Documentation References

- [Polymarket CLOB API - Get Market Price](https://docs.polymarket.com/api-reference/pricing/get-market-price)
- [Polymarket CLOB API - Public Methods](https://docs.polymarket.com/developers/CLOB/clients/methods-public)
- [Polymarket CLOB API - Introduction](https://docs.polymarket.com/developers/CLOB/introduction)

---

## Related Documentation

- [API Missing Endpoints Analysis](./api-missing-endpoints-analysis.md) - Gap analysis that identified these missing endpoints
- [API Alignment Verification](./api-alignment-verification.md) - Verification of implementation correctness
- [Architecture Overview](./architecture.md) - System architecture and client design patterns

---

## Change Log

**2026-02-06:** Initial implementation
- Added GET /price endpoint
- Added GET /lasttrade endpoint  
- Added GET /spread endpoint
- Added GET /midpoint endpoint
- Comprehensive test coverage (34 tests)
- Full documentation with usage examples
