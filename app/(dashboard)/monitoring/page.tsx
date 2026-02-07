"use client"

import { OrdersTable } from "@/components/monitoring/orders-table"
import { PositionsTable } from "@/components/monitoring/positions-table"
import { FillsTable } from "@/components/monitoring/fills-table"
import { EventFeed } from "@/components/monitoring/event-feed"

export default function MonitoringPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Monitoring</h1>
        <p className="text-sm text-muted-foreground">Orders, positions, fills, and real-time events</p>
      </div>
      <OrdersTable />
      <PositionsTable />
      <FillsTable />
      <EventFeed />
    </div>
  )
}
