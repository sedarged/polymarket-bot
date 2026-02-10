# Gamma API Advanced Usage Examples

**PR-014: Complete Gamma API & Data Platform Integration**

This guide demonstrates how to use the newly implemented Gamma API endpoints for advanced features like historical data, series/tags, and account management.

## Table of Contents
1. [Account Management](#account-management)
2. [Market Lifecycle](#market-lifecycle)
3. [Series and Tags](#series-and-tags)
4. [Historical Data](#historical-data)
5. [Replay for Backtesting](#replay-for-backtesting)

---

## Account Management

### Get User Account Information
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Get account information for a specific address
const account = await gamma.getAccount('0x1234567890abcdef1234567890abcdef12345678');

console.log('Account:', {
  address: account.address,
  balances: account.balances,
  positions: account.positions,
  tags: account.tags,
});
```

### List and Filter Accounts
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Get all accounts with specific filters
const accounts = await gamma.getAccounts({
  limit: 50,
  // Add any additional query filters as needed
});

console.log(`Found ${accounts.length} accounts`);
```

---

## Market Lifecycle

### Get Individual Market by ID
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Fetch specific market details
const market = await gamma.getMarket('0xmarket123');

console.log('Market:', {
  question: market.question,
  active: market.active,
  closed: market.closed,
  outcomes: market.outcomes,
  tokens: market.tokens,
});
```

### Get Market History
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Fetch historical events for a market
const history = await gamma.getMarketHistory('0xmarket123', {
  limit: 100,
  // Optional: startTime, endTime for filtering
});

console.log(`Market has ${history.length} historical events`);
history.forEach(event => {
  console.log(`Event at ${new Date(event.timestamp)}: ${event.eventType}`);
});
```

### Get Market Replay Data for Backtesting
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Fetch replay events for backtesting strategies
const replay = await gamma.getMarketReplay('0xmarket123', {
  startTs: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
  endTs: Date.now(),
});

console.log(`Retrieved ${replay.length} replay events`);

// Process replay events chronologically
replay.forEach(event => {
  // Simulate your trading strategy with historical data
  console.log(`Replay event: ${event.eventType} at ${event.timestamp}`);
});
```

---

## Series and Tags

### Browse Event Series
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Get all series (grouped events)
const series = await gamma.getSeries({
  limit: 20,
});

console.log(`Found ${series.length} event series`);
series.forEach(s => {
  console.log(`Series: ${s.name} - ${s.markets.length} markets`);
});
```

### Get Specific Series
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Get details of a specific series
const series = await gamma.getSeriesById('series-id-123');

console.log('Series:', {
  name: series.name,
  description: series.description,
  tags: series.tags,
  marketCount: series.markets.length,
});
```

### Explore Tags and Categories
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Get all available tags
const tags = await gamma.getTags({
  limit: 50,
});

console.log(`Found ${tags.length} tags`);
tags.forEach(tag => {
  console.log(`Tag: ${tag.name} - ${tag.description || 'No description'}`);
});
```

### Get Tag Details
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Get specific tag information
const tag = await gamma.getTagById('politics');

console.log('Tag:', {
  name: tag.name,
  description: tag.description,
  seriesCount: tag.series?.length || 0,
  marketCount: tag.markets?.length || 0,
});
```

---

## Historical Data

### Get Historical Events
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Fetch historical market data
const history = await gamma.getHistory({
  startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
  endTime: Date.now(),
  limit: 1000,
});

console.log(`Retrieved ${history.length} historical events`);

// Analyze trends
const eventTypes = new Map<string, number>();
history.forEach(event => {
  const count = eventTypes.get(event.eventType) || 0;
  eventTypes.set(event.eventType, count + 1);
});

console.log('Event type distribution:', Object.fromEntries(eventTypes));
```

### Event Lookup
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Get specific event details
const event = await gamma.getEventById('event-abc-123');

console.log('Event:', {
  title: event.title,
  slug: event.slug,
  marketCount: event.markets.length,
});
```

---

## Replay for Backtesting

### Complete Backtesting Example
```typescript
// Comprehensive backtesting workflow
async function backtestStrategy(marketId: string, startDate: Date, endDate: Date) {
  const gamma = new GammaClient();
  
  // 1. Get market information
  const market = await gamma.getMarket(marketId);
  console.log(`Backtesting market: ${market.question}`);
  
  // 2. Fetch replay data
  const replay = await gamma.getReplay({
    marketId,
    startTs: startDate.getTime(),
    endTs: endDate.getTime(),
  });
  
  console.log(`Processing ${replay.length} events...`);
  
  // 3. Simulate trading strategy
  let position = 0;
  let pnl = 0;
  
  for (const event of replay) {
    // Your strategy logic here
    // Example: Buy on certain event types
    if (event.eventType === 'price_change') {
      // Simulate trade
      const tradeSize = 10;
      position += tradeSize;
      console.log(`Event ${event.id}: Position = ${position}`);
    }
    
    // Track P&L
    // pnl += calculatePnL(event.data);
  }
  
  console.log('Backtest complete:', {
    totalEvents: replay.length,
    finalPosition: position,
    pnl: pnl,
  });
  
  return { position, pnl };
}

// Run backtest
const result = await backtestStrategy(
  '0xmarket123',
  new Date('2026-01-01'),
  new Date('2026-02-01')
);
```

### Multi-Market Analysis
```typescript
// Analyze multiple markets simultaneously
async function analyzeMarketCorrelations() {
  const gamma = new GammaClient();
  
  // Get all active markets
  const markets = await gamma.getActiveMarkets(100);
  
  // Fetch history for each market
  const histories = await Promise.all(
    markets.slice(0, 10).map(m => 
      gamma.getMarketHistory(m.id, { limit: 100 })
    )
  );
  
  // Analyze correlations
  console.log(`Analyzing ${histories.length} markets...`);
  
  // Your correlation analysis logic here
  // Compare event patterns, timing, etc.
  
  return histories;
}
```

---

## Error Handling

All Gamma client methods include:
- **Automatic retry** with exponential backoff
- **Circuit breaker** to prevent cascade failures
- **Error classification** for smart retry decisions

```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';
import axios from 'axios';

const gamma = new GammaClient();

try {
  const market = await gamma.getMarket('invalid-id');
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      console.error('Market not found');
    } else if (error.response?.status === 429) {
      console.error('Rate limited - will retry automatically');
    } else {
      console.error('Unexpected error:', error.message);
    }
  } else {
    console.error('Unexpected non-HTTP error:', error);
  }
}

// Check circuit breaker status
const metrics = gamma.getCircuitBreakerMetrics();
console.log('Circuit breaker state:', metrics.state);
```

---

## Best Practices

### 1. Use Pagination for Large Datasets
```typescript
import { GammaClient } from '../../apps/backend/src/clients/gamma';

const gamma = new GammaClient();

// Note: getActiveMarkets() currently only supports limit parameter
// It does not support offset, so you can only fetch the first page
async function getFirstPageOfMarkets() {
  const markets = await gamma.getActiveMarkets(100);
  return markets;
}

// If you need pagination, you'll need to use a different approach
// or wait for offset support to be added to the API
```

### 2. Filter Data at the API Level
```typescript
// Use API filters to reduce data transfer
const recentHistory = await gamma.getHistory({
  startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
  limit: 500,
  // Add more filters as needed
});
```

### 3. Cache Frequently Accessed Data
```typescript
// Cache static data like tags and series
const cachedTags = new Map();

async function getTag(id: string) {
  if (cachedTags.has(id)) {
    return cachedTags.get(id);
  }
  
  const tag = await gamma.getTagById(id);
  cachedTags.set(id, tag);
  return tag;
}
```

### 4. Monitor Circuit Breaker Health
```typescript
// Regular health checks
setInterval(() => {
  const metrics = gamma.getCircuitBreakerMetrics();
  if (metrics.state !== 'closed') {
    console.warn('Gamma API circuit breaker not closed:', metrics);
  }
}, 60000); // Check every minute
```

---

## Integration with Trading Bot

### Example: Use Series to Organize Trading Strategies
```typescript
async function tradeBySeries() {
  const gamma = new GammaClient();
  
  // Get series tagged with "sports"
  const sportsSeries = await gamma.getSeries();
  
  for (const series of sportsSeries) {
    if (series.tags.includes('sports')) {
      console.log(`Trading series: ${series.name}`);
      
      // Get all markets in this series
      for (const market of series.markets) {
        // Apply series-specific trading strategy
        await applyStrategy(market, 'sports-strategy');
      }
    }
  }
}
```

### Example: Use Historical Data for Strategy Calibration
```typescript
async function calibrateStrategy(marketId: string) {
  const gamma = new GammaClient();
  
  // Get historical data for the market
  const history = await gamma.getMarketHistory(marketId, {
    limit: 1000,
  });
  
  // Analyze historical volatility
  const volatility = calculateVolatility(history);
  
  // Adjust trading parameters based on historical data
  return {
    orderSize: baseOrderSize * (1 / volatility),
    priceThreshold: 0.05 * volatility,
  };
}
```

---

## Related Documentation

- [API Alignment Verification](../api-alignment-verification.md) - Complete API coverage
- [User Feed WebSocket Example](./user-feed-websocket.ts) - Real-time order/fill events
- [Gamma Client Source](../../apps/backend/src/clients/gamma.ts) - Full implementation
- [Gamma Tests](../../apps/backend/tests/unit/gamma.test.ts) - 37 comprehensive tests

---

## Support

For issues or questions about the Gamma API integration:
1. Check [api-alignment-verification.md](../api-alignment-verification.md) for verification status
2. Review test examples in `apps/backend/tests/unit/gamma.test.ts`
3. See [Official Gamma API Docs](https://docs.polymarket.com/developers/gamma-markets-api/overview)
