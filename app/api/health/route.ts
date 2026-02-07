import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: 28473,
    liveTradingEnabled: false,
    checks: {
      memory: {
        details: {
          heapUsed: 45.2,
          heapTotal: 128.0,
        },
      },
    },
  })
}
