/**
 * Test Data Generators
 * 
 * Factory functions for creating mock test data with sensible defaults
 * and type-safe overrides. Addresses GAP-035.
 * 
 * Usage:
 * ```typescript
 * const order = createMockOrder({ price: '0.60' }); // Override specific fields
 * const position = createMockPosition(); // Use all defaults
 * ```
 */

import type {
  Order,
  Fill,
  Position,
  Balance,
  Account,
  Market,
  Token,
  Event,
  WSUserOrder,
  WSUserFill,
} from '@polymarket/shared';

// Counters for generating unique IDs
let orderIdCounter = 1;
let fillIdCounter = 1;
let tokenIdCounter = 1;
let marketIdCounter = 1;
let eventIdCounter = 1;

/**
 * Reset all ID counters (useful for test isolation)
 */
export function resetGeneratorCounters(): void {
  orderIdCounter = 1;
  fillIdCounter = 1;
  tokenIdCounter = 1;
  marketIdCounter = 1;
  eventIdCounter = 1;
}

/**
 * Generate a unique order ID
 */
function generateOrderId(): string {
  return `order-${orderIdCounter++}`;
}

/**
 * Generate a unique fill ID
 */
function generateFillId(): string {
  return `fill-${fillIdCounter++}`;
}

/**
 * Generate a unique token ID (hex format)
 * Token IDs are exactly 42 characters (0x + 40 hex digits).
 * For very large counter values, we use modulo to keep within 40 hex digits.
 */
function generateTokenId(): string {
  // Use modulo to ensure we stay within 40 hex digits (max value representable in 40 hex digits: 2^160 - 1)
  // Use BigInt for safe arithmetic with large numbers
  const maxValue = BigInt('0x' + 'f'.repeat(40));
  const id = BigInt(tokenIdCounter++) % maxValue;
  return '0x' + id.toString(16).padStart(40, '0');
}

/**
 * Generate a unique market ID
 */
function generateMarketId(): string {
  return `market-${marketIdCounter++}`;
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `event-${eventIdCounter++}`;
}

/**
 * Create a mock Order with sensible defaults
 */
export function createMockOrder(overrides?: Partial<Order>): Order {
  const now = Date.now();
  return {
    orderId: generateOrderId(),
    tokenId: generateTokenId(),
    side: 'BUY',
    price: '0.55',
    size: '10',
    status: 'OPEN',
    createdAt: now,
    filledSize: '0',
    remainingSize: '10',
    ...overrides,
  };
}

/**
 * Create a mock Order with OPEN status
 */
export function createMockOpenOrder(overrides?: Partial<Order>): Order {
  return createMockOrder({
    status: 'OPEN',
    filledSize: '0',
    remainingSize: overrides?.size || '10',
    ...overrides,
  });
}

/**
 * Create a mock Order with PARTIALLY_FILLED status
 */
export function createMockPartiallyFilledOrder(overrides?: Partial<Order>): Order {
  const size = overrides?.size || '10';
  const filledSize = overrides?.filledSize || '5';
  return createMockOrder({
    status: 'PARTIALLY_FILLED',
    size,
    filledSize,
    remainingSize: (parseFloat(size) - parseFloat(filledSize)).toString(),
    ...overrides,
  });
}

/**
 * Create a mock Order with MATCHED status (fully filled)
 */
export function createMockMatchedOrder(overrides?: Partial<Order>): Order {
  const size = overrides?.size || '10';
  return createMockOrder({
    status: 'MATCHED',
    size,
    filledSize: size,
    remainingSize: '0',
    ...overrides,
  });
}

/**
 * Create a mock Order with CANCELLED status
 */
export function createMockCancelledOrder(overrides?: Partial<Order>): Order {
  const size = overrides?.size || '10';
  const filledSize = overrides?.filledSize || '0';
  return createMockOrder({
    status: 'CANCELLED',
    size,
    filledSize,
    remainingSize: (parseFloat(size) - parseFloat(filledSize)).toString(),
    ...overrides,
  });
}

/**
 * Create a mock Fill
 */
export function createMockFill(overrides?: Partial<Fill>): Fill {
  return {
    orderId: generateOrderId(),
    tokenId: generateTokenId(),
    side: 'BUY',
    price: '0.55',
    size: '10',
    timestamp: Date.now(),
    fee: '0.011',
    fillId: generateFillId(),
    ...overrides,
  };
}

/**
 * Create a mock Position
 */
export function createMockPosition(overrides?: Partial<Position>): Position {
  return {
    tokenId: generateTokenId(),
    size: '100',
    averagePrice: '0.55',
    marketValue: '55',
    unrealizedPnl: '5',
    ...overrides,
  };
}

/**
 * Create a mock Balance
 */
export function createMockBalance(overrides?: Partial<Balance>): Balance {
  return {
    currency: 'USDC',
    available: '1000',
    total: '1000',
    ...overrides,
  };
}

/**
 * Create a mock USDC Balance with specified amount
 */
export function createMockUsdcBalance(available: string = '1000', total?: string): Balance {
  return {
    currency: 'USDC',
    available,
    total: total || available,
  };
}

/**
 * Create a mock Account
 */
export function createMockAccount(overrides?: Partial<Account>): Account {
  return {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    balances: [createMockUsdcBalance()],
    positions: [],
    history: [],
    tags: [],
    ...overrides,
  };
}

/**
 * Create a mock Token
 */
export function createMockToken(overrides?: Partial<Token>): Token {
  return {
    token_id: generateTokenId(),
    outcome: 'Yes',
    price: '0.55',
    winner: false,
    ...overrides,
  };
}

/**
 * Create a mock Market
 */
export function createMockMarket(overrides?: Partial<Market>): Market {
  const marketId = generateMarketId();
  return {
    id: marketId,
    question: 'Will the test pass?',
    active: true,
    closed: false,
    marketSlug: `test-market-${marketId}`,
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.55', '0.45'],
    tokens: [
      createMockToken({ outcome: 'Yes', price: '0.55' }),
      createMockToken({ outcome: 'No', price: '0.45' }),
    ],
    ...overrides,
  };
}

/**
 * Create a mock Event
 */
export function createMockEvent(overrides?: Partial<Event>): Event {
  const eventId = generateEventId();
  return {
    id: eventId,
    title: 'Test Event',
    slug: `test-event-${eventId}`,
    markets: [createMockMarket()],
    ...overrides,
  };
}

/**
 * Create a mock WebSocket User Order message
 */
export function createMockWSUserOrder(overrides?: Partial<WSUserOrder>): WSUserOrder {
  return {
    event_type: 'order',
    order_id: generateOrderId(),
    asset_id: generateTokenId(),
    side: 'BUY',
    price: '0.55',
    original_size: '10',
    size_matched: '0',
    status: 'OPEN',
    created_at: Date.now(),
    ...overrides,
  };
}

/**
 * Create a mock WebSocket User Fill message
 */
export function createMockWSUserFill(overrides?: Partial<WSUserFill>): WSUserFill {
  return {
    event_type: 'fill',
    fill_id: generateFillId(),
    order_id: generateOrderId(),
    asset_id: generateTokenId(),
    side: 'BUY',
    price: '0.55',
    size: '10',
    fee: '0.011',
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create multiple orders at once
 */
export function createMockOrders(count: number, overrides?: Partial<Order>): Order[] {
  return Array.from({ length: count }, () => createMockOrder(overrides));
}

/**
 * Create multiple fills at once
 */
export function createMockFills(count: number, overrides?: Partial<Fill>): Fill[] {
  return Array.from({ length: count }, () => createMockFill(overrides));
}

/**
 * Create multiple positions at once
 */
export function createMockPositions(count: number, overrides?: Partial<Position>): Position[] {
  return Array.from({ length: count }, () => createMockPosition(overrides));
}

/**
 * Create multiple markets at once
 */
export function createMockMarkets(count: number, overrides?: Partial<Market>): Market[] {
  return Array.from({ length: count }, () => createMockMarket(overrides));
}

/**
 * Create a complete trading scenario with related Order and Fills
 * 
 * Note: When fillSize is auto-calculated from orderSize/fillCount,
 * the fills may not sum exactly to orderSize due to decimal precision.
 * For precise scenarios, explicitly provide fillSize.
 */
export function createMockTradingScenario(options?: {
  orderSize?: string;
  fillCount?: number;
  fillSize?: string;
  side?: 'BUY' | 'SELL';
  price?: string;
}) {
  const orderSize = options?.orderSize || '10';
  const fillCount = options?.fillCount !== undefined ? options.fillCount : 2;
  const fillSize = options?.fillSize || (parseFloat(orderSize) / fillCount).toFixed(2);
  const side = options?.side || 'BUY';
  const price = options?.price || '0.55';
  
  const orderId = generateOrderId();
  const tokenId = generateTokenId();
  
  const fills = Array.from({ length: fillCount }, () =>
    createMockFill({
      orderId,
      tokenId,
      size: fillSize,
      side,
      price,
    })
  );
  
  // Calculate filled and remaining amounts based on actual fills
  const totalFilled = fills.reduce((acc, fill) => acc + parseFloat(fill.size), 0);
  const remaining = Math.max(0, parseFloat(orderSize) - totalFilled);
  
  // Determine status based on whether order is completely filled
  let status: Order['status'] = 'OPEN';
  if (fillCount > 0) {
    // Only set to MATCHED/PARTIALLY_FILLED if there are actually fills
    status = remaining === 0 ? 'MATCHED' : 'PARTIALLY_FILLED';
  }
  
  const order = createMockOrder({
    orderId,
    tokenId,
    size: orderSize,
    status,
    filledSize: totalFilled.toFixed(2),
    remainingSize: remaining.toFixed(2),
    side,
    price,
  });
  
  return { order, fills };
}
