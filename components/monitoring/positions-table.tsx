"use client"

import useSWR from "swr"
import { fetchApi, formatNumber, formatCurrency } from "@/lib/api"
import type { TradingState } from "@/lib/types"
import { TableSkeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { RefreshCw, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export function PositionsTable() {
  const { data, error, mutate, isValidating } = useSWR<TradingState>(
    "state",
    () => fetchApi<TradingState>("/state", true),
    { refreshInterval: 5000 }
  )

  const positions = data?.positions ?? []

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Positions
        </h3>
        <button
          onClick={() => mutate()}
          disabled={isValidating}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", isValidating && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="p-5">
          <ErrorState message="Failed to load positions" onRetry={() => mutate()} />
        </div>
      ) : !data ? (
        <div className="p-5">
          <TableSkeleton rows={3} />
        </div>
      ) : positions.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-8 w-8" />}
          title="No open positions"
          description="Positions will be displayed here when the bot opens trades."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Token ID</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Size</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avg Price</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Market Value</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Unrealized PnL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pnl = p.unrealizedPnl || 0
                return (
                  <tr
                    key={p.tokenId}
                    className="border-b border-border/50 transition-colors duration-100 last:border-0 hover:bg-surface-elevated/50"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-foreground">{p.tokenId.slice(0, 12)}...</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{formatNumber(p.size)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{formatNumber(p.averagePrice, 4)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{p.marketValue ? formatCurrency(p.marketValue) : "-"}</td>
                    <td className={cn("px-5 py-3 text-right font-mono text-xs", pnl >= 0 ? "text-success" : "text-danger")}>{formatCurrency(pnl)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
