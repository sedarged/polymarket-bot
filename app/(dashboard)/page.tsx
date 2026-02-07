"use client"

import { OverviewStats } from "@/components/overview/overview-stats"
import { PnlCards } from "@/components/overview/pnl-cards"
import { WatchedMarkets } from "@/components/overview/watched-markets"

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">Portfolio summary and market overview</p>
      </div>
      <OverviewStats />
      <PnlCards />
      <WatchedMarkets />
    </div>
  )
}
