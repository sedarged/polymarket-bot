"use client"

import useSWR from "swr"
import { fetchApi, formatNumber, formatTimestamp } from "@/lib/api"
import type { TradingState } from "@/lib/types"
import { TableSkeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { RefreshCw, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"

export function OrdersTable() {
  const { data, error, mutate, isValidating } = useSWR<TradingState>(
    "state",
    () => fetchApi<TradingState>("/state", true),
    { refreshInterval: 5000 }
  )

  const orders = data?.orders.filter((o) => o.status === "OPEN" || o.status === "PARTIALLY_FILLED") ?? []

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Open Orders
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
          <ErrorState message="Failed to load orders" onRetry={() => mutate()} />
        </div>
      ) : !data ? (
        <div className="p-5">
          <TableSkeleton rows={3} />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-8 w-8" />}
          title="No open orders"
          description="Orders will appear here when the bot places trades."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Order ID</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Token ID</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Side</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Price</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Size</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.orderId}
                  className="border-b border-border/50 transition-colors duration-100 last:border-0 hover:bg-surface-elevated/50"
                >
                  <td className="px-5 py-3 font-mono text-xs text-foreground">{o.orderId.slice(0, 8)}...</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{o.tokenId.slice(0, 10)}...</td>
                  <td className={cn("px-5 py-3 text-xs font-medium", o.side === "BUY" ? "text-success" : "text-danger")}>{o.side}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{formatNumber(o.price, 4)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{formatNumber(o.size)}</td>
                  <td className="px-5 py-3 text-right text-[11px] text-muted-foreground">{formatTimestamp(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
