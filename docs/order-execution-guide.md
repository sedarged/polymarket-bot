# Order Execution Service - Usage Guide

This guide demonstrates how to use the `ExecutionService` for placing and managing orders in the Polymarket bot.

## Table of Contents
- [Basic Setup](#basic-setup)
- [Liquidity Validation](#liquidity-validation)
- [Market Orders](#market-orders)
- [Limit Orders](#limit-orders)
- [Conditional Orders](#conditional-orders)
- [Order Cancellation](#order-cancellation)
- [Error Handling](#error-handling)
- [Execution Context](#execution-context)
- [Best Practices](#best-practices)

## Basic Setup

```typescript
import { ExecutionService, OrderTypeEnum, ExecutionStrategy } from './trading/executionService';
import { TradingClient } from './clients/tradingClient';
import { v4 as uuidv4 } from 'uuid';

// Initialize trading client
const tradingClient = new TradingClient();
await tradingClient.initialize();

// Create execution service
const executionService = new ExecutionService(tradingClient);
```

## Liquidity Validation

The ExecutionService supports optional pre-trade liquidity validation to ensure sufficient market liquidity exists before placing orders. This helps prevent failed executions and improves fill quality.

### Enabling Liquidity Validation

```typescript
import { ExecutionService } from './trading/executionService';
import { LiquidityValidator } from './trading/liquidityValidator';
import { marketFeedService } from './server/marketFeedService';
import { TradingClient } from './clients/tradingClient';

// Initialize trading client
const tradingClient = new TradingClient();
await tradingClient.initialize();

// Create liquidity validator with custom configuration
const liquidityValidator = new LiquidityValidator({
  minLiquidityMultiplier: 1.5,  // Require 1.5x order size in liquidity
  maxPriceLevels: 10,            // Check top 10 price levels
  maxOrderbookAgeMs: 5000,       // Maximum 5 second data age
});

// Create execution service with liquidity validation
const executionService = new ExecutionService(tradingClient, {
  liquidityValidator,
  marketFeedService,
});
```

### Configuration Options

**minLiquidityMultiplier** (default: 1.0)
- Minimum liquidity as a multiple of order size
- 1.0 = order size must not exceed available liquidity
- 1.5 = available liquidity must be at least 1.5x order size
- Higher values provide more safety but may reject valid orders

**maxPriceLevels** (default: 10)
- Maximum number of orderbook price levels to check
- Higher values provide more accurate depth analysis
- Lower values improve performance

**maxOrderbookAgeMs** (default: 5000)
- Maximum age of orderbook data in milliseconds
- Orders rejected if orderbook data is older than this
- Should match or be lower than orderbook cache TTL

### How It Works

1. **Before placing each order**, ExecutionService calls LiquidityValidator
2. **Validator checks orderbook data** from MarketFeedService:
   - For BUY orders: checks ASK side liquidity (sellers)
   - For SELL orders: checks BID side liquidity (buyers)
3. **Aggregates liquidity** across multiple price levels
4. **Compares** available liquidity against required threshold
5. **Rejects order** if:
   - Insufficient liquidity exists
   - Orderbook data is missing
   - Orderbook data is stale

### Example: Order Rejection

```typescript
// This order will be rejected if insufficient liquidity
const result = await executionService.executeOrder({
  params: {
    orderType: OrderTypeEnum.LIMIT,
    tokenId: 'token-abc-123',
    side: 'BUY',
    size: '1000',  // Large order
    price: '0.50',
  },
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
  },
});

if (result.status === ExecutionStatus.FAILED && 
    result.error?.name === 'InsufficientLiquidityError') {
  console.log('Order rejected due to insufficient liquidity');
  console.log('Available:', result.error.availableLiquidity);
  console.log('Required:', result.error.requiredLiquidity);
}
```

### Dynamic Configuration

You can update validation thresholds at runtime:

```typescript
liquidityValidator.updateConfig({
  minLiquidityMultiplier: 2.0,  // Increase to 2x for more conservative trading
});
```

### Disabling Validation

To disable liquidity validation, simply don't provide the validator when creating ExecutionService:

```typescript
// No liquidity validation
const executionService = new ExecutionService(tradingClient);
```

### Best Practices

1. **Start conservative**: Use higher multipliers (1.5-2.0) initially
2. **Monitor rejections**: Track how often orders are rejected
3. **Tune thresholds**: Adjust based on your strategy's needs and market conditions
4. **Use with market feed**: Liquidity validation requires WebSocket market feed to be running
5. **Consider volatility**: More volatile markets may need higher multipliers

See [ADR-0010](./adr/0010-pre-trade-liquidity-validation.md) for technical details.

## Market Orders

Market orders execute immediately at the best available price.

### Basic Market Order

```typescript
import { MarketOrderParams, OrderExecutionRequest } from './trading/executionService';

const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.MARKET,
    tokenId: 'token-abc-123',
    side: 'BUY',
    size: '100',
    slippageTolerance: 0.01, // 1% slippage tolerance (optional)
  } as MarketOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
    strategyName: 'my-strategy',
  },
};

const result = await executionService.executeOrder(request);

if (result.status === ExecutionStatus.SUCCESS) {
  console.log('Order placed:', result.order?.orderId);
  console.log('Execution time:', result.executionTimeMs, 'ms');
} else {
  console.error('Order failed:', result.error?.message);
}
```

### Market Order with Deadline

```typescript
const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.MARKET,
    tokenId: 'token-abc-123',
    side: 'SELL',
    size: '50',
  } as MarketOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
    deadline: Date.now() + 30000, // 30 seconds deadline
  },
};

const result = await executionService.executeOrder(request);
```

## Limit Orders

Limit orders execute at a specified price or better.

### Basic Limit Order

```typescript
import { LimitOrderParams } from './trading/executionService';

const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.LIMIT,
    tokenId: 'token-xyz-456',
    side: 'BUY',
    price: '0.55',
    size: '200',
    timeInForce: 'GTC', // Good til cancelled (default)
  } as LimitOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
  },
};

const result = await executionService.executeOrder(request);
```

### Limit Order with IOC (Immediate or Cancel)

```typescript
const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.LIMIT,
    tokenId: 'token-xyz-456',
    side: 'SELL',
    price: '0.65',
    size: '150',
    timeInForce: 'IOC', // Cancel unfilled portion immediately
  } as LimitOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
  },
};

const result = await executionService.executeOrder(request);

// Note: IOC behavior requires additional implementation
// Current version places order but doesn't auto-cancel unfilled portion
```

### Limit Order with Retry Strategy

```typescript
const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.LIMIT,
    tokenId: 'token-xyz-456',
    side: 'BUY',
    price: '0.50',
    size: '300',
  } as LimitOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.RETRY,
    retryPolicy: {
      maxAttempts: 3,
      initialDelayMs: 1000,
    },
  },
};

const result = await executionService.executeOrder(request);
```

## Conditional Orders

Conditional orders are triggered when market conditions are met (future implementation).

### Stop-Loss Order Example

```typescript
import { ConditionalOrderParams } from './trading/executionService';

const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.CONDITIONAL,
    tokenId: 'token-def-789',
    side: 'SELL',
    price: '0.40', // Sell at this price
    size: '100',
    triggerPrice: '0.45', // Trigger when market price goes below 0.45
    triggerCondition: 'BELOW',
  } as ConditionalOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
  },
};

// Note: This will currently throw an error as conditional orders
// require market monitoring implementation
const result = await executionService.executeOrder(request);
```

### Take-Profit Order Example

```typescript
const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.CONDITIONAL,
    tokenId: 'token-def-789',
    side: 'SELL',
    price: '0.75', // Sell at this price
    size: '100',
    triggerPrice: '0.70', // Trigger when market price goes above 0.70
    triggerCondition: 'ABOVE',
  } as ConditionalOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
  },
};
```

## Order Cancellation

### Cancel Single Order

```typescript
const executionId = uuidv4();
const orderId = 'order-123-abc';

const cancelled = await executionService.cancelOrder(orderId, executionId);

if (cancelled) {
  console.log('Order cancelled successfully');
} else {
  console.error('Failed to cancel order');
}
```

### Cancel All Orders for a Token

```typescript
const executionId = uuidv4();
const tokenId = 'token-abc-123';

const cancelledCount = await executionService.cancelAllOrders(tokenId, executionId);
console.log(`Cancelled ${cancelledCount} orders for token ${tokenId}`);
```

## Error Handling

### Handling Specific Error Types

```typescript
import {
  OrderRejectedError,
  InsufficientLiquidityError,
  ExecutionTimeoutError,
  ExecutionStatus,
} from './trading/executionService';

const result = await executionService.executeOrder(request);

if (result.status === ExecutionStatus.FAILED && result.error) {
  if (result.error instanceof OrderRejectedError) {
    console.error('Order rejected:', result.error.reason);
    console.error('Order params:', result.error.orderParams);
    // Handle rejection (e.g., adjust parameters and retry)
  } else if (result.error instanceof InsufficientLiquidityError) {
    console.error('Insufficient liquidity:', result.error.availableLiquidity);
    // Handle liquidity issue (e.g., split order)
  } else if (result.error instanceof ExecutionTimeoutError) {
    console.error('Execution timeout:', result.error.deadline);
    // Handle timeout (e.g., cancel and retry)
  } else {
    console.error('Unknown error:', result.error.message);
  }
}
```

### Retry on Failure

```typescript
async function executeWithRetry(request: OrderExecutionRequest, maxRetries: number = 3) {
  let lastResult;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    lastResult = await executionService.executeOrder(request);
    
    if (lastResult.status === ExecutionStatus.SUCCESS) {
      return lastResult;
    }
    
    console.log(`Attempt ${attempt + 1} failed, retrying...`);
    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
  }
  
  return lastResult;
}
```

## Execution Context

### Using Execution Metadata

```typescript
const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.MARKET,
    tokenId: 'token-abc-123',
    side: 'BUY',
    size: '100',
  } as MarketOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
    strategyName: 'market-making-v2',
    metadata: {
      signal: 'bullish',
      confidence: 0.85,
      portfolioId: 'portfolio-1',
      riskLevel: 'medium',
    },
  },
};

const result = await executionService.executeOrder(request);

// Metadata is logged and can be used for analysis
console.log('Execution metadata:', request.context.metadata);
```

### Using Custom Retry Policies

```typescript
const request: OrderExecutionRequest = {
  params: {
    orderType: OrderTypeEnum.LIMIT,
    tokenId: 'token-xyz-456',
    side: 'BUY',
    price: '0.55',
    size: '200',
  } as LimitOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.RETRY,
    retryPolicy: {
      maxAttempts: 5,
      initialDelayMs: 2000,
    },
  },
};
```

## Best Practices

### 1. Always Use Unique Execution IDs

```typescript
import { v4 as uuidv4 } from 'uuid';

// Good: Use UUID for each execution
const executionId = uuidv4();

// Bad: Reusing execution IDs
// const executionId = 'fixed-id'; // DON'T DO THIS
```

### 2. Set Appropriate Deadlines

```typescript
// For time-sensitive trading signals
const deadline = Date.now() + 5000; // 5 seconds

// For less urgent orders
const deadline = Date.now() + 60000; // 60 seconds

const request: OrderExecutionRequest = {
  params: { /* ... */ } as MarketOrderParams,
  context: {
    executionId: uuidv4(),
    executionStrategy: ExecutionStrategy.IMMEDIATE,
    deadline,
  },
};
```

### 3. Handle All Execution Statuses

```typescript
const result = await executionService.executeOrder(request);

switch (result.status) {
  case ExecutionStatus.SUCCESS:
    // Order placed successfully
    handleSuccess(result);
    break;
  case ExecutionStatus.PARTIAL:
    // Order partially filled (future implementation)
    handlePartial(result);
    break;
  case ExecutionStatus.FAILED:
    // Order failed
    handleFailure(result);
    break;
  case ExecutionStatus.REJECTED:
    // Order rejected by exchange
    handleRejection(result);
    break;
  case ExecutionStatus.TIMEOUT:
    // Execution deadline exceeded
    handleTimeout(result);
    break;
  case ExecutionStatus.CANCELLED:
    // Order cancelled
    handleCancellation(result);
    break;
}
```

### 4. Log Execution Results

```typescript
import { logger } from './utils/logger';

const result = await executionService.executeOrder(request);

logger.info('Order execution completed', {
  category: 'ORDER_FLOW',
  executionId: request.context.executionId,
  status: result.status,
  orderId: result.order?.orderId,
  executionTimeMs: result.executionTimeMs,
  retryAttempts: result.retryAttempts,
});
```

### 5. Monitor Execution Statistics

```typescript
// Periodically check execution statistics
setInterval(() => {
  const stats = executionService.getExecutionStats();
  
  console.log('Execution Statistics:', {
    totalExecutions: stats.totalExecutions,
    successRate: stats.successfulExecutions / stats.totalExecutions,
    failureRate: stats.failedExecutions / stats.totalExecutions,
    averageLatency: stats.averageExecutionTimeMs,
  });
}, 60000); // Every minute
```

### 6. Use Appropriate Execution Strategies

```typescript
// For critical orders that must succeed or fail quickly
context: {
  executionStrategy: ExecutionStrategy.IMMEDIATE,
}

// For orders that can be retried
context: {
  executionStrategy: ExecutionStrategy.RETRY,
  retryPolicy: { maxAttempts: 3, initialDelayMs: 1000 },
}

// For large orders that might need to be split (future)
context: {
  executionStrategy: ExecutionStrategy.SPLIT,
}

// For orders that can have parameters adjusted (future)
context: {
  executionStrategy: ExecutionStrategy.MODIFY_AND_RETRY,
}
```

## Integration with Trading Strategies

### Example: Market Making Strategy

```typescript
import { BaseStrategy } from './trading/strategies/BaseStrategy';

class MarketMakingStrategy extends BaseStrategy {
  constructor(
    private executionService: ExecutionService,
    // ... other dependencies
  ) {
    super();
  }

  async execute() {
    const spread = this.calculateSpread();
    const size = this.calculateOrderSize();

    // Place buy order
    const buyRequest: OrderExecutionRequest = {
      params: {
        orderType: OrderTypeEnum.LIMIT,
        tokenId: this.tokenId,
        side: 'BUY',
        price: spread.bid,
        size: size,
      } as LimitOrderParams,
      context: {
        executionId: uuidv4(),
        executionStrategy: ExecutionStrategy.RETRY,
        strategyName: 'market-making',
      },
    };

    // Place sell order
    const sellRequest: OrderExecutionRequest = {
      params: {
        orderType: OrderTypeEnum.LIMIT,
        tokenId: this.tokenId,
        side: 'SELL',
        price: spread.ask,
        size: size,
      } as LimitOrderParams,
      context: {
        executionId: uuidv4(),
        executionStrategy: ExecutionStrategy.RETRY,
        strategyName: 'market-making',
      },
    };

    // Execute both orders
    const [buyResult, sellResult] = await Promise.all([
      this.executionService.executeOrder(buyRequest),
      this.executionService.executeOrder(sellRequest),
    ]);

    return { buyResult, sellResult };
  }
}
```

## See Also

- [ADR-0007: Order Execution Service Architecture](../adr/0007-order-execution-service.md)
- [Common Pitfalls](./ai/common-pitfalls.md)
- [API Documentation](./ARCHITECTURE.md)
- [Testing Guide](./TESTING.md)
