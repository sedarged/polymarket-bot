import { WSOrderbookSnapshot, WSPriceChange, WSLastTradePrice, Orderbook } from '@polymarket/shared';

export const mockTokenId = '0x1234567890abcdef';
export const mockMarket = 'test-market';

export const createMockOrderbookSnapshot = (overrides?: Partial<WSOrderbookSnapshot>): WSOrderbookSnapshot => ({
  event_type: 'book',
  asset_id: mockTokenId,
  market: mockMarket,
  bids: [
    { price: '0.55', size: '100' },
    { price: '0.54', size: '200' },
    { price: '0.53', size: '150' },
  ],
  asks: [
    { price: '0.56', size: '150' },
    { price: '0.57', size: '250' },
    { price: '0.58', size: '100' },
  ],
  timestamp: Date.now(),
  ...overrides,
});

export const createMockPriceChange = (overrides?: Partial<WSPriceChange>): WSPriceChange => ({
  event_type: 'price_change',
  asset_id: mockTokenId,
  market: mockMarket,
  side: 'buy',
  price: '0.55',
  size: '150',
  timestamp: Date.now(),
  ...overrides,
});

export const createMockLastTradePrice = (overrides?: Partial<WSLastTradePrice>): WSLastTradePrice => ({
  event_type: 'last_trade_price',
  asset_id: mockTokenId,
  price: '0.555',
  timestamp: Date.now(),
  ...overrides,
});

export const createMockOrderbook = (overrides?: Partial<Orderbook>): Orderbook => ({
  market: mockMarket,
  asset_id: mockTokenId,
  bids: [
    { price: '0.55', size: '100' },
    { price: '0.54', size: '200' },
  ],
  asks: [
    { price: '0.56', size: '150' },
    { price: '0.57', size: '250' },
  ],
  timestamp: Date.now(),
  ...overrides,
});

export const emptyOrderbook: Orderbook = {
  market: mockMarket,
  asset_id: mockTokenId,
  bids: [],
  asks: [],
  timestamp: Date.now(),
};
