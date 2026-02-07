export interface TradingStatus {
  liveTrading: boolean
  tradingClientInitialized: boolean
  walletAddress: string | null
  marketFeedConnected: boolean
  circuitBreakers: CircuitBreakerMetric[]
  timestamp: number
}

export interface CircuitBreakerMetric {
  name: string
  state: string
  failures: number
  successes: number
  consecutiveFailures: number
  consecutiveSuccesses: number
}

export interface TradingState {
  orders: Order[]
  positions: Position[]
  fills: Fill[]
  balances: Balance[]
}

export interface Order {
  orderId: string
  tokenId: string
  side: "BUY" | "SELL"
  price: number
  size: number
  status: string
  createdAt: string
}

export interface Position {
  tokenId: string
  size: number
  averagePrice: number
  marketValue?: number
  unrealizedPnl?: number
}

export interface Fill {
  orderId: string
  tokenId: string
  side: "BUY" | "SELL"
  price: number
  size: number
  fee?: number
  timestamp: string
}

export interface Balance {
  currency: string
  available: number
  total: number
}

export interface OrderbookEntry {
  tokenId: string
  market: string
  bids: number
  asks: number
  timestamp: string
  summary: {
    bestBid: number | null
    bestAsk: number | null
    mid: number | null
    spread: number | null
  }
}

export interface HealthData {
  status: string
  uptime: number
  liveTradingEnabled: boolean
  checks?: {
    memory?: {
      details?: {
        heapUsed: number
        heapTotal: number
      }
    }
  }
}

export interface Alert {
  id: number
  type: "danger" | "warning" | "success" | "info"
  message: string
  timestamp: string
}

export interface LogEntry {
  timestamp: string
  level: "error" | "warn" | "info" | "debug"
  message: string
}

export interface EventEntry {
  timestamp: string
  type: string
  message: string
}

export interface ConfigChange {
  timestamp: string
  section: string
  field: string
  oldValue: string
  newValue: string
}
