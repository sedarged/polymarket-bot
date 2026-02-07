"use client"

import useSWR from "swr"
import { fetchApi, formatNumber } from "@/lib/api"
import type { TradingStatus } from "@/lib/types"
import { CardSkeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { Shield, AlertTriangle, Gauge, BarChart2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function RiskSettings() {
  const { data: status, error, mutate } = useSWR<TradingStatus>(
    "status",
    () => fetchApi<TradingStatus>("/status", true),
    { refreshInterval: 5000 }
  )

  if (error) {
    return <ErrorState message="Failed to load risk data" onRetry={() => mutate()} />
  }

  if (!status) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const circuitBreaker = status.circuitBreakers?.[0]

  const riskCards = [
    {
      label: "Circuit Breaker",
      value: circuitBreaker?.state ?? "N/A",
      icon: Shield,
      statusColor:
        circuitBreaker?.state === "CLOSED"
          ? "text-success"
          : circuitBreaker?.state === "HALF_OPEN"
            ? "text-warning"
            : circuitBreaker?.state === "OPEN"
              ? "text-danger"
              : "text-muted-foreground",
      description: "Auto-resets after timeout when tripped",
    },
    {
      label: "Consecutive Failures",
      value: String(circuitBreaker?.consecutiveFailures ?? 0),
      icon: AlertTriangle,
      statusColor:
        (circuitBreaker?.consecutiveFailures ?? 0) > 3
          ? "text-danger"
          : (circuitBreaker?.consecutiveFailures ?? 0) > 1
            ? "text-warning"
            : "text-muted-foreground",
      description: "Failures before circuit breaker trips",
    },
    {
      label: "Total Failures",
      value: String(circuitBreaker?.failures ?? 0),
      icon: Gauge,
      statusColor: "text-muted-foreground",
      description: "All-time failure count",
    },
    {
      label: "Total Successes",
      value: String(circuitBreaker?.successes ?? 0),
      icon: BarChart2,
      statusColor: "text-muted-foreground",
      description: "All-time success count",
    },
  ]

  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Risk Management
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {riskCards.map((card) => (
          <div
            key={card.label}
            className="group rounded-lg border border-border bg-card p-5 transition-colors duration-150 hover:border-border/80 hover:bg-card/80"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </span>
              <card.icon className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className={cn("text-2xl font-semibold", card.statusColor)}>
              {card.value}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
