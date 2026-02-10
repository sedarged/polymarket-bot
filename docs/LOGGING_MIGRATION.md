# Logging Migration Examples

This document provides practical examples of how to migrate code from the old logger to use the new categorized logging system.

## Migration is Optional

The new logger is **backward compatible** with the old API. All existing code will continue to work:

```typescript
// Old code - still works fine
import { logger } from './utils/logger';
logger.info('Message', { key: 'value' });
```

However, using category loggers provides **better organization and filtering**:

```typescript
// New code - recommended for new development
import { orderFlowLogger } from './utils/logger';
orderFlowLogger.info('Message', { key: 'value' });
```

## Migration Examples

### Example 1: Order Flow Logging

**Before:**
```typescript
import { logger } from '../utils/logger';

export class OrderManager {
  async placeOrder(params: OrderParams) {
    logger.info('Placing order', { orderId: params.id, size: params.size });
    
    try {
      const result = await this.client.submitOrder(params);
      logger.info('Order placed successfully', { orderId: params.id });
      return result;
    } catch (error) {
      logger.error('Order placement failed', { 
        orderId: params.id, 
        error: error.message 
      });
      throw error;
    }
  }
}
```

**After:**
```typescript
import { orderFlowLogger, errorLogger } from '../utils/logger';

export class OrderManager {
  async placeOrder(params: OrderParams) {
    // Use orderFlowLogger for order-related logs
    orderFlowLogger.info('Placing order', { orderId: params.id, size: params.size });
    
    try {
      const result = await this.client.submitOrder(params);
      orderFlowLogger.info('Order placed successfully', { orderId: params.id });
      return result;
    } catch (error) {
      // Use errorLogger for errors
      errorLogger.error('Order placement failed', { 
        orderId: params.id, 
        error: error.message 
      });
      throw error;
    }
  }
}
```

### Example 2: Market Data Logging

**Before:**
```typescript
import { logger } from '../utils/logger';

export class MarketFeedClient {
  private handlePriceChange(message: PriceChangeMessage) {
    logger.info('Price changed', {
      tokenId: message.asset_id,
      price: message.price,
    });
    
    if (message.price > this.alertThreshold) {
      logger.warn('Price threshold exceeded', {
        tokenId: message.asset_id,
        price: message.price,
        threshold: this.alertThreshold,
      });
    }
  }
}
```

**After:**
```typescript
import { marketDataLogger } from '../utils/logger';

export class MarketFeedClient {
  private handlePriceChange(message: PriceChangeMessage) {
    // Use marketDataLogger for market updates
    marketDataLogger.info('Price changed', {
      tokenId: message.asset_id,
      price: message.price,
    });
    
    if (message.price > this.alertThreshold) {
      marketDataLogger.warn('Price threshold exceeded', {
        tokenId: message.asset_id,
        price: message.price,
        threshold: this.alertThreshold,
      });
    }
  }
}
```

### Example 3: Compliance & Risk Management

**Before:**
```typescript
import { logger } from '../utils/logger';

export class RiskManager {
  checkTradingGates(): boolean {
    const canTrade = this.liveTradingEnabled && this.complianceAccepted;
    
    logger.info('Trading gate check', {
      liveTradingEnabled: this.liveTradingEnabled,
      complianceAccepted: this.complianceAccepted,
      result: canTrade ? 'allowed' : 'blocked',
    });
    
    if (!canTrade) {
      logger.warn('Live trading not enabled, using paper mode');
    }
    
    return canTrade;
  }
  
  checkRiskLimits(position: Position): boolean {
    const utilization = position.value / this.maxPositionSize;
    
    if (utilization > 0.9) {
      logger.warn('Risk limit approaching', {
        utilization,
        positionValue: position.value,
        limit: this.maxPositionSize,
      });
    }
    
    return utilization <= 1.0;
  }
}
```

**After:**
```typescript
import { complianceLogger } from '../utils/logger';

export class RiskManager {
  checkTradingGates(): boolean {
    const canTrade = this.liveTradingEnabled && this.complianceAccepted;
    
    // Use complianceLogger for trading gate checks
    complianceLogger.info('Trading gate check', {
      liveTradingEnabled: this.liveTradingEnabled,
      complianceAccepted: this.complianceAccepted,
      result: canTrade ? 'allowed' : 'blocked',
    });
    
    if (!canTrade) {
      complianceLogger.warn('Live trading not enabled, using paper mode');
    }
    
    return canTrade;
  }
  
  checkRiskLimits(position: Position): boolean {
    const utilization = position.value / this.maxPositionSize;
    
    if (utilization > 0.9) {
      // Use complianceLogger for risk warnings
      complianceLogger.warn('Risk limit approaching', {
        utilization,
        positionValue: position.value,
        limit: this.maxPositionSize,
      });
    }
    
    return utilization <= 1.0;
  }
}
```

### Example 4: WebSocket Connections

**Before:**
```typescript
import { logger } from '../utils/logger';

export class WebSocketClient {
  private setupEventHandlers(): void {
    this.ws.on('open', () => {
      logger.info('WebSocket connected', { url: this.url });
    });
    
    this.ws.on('close', (code, reason) => {
      logger.warn('WebSocket disconnected', { 
        url: this.url,
        code, 
        reason 
      });
      this.reconnect();
    });
    
    this.ws.on('error', (error) => {
      logger.error('WebSocket error', { 
        url: this.url,
        error: error.message 
      });
    });
  }
  
  private reconnect(): void {
    this.reconnectAttempts++;
    logger.info('Reconnecting WebSocket', {
      url: this.url,
      attempt: this.reconnectAttempts,
      delay: this.getReconnectDelay(),
    });
    
    setTimeout(() => this.connect(), this.getReconnectDelay());
  }
}
```

**After:**
```typescript
import { websocketLogger, errorLogger } from '../utils/logger';

export class WebSocketClient {
  private setupEventHandlers(): void {
    this.ws.on('open', () => {
      // Use websocketLogger for connection events
      websocketLogger.info('WebSocket connected', { url: this.url });
    });
    
    this.ws.on('close', (code, reason) => {
      websocketLogger.warn('WebSocket disconnected', { 
        url: this.url,
        code, 
        reason 
      });
      this.reconnect();
    });
    
    this.ws.on('error', (error) => {
      // Use errorLogger for errors
      errorLogger.error('WebSocket error', { 
        url: this.url,
        error: error.message 
      });
    });
  }
  
  private reconnect(): void {
    this.reconnectAttempts++;
    websocketLogger.info('Reconnecting WebSocket', {
      url: this.url,
      attempt: this.reconnectAttempts,
      delay: this.getReconnectDelay(),
    });
    
    setTimeout(() => this.connect(), this.getReconnectDelay());
  }
}
```

### Example 5: System Lifecycle

**Before:**
```typescript
import { logger } from '../utils/logger';

export async function startServer() {
  logger.info('Server starting', {
    port: config.port,
    environment: process.env.NODE_ENV,
  });
  
  const server = await initializeServer();
  
  logger.info('Server started successfully', {
    port: config.port,
    uptime: process.uptime(),
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await server.close();
    logger.info('Server shut down complete');
    process.exit(0);
  });
}
```

**After:**
```typescript
import { systemLogger } from '../utils/logger';

export async function startServer() {
  // Use systemLogger for system lifecycle events
  systemLogger.info('Server starting', {
    port: config.port,
    environment: process.env.NODE_ENV,
  });
  
  const server = await initializeServer();
  
  systemLogger.info('Server started successfully', {
    port: config.port,
    uptime: process.uptime(),
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    systemLogger.info('SIGTERM received, shutting down gracefully');
    await server.close();
    systemLogger.info('Server shut down complete');
    process.exit(0);
  });
}
```

### Example 6: API Client

**Before:**
```typescript
import { logger } from '../utils/logger';
import { CircuitBreaker } from '../utils/circuitBreaker';

export class ApiClient {
  private circuitBreaker: CircuitBreaker;
  
  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      name: 'api-client',
      failureThreshold: 5,
    });
    
    this.circuitBreaker.on('open', (metrics) => {
      logger.error('Circuit breaker opened', metrics);
    });
    
    this.circuitBreaker.on('halfOpen', () => {
      logger.info('Circuit breaker half-open, testing');
    });
    
    this.circuitBreaker.on('close', () => {
      logger.info('Circuit breaker closed, service recovered');
    });
  }
  
  async fetchData(params: Params) {
    logger.debug('API request starting', { endpoint: params.endpoint });
    
    try {
      const response = await this.circuitBreaker.execute(() =>
        this.makeRequest(params)
      );
      
      logger.debug('API request successful', { 
        endpoint: params.endpoint,
        duration: response.duration 
      });
      
      return response.data;
    } catch (error) {
      logger.error('API request failed', {
        endpoint: params.endpoint,
        error: error.message,
      });
      throw error;
    }
  }
}
```

**After:**
```typescript
import { apiLogger, errorLogger } from '../utils/logger';
import { CircuitBreaker } from '../utils/circuitBreaker';

export class ApiClient {
  private circuitBreaker: CircuitBreaker;
  
  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      name: 'api-client',
      failureThreshold: 5,
    });
    
    // Use apiLogger for circuit breaker events
    this.circuitBreaker.on('open', (metrics) => {
      apiLogger.error('Circuit breaker opened', metrics);
    });
    
    this.circuitBreaker.on('halfOpen', () => {
      apiLogger.info('Circuit breaker half-open, testing');
    });
    
    this.circuitBreaker.on('close', () => {
      apiLogger.info('Circuit breaker closed, service recovered');
    });
  }
  
  async fetchData(params: Params) {
    apiLogger.debug('API request starting', { endpoint: params.endpoint });
    
    try {
      const response = await this.circuitBreaker.execute(() =>
        this.makeRequest(params)
      );
      
      apiLogger.debug('API request successful', { 
        endpoint: params.endpoint,
        duration: response.duration 
      });
      
      return response.data;
    } catch (error) {
      // Use errorLogger for API errors
      errorLogger.error('API request failed', {
        endpoint: params.endpoint,
        error: error.message,
      });
      throw error;
    }
  }
}
```

## Category Selection Guide

Use this guide to choose the right category logger:

| Use Case | Category Logger | Import |
|----------|----------------|---------|
| Order placement, fills, cancellations | `orderFlowLogger` | `import { orderFlowLogger } from './utils/logger'` |
| Price updates, orderbook changes | `marketDataLogger` | `import { marketDataLogger } from './utils/logger'` |
| Trading gates, risk checks, kill switch | `complianceLogger` | `import { complianceLogger } from './utils/logger'` |
| Startup, shutdown, configuration | `systemLogger` | `import { systemLogger } from './utils/logger'` |
| WebSocket connect/disconnect | `websocketLogger` | `import { websocketLogger } from './utils/logger'` |
| API calls, rate limits, circuit breakers | `apiLogger` | `import { apiLogger } from './utils/logger'` |
| Backtesting, strategy selection | `learningLogger` | `import { learningLogger } from './utils/logger'` |
| General errors and exceptions | `errorLogger` | `import { errorLogger } from './utils/logger'` |
| Database operations | `databaseLogger` | `import { databaseLogger } from './utils/logger'` |
| Audit trail, compliance logging | `auditLogger` | `import { auditLogger } from './utils/logger'` |
| General purpose (default) | `logger` | `import { logger } from './utils/logger'` |

## Migration Strategy

### For New Code
- Use category loggers from the start
- Choose the most specific category that fits

### For Existing Code
- Migration is optional (backward compatible)
- Migrate files as you work on them
- Focus on high-value categories first:
  1. Order flow (critical for trading)
  2. Compliance (critical for safety)
  3. WebSocket (critical for reliability)
  4. Market data (high volume)

### No Migration Needed
- If code uses `logger.info()`, `logger.error()`, etc., it will continue to work
- Logs will use `category: "general"` automatically
- You can gradually introduce category loggers when touching files

## Testing Categorized Logs

To see logs from a specific category in development:

```bash
# All logs with pretty printing
LOG_LEVEL=debug NODE_ENV=development npm run dev

# Filter for specific category (use grep)
LOG_LEVEL=debug NODE_ENV=development npm run dev 2>&1 | grep "\[orderFlow\]"
```

In production with JSON output:

```bash
# All logs in JSON format
NODE_ENV=production npm start

# Filter with jq for specific category
NODE_ENV=production npm start 2>&1 | jq 'select(.category == "orderFlow")'
```

## Summary

- ✅ Backward compatible - no breaking changes
- ✅ Migrate at your own pace
- ✅ Use category loggers for better organization
- ✅ Sensitive data is automatically masked
- ✅ Same API, just import different logger instances

## See Also

- [Logging Guide](./LOGGING.md) - Complete logging documentation
- [ADR-0009](./adr/0009-categorized-logging-with-pino.md) - Logging architecture decision
