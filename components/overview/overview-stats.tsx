"use client"

import useSWR from "swr"
import { fetchApi, formatNumber } from "@/lib/api"
import type { TradingState, TradingStatus } from "@/lib/types"
import { CardSkeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { Wallet, ShoppingCart, TrendingUp, DollarSign } from "lucide-react"

export function OverviewStats() {
  const { data: status, error: statusError } = useSWR<TradingStatus>(
    "status",
    () => fetchApi<TradingStatus>("/status", true),
    { refreshInterval: 5000 }
  )
  const {
    data: state,
    error: stateError,
    mutate,
  } = useSWR<TradingState>("state", () => fetchApi<TradingState>("/state", true), {
    refreshInterval: 5000,
  })

  const error = statusError || stateError

  if (error) {
    return (
      <ErrorState
        message="Failed to load dashboard data"
        onRetry={() => mutate()}
      />
    )
  }

  if (!status || !state) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const openOrders = state.orders.filter(
    (o) => o.status === "OPEN" || o.status === "PARTIALLY_FILLED"
  ).length
  const balance = state.balances.find((b) => b.currency === "USDC")

  const stats = [
    {
      label: "Wallet",
      value: status.walletAddress
        ? `${status.walletAddress.slice(0, 6)}...${status.walletAddress.slice(-4)}`
        : "Not connected",
      icon: Wallet,
      mono: true,
    },
    {
      label: "Open Orders",
      value: String(openOrders),
      sublabel: "Active",
      icon: ShoppingCart,
    },
    {
      label: "Positions",
      value: String(state.positions.length),
      sublabel: "Markets",
      icon: TrendingUp,
    },
    {
      label: "Balance",
      value: balance ? formatNumber(balance.available) : "0.00",
      sublabel: "USDC",
      icon: DollarSign,
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="group rounded-lg border border-border bg-card p-5 transition-colors duration-150 hover:border-border/80 hover:bg-card/80"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </span>
            <stat.icon className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p
            className={`text-2xl font-semibold text-foreground ${stat.mono ? "font-mono text-sm" : ""}`}
          >
            {stat.value}
          </p>
          {stat.sublabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.sublabel}</p>
          )}
        </div>
      ))}
    </div>
  )
}
