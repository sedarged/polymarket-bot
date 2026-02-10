# Logging Guide

## Overview

The Polymarket bot uses [Pino](https://getpino.io/) for fast, structured, and categorized logging. Logs are organized by domain categories and automatically mask sensitive data for security.

## Key Features

- ✅ **Category-based**: Logs organized by domain (orderFlow, marketData, compliance, etc.)
- ✅ **Privacy-first**: Automatic masking of sensitive data (addresses, keys, secrets)
- ✅ **Performance**: Async logging with minimal overhead
- ✅ **Readable**: Pretty-printed in development, JSON in production
- ✅ **Structured**: Consistent JSON format for log aggregation

## Quick Start

### Basic Usage

```typescript
import { logger } from './utils/logger';

// Basic logging
logger.info('Application started');
logger.warn('High memory usage', { usage: 0.95, limit: 1.0 });
logger.error('Connection failed', { error: err.message, retries: 3 });
```

### Category Loggers

Use pre-configured category loggers for domain-specific logging:

```typescript
import { 
  orderFlowLogger, 
  marketDataLogger, 
  complianceLogger 
} from './utils/logger';

// Order flow logging
orderFlowLogger.info('Order placed', {
  orderId: 'order-123',
  side: 'BUY',
  size: 100,
  price: 0.65,
});

// Market data logging
marketDataLogger.info('Price updated', {
  tokenId: 'token-789',
  bid: 0.64,
  ask: 0.66,
  spread: 0.02,
});

// Compliance logging
complianceLogger.warn('Risk limit approaching', {
  limit: 10000,
  current: 9500,
  utilization: 0.95,
});
```

### Create Custom Categories

```typescript
import { logger, LogCategory } from './utils/logger';

// Create a child logger for a specific category
const myLogger = logger.category('myFeature');
myLogger.info('Feature initialized', { config: {...} });
```

## Log Categories

| Category | Purpose | Example Use Cases |
|----------|---------|-------------------|
| `orderFlow` | Order lifecycle | Order placement, cancellation, fills, amendments |
| `marketData` | Market updates | Orderbook changes, price updates, trade feeds |
| `compliance` | Trading gates & safety | Risk checks, kill switch, trading mode changes |
| `system` | System events | Startup, shutdown, configuration, health checks |
| `websocket` | WebSocket connections | Connects, disconnects, reconnects, subscriptions |
| `api` | API interactions | Rate limiting, circuit breakers, API errors |
| `learning` | ML/learning system | Backtesting, strategy selection, performance |
| `error` | Error tracking | Exceptions, failures, critical issues |
| `database` | Database operations | Persistence, queries, migrations |
| `audit` | Audit trail | Compliance logging, user actions |

## Log Levels

Use appropriate log levels for different severity:

```typescript
logger.fatal('Unrecoverable error, shutting down');  // Requires immediate action
logger.error('Operation failed, needs investigation');  // Error condition
logger.warn('Potential issue, monitor closely');      // Warning
logger.info('Normal operational message');            // Default
logger.debug('Detailed debugging information');        // Debug mode only
logger.trace('Very detailed tracing');                 // Trace mode only
```

### Setting Log Level

Control verbosity via environment variable:

```bash
LOG_LEVEL=info npm run dev     # Default: info and above
LOG_LEVEL=debug npm run dev    # Include debug messages
LOG_LEVEL=error npm run dev    # Errors only
```

## Sensitive Data Protection

The logger **automatically masks** sensitive fields to prevent data leaks:

### Automatically Masked Fields

- `address` - Ethereum/wallet addresses
- `privateKey`, `private_key` - Private keys
- `apiKey`, `api_key`, `api_secret` - API credentials
- `secret` - Any secret values
- `token` - Auth tokens
- `password` - Passwords
- `passphrase` - Passphrases
- `mnemonic` - Seed phrases
- Any nested fields with these names

### Masking Format

Sensitive data is masked to show first 6 and last 4 characters:

```typescript
// Original: 0x1234567890abcdef1234567890abcdef12345678
// Masked:   0x1234...5678

logger.info('User login', { 
  address: '0x1234567890abcdef1234567890abcdef12345678' 
});
// Output: { address: '0x1234...5678', ... }
```

### Manual Masking

For edge cases, use the masking function directly:

```typescript
import { maskSensitiveData } from './utils/logger';

const masked = maskSensitiveData('0x1234567890abcdef1234567890abcdef12345678');
console.log(masked);  // '0x1234...5678'
```

## Output Formats

### Development Mode

Human-readable output with colors and timestamps:

```bash
NODE_ENV=development npm run dev
```

```
[13:42:15.123] INFO: [orderFlow] Order placed
    category: "orderFlow"
    orderId: "order-123"
    side: "BUY"
    size: 100
    price: 0.65
```

### Production Mode

Structured JSON for log aggregation:

```bash
NODE_ENV=production npm start
```

```json
{"level":30,"time":"2026-02-09T13:42:15.123Z","pid":12345,"category":"orderFlow","orderId":"order-123","side":"BUY","size":100,"price":0.65,"msg":"Order placed"}
```

## Best Practices

### 1. Use Appropriate Categories

```typescript
// ✅ Good: Use specific category logger
orderFlowLogger.info('Order filled', { orderId, fillSize });

// ⚠️  Okay: Use general logger with context
logger.info('Order filled', { category: 'orderFlow', orderId, fillSize });

// ❌ Bad: No category context
logger.info('Order filled', { orderId, fillSize });
```

### 2. Include Relevant Context

```typescript
// ✅ Good: Rich context
orderFlowLogger.info('Order placement failed', {
  orderId: 'order-123',
  reason: 'insufficient_balance',
  required: 1000,
  available: 500,
  userId: 'user-456'
});

// ❌ Bad: Minimal context
orderFlowLogger.error('Order failed');
```

### 3. Use Structured Data

```typescript
// ✅ Good: Structured metadata
marketDataLogger.info('Price threshold crossed', {
  tokenId: 'token-789',
  oldPrice: 0.60,
  newPrice: 0.75,
  threshold: 0.70,
  change: 0.15
});

// ❌ Bad: String interpolation
marketDataLogger.info(`Price ${newPrice} crossed threshold ${threshold}`);
```

### 4. Log State Transitions

```typescript
// ✅ Good: Log important state changes
complianceLogger.info('Trading mode changed', {
  from: 'paper',
  to: 'live',
  reason: 'user_enabled',
  timestamp: Date.now()
});

systemLogger.info('Kill switch activated', {
  scope: 'all',
  reason: 'risk_limit_exceeded',
  openOrders: 5
});
```

### 5. Handle Errors Properly

```typescript
try {
  await placeOrder(params);
  orderFlowLogger.info('Order placed successfully', { orderId });
} catch (error) {
  // ✅ Good: Log with error details
  errorLogger.error('Order placement failed', {
    orderId,
    error: error.message,
    stack: error.stack,
    params: { size: params.size, price: params.price }
  });
}
```

## Examples

### Order Flow

```typescript
// Order lifecycle
orderFlowLogger.info('Order submitted', { orderId, side, size, price });
orderFlowLogger.info('Order confirmed', { orderId, status: 'OPEN' });
orderFlowLogger.info('Partial fill', { orderId, filled: 30, remaining: 70 });
orderFlowLogger.info('Order complete', { orderId, totalFilled: 100 });
orderFlowLogger.warn('Order rejected', { orderId, reason: 'invalid_price' });
```

### Market Data

```typescript
// Market updates
marketDataLogger.info('Orderbook updated', {
  tokenId,
  bids: orderbook.bids.length,
  asks: orderbook.asks.length,
  spread: orderbook.spread
});

marketDataLogger.info('Price change detected', {
  tokenId,
  oldPrice: 0.60,
  newPrice: 0.65,
  change: 0.05,
  percentChange: 8.33
});
```

### Compliance & Safety

```typescript
// Trading gates
complianceLogger.info('Trading gate check', {
  liveTradingEnabled: false,
  complianceAccepted: false,
  result: 'paper_trading'
});

complianceLogger.warn('Risk limit approaching', {
  type: 'position_size',
  limit: 10000,
  current: 9500,
  utilization: 0.95
});

complianceLogger.error('Risk limit exceeded', {
  type: 'daily_loss',
  limit: -1000,
  current: -1200,
  action: 'kill_switch_activated'
});
```

### System Events

```typescript
// Startup
systemLogger.info('Application starting', {
  version: '1.32.0',
  environment: process.env.NODE_ENV,
  port: 3000
});

systemLogger.info('Configuration loaded', {
  paperTrading: true,
  persistenceEnabled: true,
  metricsEnabled: true
});

// Shutdown
systemLogger.info('Graceful shutdown initiated', {
  reason: 'SIGTERM',
  openConnections: 2
});
```

### WebSocket

```typescript
// Connection lifecycle
websocketLogger.info('WebSocket connecting', { url, attempt: 1 });
websocketLogger.info('WebSocket connected', { url });
websocketLogger.warn('WebSocket disconnected', { 
  url, 
  code: 1006, 
  reason: 'Connection lost' 
});
websocketLogger.info('WebSocket reconnecting', { 
  url, 
  attempt: 2, 
  delay: 2000 
});
```

## Integration with Monitoring

### Prometheus Metrics

Log important events alongside metrics:

```typescript
orderFlowLogger.info('Order placed', { orderId, side, size });
orderMetrics.ordersPlaced.inc({ side });
```

### Alerting

Use consistent log format for alert triggers:

```typescript
if (errorRate > 0.1) {
  errorLogger.error('High error rate detected', {
    errorRate,
    threshold: 0.1,
    timeWindow: '5m',
    alert: 'CRITICAL'
  });
}
```

## Troubleshooting

### Logs Not Appearing

Check log level setting:
```bash
# Make sure LOG_LEVEL is set appropriately
echo $LOG_LEVEL
LOG_LEVEL=debug npm run dev
```

### Sensitive Data Not Masked

Verify field names match patterns:
```typescript
// ✅ These are automatically masked
{ address, privateKey, apiKey, secret, token, password }

// ❌ These are NOT masked (use consistent naming)
{ addr, key, credential }
```

### Performance Issues

In production, use JSON output (not pretty):
```bash
NODE_ENV=production npm start  # Disables pretty printing
```

## Advanced Usage

### Child Loggers

Create specialized loggers for sub-components:

```typescript
const orderLogger = orderFlowLogger.category('order-validator');
orderLogger.info('Validating order', { orderId });
```

### Custom Serializers

For advanced use cases, access the underlying Pino logger:

```typescript
const pinoLogger = logger.getPinoLogger();
// Use Pino's advanced features
```

## Migration from Old Logger

The new logger is backward compatible with the old API:

```typescript
// Old code (still works)
logger.info('Message', { key: 'value' });
logger.error('Error', { error: err.message });

// New code (recommended)
orderFlowLogger.info('Message', { key: 'value' });
errorLogger.error('Error', { error: err.message });
```

## References

- [Pino Documentation](https://getpino.io/)
- [ADR-0009: Categorized Logging with Pino](./adr/0009-categorized-logging-with-pino.md)
- [Issue #323: Implement User-Friendly, Categorized Logging](https://github.com/sedarged/polymarket-bot/issues/323)
- Audit Finding A-022: Privacy - Mask sensitive data in logs
