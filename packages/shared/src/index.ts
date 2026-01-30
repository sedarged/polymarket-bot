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
