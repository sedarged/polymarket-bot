export interface Token {
  token_id: string;
  outcome: string;
  price: string;
  winner: boolean;
}

export interface Market {
  id: string;
  question: string;
  active: boolean;
  closed: boolean;
  marketSlug: string;
  outcomes: string[];
  outcomePrices: string[];
  tokens: Token[];
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  markets: Market[];
}

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  market: string;
  asset_id: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface OrderbookSummary {
  tokenId: string;
  bestBid: string | null;
  bestAsk: string | null;
  mid: string | null;
  spread: string | null;
}

// WebSocket message types
export interface WSMarketSubscription {
  type: 'market';
  assets_ids: string[];
}

export interface WSOrderbookSnapshot {
  event_type: 'book';
  asset_id: string;
  market: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface WSPriceChange {
  event_type: 'price_change';
  asset_id: string;
  market: string;
  side: 'buy' | 'sell';
  price: string;
  size: string;
  timestamp: number;
}

export interface WSLastTradePrice {
  event_type: 'last_trade_price';
  asset_id: string;
  price: string;
  timestamp: number;
}

export type WSMarketMessage = WSOrderbookSnapshot | WSPriceChange | WSLastTradePrice;

// Trading types
export interface Order {
  orderId: string;
  clientOrderId?: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'MATCHED' | 'CANCELLED';
  createdAt: number;
  filledSize?: string;
  remainingSize?: string;
}

export interface Fill {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  timestamp: number;
  fee?: string;
  fillId?: string;
}

// WebSocket user channel message types for order updates and fills
export interface WSUserOrder {
  event_type: 'order';
  order_id: string;
  client_order_id?: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  price: string;
  original_size: string;
  size_matched: string;
  status: string;
  created_at: number;
}

export interface WSUserFill {
  event_type: 'fill';
  fill_id: string;
  order_id: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  fee: string;
  timestamp: number;
}

export type WSUserMessage = WSUserOrder | WSUserFill;

export interface Position {
  tokenId: string;
  size: string;
  averagePrice: string;
  marketValue?: string;
  unrealizedPnl?: string;
}

export interface Balance {
  currency: string;
  available: string;
  total: string;
}
