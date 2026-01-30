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
