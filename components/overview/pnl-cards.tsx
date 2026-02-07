"use client"

import useSWR from "swr"
import { fetchApi, formatCurrency } from "@/lib/api"
import type { TradingState } from "@/lib/types"
import { CardSkeleton } from "@/components/ui/skeleton"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function PnlCards() {
  const { data: state } = useSWR<TradingState>("state", () => fetchApi<TradingState>("/state", true), {
    refreshInterval: 5000,
  })

  if (!state) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  const unrealizedPnl = state.positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0)

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Realized PnL (24h)
        </span>
        <p className="mt-2 text-3xl font-semibold text-foreground">$0.00</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Unrealized PnL
        </span>
        <div className="mt-2 flex items-end gap-2">
          <p
            className={cn(
              "text-3xl font-semibold",
              unrealizedPnl > 0
                ? "text-success"
                : unrealizedPnl < 0
                  ? "text-danger"
                  : "text-foreground"
            )}
          >
            {formatCurrency(unrealizedPnl)}
          </p>
          {unrealizedPnl !== 0 && (
            <span
              className={cn(
                "mb-1 flex items-center gap-0.5 text-xs font-medium",
                unrealizedPnl > 0 ? "text-success" : "text-danger"
              )}
            >
              {unrealizedPnl > 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">Current Positions</p>
      </div>
    </div>
  )
}
