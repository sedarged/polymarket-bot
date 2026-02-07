import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    orders: [
      {
        orderId: "0x123abc",
        tokenId: "21742633143463906290569050155826241533067272736897614950488156847949938836455",
        side: "BUY",
        price: 0.52,
        size: 100,
        status: "OPEN",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        orderId: "0x456def",
        tokenId: "71321045679252212594626385532706912750332728571942532289631379312455583992563",
        side: "SELL",
        price: 0.48,
        size: 75,
        status: "PARTIALLY_FILLED",
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
    ],
    positions: [
      {
        tokenId: "21742633143463906290569050155826241533067272736897614950488156847949938836455",
        size: 250,
        averagePrice: 0.51,
        marketValue: 130.5,
        unrealizedPnl: 3.0,
      },
      {
        tokenId: "71321045679252212594626385532706912750332728571942532289631379312455583992563",
        size: -100,
        averagePrice: 0.49,
        marketValue: -48.5,
        unrealizedPnl: -0.5,
      },
    ],
    fills: [
      {
        orderId: "0x789ghi",
        tokenId: "21742633143463906290569050155826241533067272736897614950488156847949938836455",
        side: "BUY",
        price: 0.51,
        size: 50,
        fee: 0.25,
        timestamp: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
    balances: [
      {
        currency: "USDC",
        available: 1247.83,
        total: 1500.0,
      },
    ],
  })
}
