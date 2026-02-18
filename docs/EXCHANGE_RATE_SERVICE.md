# Exchange Rate Fetcher (GAP-007)

This document describes the Exchange Rate Fetcher integration implemented for the polymarket-bot trading system.

## Overview

The Exchange Rate Fetcher provides real-time cryptocurrency and fiat exchange rates through the CoinGecko API. It includes caching, circuit breakers, retry logic, and comprehensive error handling for production reliability.

## Features

- ✅ **External API Integration** - Uses CoinGecko free tier API (no authentication required)
- ✅ **Intelligent Caching** - In-memory cache with configurable TTL (default: 5 minutes)
- ✅ **Failover & Error Handling** - Circuit breaker pattern, retry logic with exponential backoff
- ✅ **Comprehensive Testing** - 21 unit tests + 11 integration tests
- ✅ **CLI Interface** - Simple command for testing and demonstration
- ✅ **Batch Operations** - Fetch multiple exchange rates efficiently

## Supported Currencies

### Cryptocurrencies (Source)
- **BTC** - Bitcoin
- **ETH** - Ethereum
- **USDC** - USD Coin
- **USDT** - Tether
- **DAI** - Dai Stablecoin
- **MATIC** / **POL** - Polygon (both symbols supported)

### Fiat Currencies (Target)
- **USD** - US Dollar
- **EUR** - Euro
- **GBP** - British Pound
- And any other currency supported by CoinGecko

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Exchange rate API URL (default: CoinGecko free tier)
EXCHANGE_RATE_API_URL=https://api.coingecko.com/api/v3

# Cache TTL in milliseconds (default: 300000 = 5 minutes)
# Valid range: 60000-3600000 ms (1 minute - 1 hour)
EXCHANGE_RATE_CACHE_TTL_MS=300000
```

### Default Configuration

If not specified, the service uses:
- **API**: CoinGecko free tier (`https://api.coingecko.com/api/v3`)
- **Cache TTL**: 5 minutes (300,000 ms)
- **Circuit Breaker**: 5 failures to open, 60s reset timeout
- **Retry**: 3 attempts with exponential backoff

## Usage

### CLI Commands

```bash
# Show all supported exchange rates
npm run rates

# Show a specific exchange rate
npm run rates -- --from USDC --to USD

# Show cache statistics
npm run rates -- --stats
```

### Programmatic Usage

```typescript
import { ExchangeRateClient } from './clients/exchangeRate';

// Create client with default 5-minute cache
const client = new ExchangeRateClient();

// Or with custom cache TTL (1 minute)
const client = new ExchangeRateClient(60000);

try {
  // Get a single exchange rate
  const rate = await client.getExchangeRate('USDC', 'USD');
  console.log(`1 ${rate.from} = ${rate.rate} ${rate.to}`);

  // Get multiple rates at once (more efficient)
  const rates = await client.getBatchExchangeRates([
    ['USDC', 'USD'],
    ['ETH', 'USD'],
    ['BTC', 'USD'],
  ]);

  // Get cache statistics
  const stats = client.getCacheStats();
  console.log(`Cached entries: ${stats.size}`);

  // Clear cache if needed
  client.clearCache();

  // Get circuit breaker metrics
  const metrics = client.getCircuitBreakerMetrics();
  console.log(`Circuit breaker state: ${metrics.state}`);
} finally {
  // Clean up resources
  client.destroy();
}
```

## Architecture

### Components

```
ExchangeRateClient
├── Axios HTTP Client (CoinGecko API)
├── Circuit Breaker (fault tolerance)
├── Retry Logic (exponential backoff)
└── Cache (in-memory with TTL)
```

### Data Flow

1. **Request**: `getExchangeRate('USDC', 'USD')`
2. **Cache Check**: Return cached value if valid
3. **API Call**: Fetch from CoinGecko via circuit breaker + retry
4. **Cache Store**: Store result with timestamp
5. **Return**: Exchange rate with metadata

### Error Handling

The service implements multiple layers of error handling:

1. **Validation**: Checks for unsupported currencies before API call
2. **Circuit Breaker**: Opens after 5 consecutive failures (protects API)
3. **Retry Logic**: 3 attempts with exponential backoff (handles transient errors)
4. **Error Classification**: Distinguishes permanent vs. transient errors
5. **Logging**: Structured logs for debugging and monitoring

## Testing

### Unit Tests

```bash
# Run unit tests only
npm test tests/unit/exchangeRate.test.ts
```

**Coverage**: 21 tests covering:
- Constructor and initialization
- Exchange rate fetching (all supported currencies)
- Caching behavior and expiration
- Batch operations
- Error handling
- Circuit breaker integration
- Resource cleanup

### Integration Tests

```bash
# Run integration tests (requires internet)
npm test tests/integration/exchangeRate.integration.test.ts
```

**Coverage**: 11 tests with real API calls:
- Real exchange rate fetching
- Cache behavior with real data
- Error handling with unsupported currencies
- Cache management
- Circuit breaker metrics

**Note**: Integration tests are skipped by default to avoid:
- Rate limiting
- Network dependency in CI
- Slow test execution

To run them, remove the `.skip` from the describe block in the test file.

## API Rate Limits

CoinGecko Free Tier:
- **Rate Limit**: 10-50 requests per minute (varies)
- **Cost**: Free
- **Authentication**: None required

The caching layer significantly reduces API calls:
- With 5-minute cache TTL, you can support up to 600 requests/minute with only 2 API calls/minute per currency pair
- Circuit breaker prevents hammering the API during outages

## Production Considerations

### Monitoring

Key metrics to monitor:

```typescript
const client = new ExchangeRateClient();

// Cache effectiveness
const stats = client.getCacheStats();
console.log(`Cache hit rate: ${stats.size} entries`);

// Circuit breaker health
const metrics = client.getCircuitBreakerMetrics();
console.log(`State: ${metrics.state}, Failures: ${metrics.failures}`);
```

### Alerting

Configure alerts for:
- Circuit breaker opening (indicates API issues)
- High error rates (>10% failures)
- Stale cache (no successful refreshes in >10 minutes)

### Failover

To add a fallback provider:

```typescript
// 1. Create secondary client with different API
const primaryClient = new ExchangeRateClient();
const fallbackClient = new ExchangeRateClient(); // Configure with different URL

// 2. Implement fallback logic
try {
  return await primaryClient.getExchangeRate(from, to);
} catch (error) {
  logger.warn('Primary exchange rate provider failed, using fallback');
  return await fallbackClient.getExchangeRate(from, to);
}
```

### Performance

Typical performance:
- **Cache hit**: <1ms
- **Cache miss (API call)**: 100-500ms
- **Batch request (6 pairs)**: 500-1000ms (parallel)

## Troubleshooting

### Common Issues

**1. "Unsupported source currency" error**

Solution: Check that the currency is in the supported list. Only BTC, ETH, USDC, USDT, DAI, MATIC/POL are currently supported.

To add support for a new currency, update the `coinIdMap` in `exchangeRate.ts`:

```typescript
const coinIdMap: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  // Add new currency here
  'DOGE': 'dogecoin',
};
```

**2. "Network error" / "ENOTFOUND" errors**

Possible causes:
- No internet connectivity
- CoinGecko API is down
- Firewall blocking requests
- Rate limit exceeded

Solution: Check circuit breaker metrics, wait for reset timeout, verify network connectivity.

**3. Stale exchange rates**

If rates seem outdated:
1. Check cache TTL configuration: `EXCHANGE_RATE_CACHE_TTL_MS`
2. Clear cache manually: `client.clearCache()`
3. Verify last successful API call in logs

**4. Circuit breaker open**

If circuit breaker is stuck open:
1. Check if CoinGecko API is accessible
2. Review error logs for root cause
3. Wait for reset timeout (default: 60 seconds)
4. Reset manually if needed: `client.resetCircuitBreaker()`

### Debug Logging

Enable debug logging to troubleshoot issues:

```bash
# Set log level in .env
LOG_LEVEL=debug

# Run the rates command
npm run rates
```

This will show:
- Cache hits/misses
- API request/response details
- Retry attempts
- Circuit breaker state changes

## Future Enhancements

Potential improvements for future iterations:

1. **Multiple Providers**: Add support for CryptoCompare, Coinbase API as fallbacks
2. **Persistent Cache**: Store cache in Redis/database for multi-process deployments
3. **Rate Limit Handling**: Implement sophisticated rate limit detection and backoff
4. **Historical Data**: Support for historical exchange rates
5. **WebSocket Streaming**: Real-time rate updates via WebSocket
6. **More Currencies**: Expand supported cryptocurrency list
7. **Conversion Functions**: Helper functions for amount conversions

## Related Documentation

- **Acceptance Criteria**: See issue #410 (GAP-007)
- **API Client Pattern**: `docs/ai/project-layout.md` - Client structure guidelines
- **Circuit Breaker**: `apps/backend/src/utils/circuitBreaker.ts`
- **Retry Logic**: `apps/backend/src/utils/retry.ts`
- **Configuration**: `apps/backend/src/config/index.ts`

## License

See project LICENSE file.
