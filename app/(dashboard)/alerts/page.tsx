"use client"

import { AlertsList } from "@/components/alerts/alerts-list"
import { LogsPanel } from "@/components/alerts/logs-panel"
import { ConfigHistory } from "@/components/alerts/config-history"

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Alerts & Logs</h1>
        <p className="text-sm text-muted-foreground">System alerts, activity logs, and configuration change history</p>
      </div>
      <AlertsList />
      <LogsPanel />
      <ConfigHistory />
    </div>
  )
}
