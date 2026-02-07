"use client"

import { useDashboard } from "@/lib/dashboard-store"
import { EmptyState } from "@/components/ui/empty-state"
import { Bell, X, AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

const alertConfig = {
  danger: {
    icon: AlertCircle,
    bg: "bg-danger/10",
    border: "border-danger/20",
    iconColor: "text-danger",
    textColor: "text-danger",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-warning/10",
    border: "border-warning/20",
    iconColor: "text-warning",
    textColor: "text-warning",
  },
  success: {
    icon: CheckCircle2,
    bg: "bg-success/10",
    border: "border-success/20",
    iconColor: "text-success",
    textColor: "text-success",
  },
  info: {
    icon: Info,
    bg: "bg-primary/10",
    border: "border-primary/20",
    iconColor: "text-primary",
    textColor: "text-primary",
  },
}

export function AlertsList() {
  const { alerts, clearAlerts } = useDashboard()

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Active Alerts
        </h3>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear All
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8" />}
          title="No active alerts"
          description="System alerts will appear here when triggered by trading events or errors."
        />
      ) : (
        <div className="flex flex-col gap-2 p-4">
          {alerts.map((alert) => {
            const config = alertConfig[alert.type]
            const Icon = config.icon
            return (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border px-4 py-3 transition-colors duration-150",
                  config.bg,
                  config.border
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconColor)} />
                <div className="flex-1">
                  <p className={cn("text-sm font-medium", config.textColor)}>
                    {alert.message}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
