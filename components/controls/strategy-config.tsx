"use client"

import useSWR from "swr"
import { fetchApi, formatNumber } from "@/lib/api"
import type { TradingStatus, HealthData } from "@/lib/types"
import { CardSkeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { Settings, Clock, Cpu, HardDrive } from "lucide-react"

export function StrategyConfig() {
  const { data: health, error: healthError, mutate: mutateHealth } = useSWR<HealthData>(
    "health",
    () => fetchApi<HealthData>("/health"),
    { refreshInterval: 10000 }
  )

  const { data: status, error: statusError, mutate: mutateStatus } = useSWR<TradingStatus>(
    "status",
    () => fetchApi<TradingStatus>("/status", true),
    { refreshInterval: 5000 }
  )

  const error = healthError || statusError

  if (error) {
    return (
      <ErrorState
        message="Failed to load configuration data"
        onRetry={() => {
          mutateHealth()
          mutateStatus()
        }}
      />
    )
  }

  if (!health || !status) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const uptimeHours = (health.uptime / 3600).toFixed(1)
  const heapUsedMB = health.checks?.memory?.details
    ? (health.checks.memory.details.heapUsed / 1024 / 1024).toFixed(1)
    : "N/A"
  const heapTotalMB = health.checks?.memory?.details
    ? (health.checks.memory.details.heapTotal / 1024 / 1024).toFixed(1)
    : "N/A"

  const configItems = [
    {
      label: "Trading Mode",
      value: status.liveTrading ? "Live" : "Paper",
      icon: Settings,
      description: status.liveTrading
        ? "Executing real orders on Polymarket"
        : "Simulated trading with no real funds at risk",
    },
    {
      label: "Uptime",
      value: `${uptimeHours}h`,
      icon: Clock,
      description: "Time since last server restart",
    },
    {
      label: "Memory Usage",
      value: `${heapUsedMB} MB`,
      icon: Cpu,
      description: `Heap: ${heapUsedMB} / ${heapTotalMB} MB`,
    },
    {
      label: "Health Status",
      value: health.status,
      icon: HardDrive,
      description: "Overall system health check",
    },
  ]

  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        System Configuration
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {configItems.map((item) => (
          <div
            key={item.label}
            className="group rounded-lg border border-border bg-card p-5 transition-colors duration-150 hover:border-border/80 hover:bg-card/80"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {item.label}
              </span>
              <item.icon className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-2xl font-semibold text-foreground">{item.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
