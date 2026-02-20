# Test Data Generators

This directory contains test data generators (factory functions) for creating mock test objects with sensible defaults and type-safe overrides.

## Purpose

Test data generators solve the problem of manually constructing test data by providing:
- **Sensible defaults**: Realistic values matching Polymarket conventions
- **Type safety**: Full TypeScript support with autocomplete
- **Uniqueness**: Auto-incrementing IDs prevent collisions
- **Consistency**: Standardized test data across all tests
- **Flexibility**: Easy overrides for specific test scenarios

## Available Generators

### Trading Objects

#### Orders
```typescript
import { createMockOrder, createMockOpenOrder, createMockMatchedOrder } from '../fixtures';

// Basic order with defaults
const order = createMockOrder();
// { orderId: 'order-1', tokenId: '0x1000...', side: 'BUY', price: '0.55', ... }

// Order with overrides
const customOrder = createMockOrder({
  side: 'SELL',
  price: '0.75',
  size: '25'
});

// Specific order states
const openOrder = createMockOpenOrder();           // status: 'OPEN'
const partialOrder = createMockPartiallyFilledOrder(); // status: 'PARTIALLY_FILLED'
const matchedOrder = createMockMatchedOrder();     // status: 'MATCHED'
const cancelledOrder = createMockCancelledOrder(); // status: 'CANCELLED'
```

#### Fills
```typescript
import { createMockFill } from '../fixtures';

const fill = createMockFill();
// { orderId: 'order-1', tokenId: '0x1000...', side: 'BUY', ... }

const customFill = createMockFill({
  orderId: 'my-order-id',
  size: '5',
  fee: '0.005'
});
```

#### Positions & Balances
```typescript
import { createMockPosition, createMockBalance, createMockUsdcBalance } from '../fixtures';

const position = createMockPosition();
const balance = createMockBalance();
const usdcBalance = createMockUsdcBalance('1000'); // 1000 USDC available
```

#### Accounts
```typescript
import { createMockAccount } from '../fixtures';

const account = createMockAccount();
// Includes default USDC balance, empty positions

const customAccount = createMockAccount({
  address: '0xmyaddress',
  positions: [position1, position2],
  tags: ['test', 'demo']
});
```

### Market Objects

#### Tokens, Markets, Events
```typescript
import { createMockToken, createMockMarket, createMockEvent } from '../fixtures';

const token = createMockToken({ outcome: 'Yes', price: '0.60' });
const market = createMockMarket({ question: 'Will it rain?' });
const event = createMockEvent({ title: 'Weather Predictions' });
```

### WebSocket Messages

```typescript
import { createMockWSUserOrder, createMockWSUserFill } from '../fixtures';

const wsOrder = createMockWSUserOrder();
const wsFill = createMockWSUserFill();
```

### Bulk Creation

```typescript
import { createMockOrders, createMockFills, createMockPositions, createMockMarkets } from '../fixtures';

const orders = createMockOrders(5);        // Array of 5 orders
const fills = createMockFills(3);          // Array of 3 fills
const positions = createMockPositions(4);  // Array of 4 positions
const markets = createMockMarkets(2);      // Array of 2 markets

// Apply overrides to all items
const sellOrders = createMockOrders(3, { side: 'SELL' });
```

### Trading Scenarios

For tests requiring related orders and fills:

```typescript
import { createMockTradingScenario } from '../fixtures';

const scenario = createMockTradingScenario({
  orderSize: '100',
  fillCount: 4,
  fillSize: '25'
});
// scenario.order - the order
// scenario.fills - array of related fills with matching IDs
```

## Counter Management

Each generator uses auto-incrementing counters to ensure unique IDs. Reset counters between tests for consistency:

```typescript
import { resetGeneratorCounters } from '../fixtures';

describe('My Test Suite', () => {
  beforeEach(() => {
    resetGeneratorCounters(); // Start fresh for each test
  });

  it('creates order-1', () => {
    const order = createMockOrder();
    expect(order.orderId).toBe('order-1');
  });
});
```

## Migration Examples

### Before (Manual Construction)
```typescript
const order: Order = {
  orderId: 'test-order-1',
  tokenId: '0xtoken123',
  side: 'BUY',
  price: '0.55',
  size: '10',
  status: 'OPEN',
  createdAt: Date.now(),
  filledSize: '0',
  remainingSize: '10',
};
```

### After (Using Generator)
```typescript
const order = createMockOpenOrder({
  orderId: 'test-order-1',
  tokenId: '0xtoken123',
});
```

## Best Practices

1. **Import from fixtures index**: Use `from '../fixtures'` for clean imports
2. **Reset counters**: Call `resetGeneratorCounters()` in `beforeEach` for test isolation
3. **Override only what you need**: Leverage defaults to keep tests focused
4. **Use type-specific generators**: Prefer `createMockOpenOrder` over manual status setting
5. **Use trading scenarios**: For tests requiring related orders and fills

## File Structure

```
tests/fixtures/
├── index.ts          # Central export (import from here)
├── generators.ts     # Trading & market data generators
└── websocket.ts      # WebSocket message generators
```

## Adding New Generators

When adding new generators:
1. Add to `generators.ts` with sensible defaults
2. Follow naming: `createMock<Type>(overrides?: Partial<Type>)`
3. Use auto-incrementing IDs for uniqueness
4. Export from `index.ts`
5. Add tests in `tests/unit/generators.test.ts`
6. Document in this README

## Related Documentation

- [Shared Types](../../packages/shared/src/index.ts) - Type definitions
- [Vitest Documentation](https://vitest.dev/) - Testing framework

## Questions?

For questions or suggestions, please open an issue or reach out to the team.
