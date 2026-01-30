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
