"use client"

import useSWR from "swr"
import { fetchApi, formatTimestamp } from "@/lib/api"
import type { OrderbookEntry } from "@/lib/types"
import { TableSkeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { BarChart3 } from "lucide-react"

export function WatchedMarkets() {
  const { data, error, mutate } = useSWR<OrderbookEntry[]>("orderbooks", () =>
    fetchApi<OrderbookEntry[]>("/orderbooks")
  , { refreshInterval: 5000 })

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Watched Markets
        </h3>
        <ErrorState message="Failed to load markets" onRetry={() => mutate()} />
      </div>
    )
  }

  if (!data) {
    return <TableSkeleton rows={4} />
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Watched Markets
        </h3>
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="No markets being watched"
          description="Configure token IDs in your bot settings to start monitoring markets."
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Watched Markets
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Token ID
              </th>
              <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Best Bid
              </th>
              <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Best Ask
              </th>
              <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Mid Price
              </th>
              <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Spread
              </th>
              <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Last Update
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr
                key={m.tokenId}
                className="border-b border-border/50 transition-colors duration-100 last:border-0 hover:bg-surface-elevated/50"
              >
                <td className="px-5 py-3 font-mono text-xs text-foreground">
                  {m.tokenId.slice(0, 12)}...
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-success">
                  {m.summary.bestBid ?? "-"}
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-danger">
                  {m.summary.bestAsk ?? "-"}
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-foreground">
                  {m.summary.mid ?? "-"}
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                  {m.summary.spread ?? "-"}
                </td>
                <td className="px-5 py-3 text-right text-[11px] text-muted-foreground">
                  {formatTimestamp(m.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
