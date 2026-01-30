export type Market = {
  id: string;
  question: string;
  active: boolean;
  tokenId?: string;
  closeTime?: string;
};

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected';

export type Order = {
  id: string;
  marketId: string;
  tokenId?: string;
  side: OrderSide;
  price: number;
  size: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  live: boolean;
};

export type Fill = {
  id: string;
  orderId: string;
  marketId: string;
  side: OrderSide;
  price: number;
  size: number;
  fee: number;
  timestamp: string;
};

export type Position = {
  marketId: string;
  tokenId?: string;
  size: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  updatedAt: string;
};

export type PnlSnapshot = {
  timestamp: string;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
};

export type LogEntry = {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
};

export type OrderbookLevel = {
  price: number;
  size: number;
};

export type OrderbookSnapshot = {
  marketId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  updatedAt: string;
};
