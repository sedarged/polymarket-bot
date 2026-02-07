import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    liveTrading: false,
    tradingClientInitialized: true,
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    marketFeedConnected: true,
    circuitBreakers: [
      {
        name: "MarketFeed",
        state: "CLOSED",
        failures: 0,
        successes: 142,
        consecutiveFailures: 0,
        consecutiveSuccesses: 142,
      },
      {
        name: "TradingClient",
        state: "CLOSED",
        failures: 0,
        successes: 89,
        consecutiveFailures: 0,
        consecutiveSuccesses: 89,
      },
    ],
    timestamp: Date.now(),
  })
}
