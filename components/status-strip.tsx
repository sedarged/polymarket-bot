"use client"

import { cn } from "@/lib/utils"
import { Wifi, WifiOff, RefreshCw, ShieldAlert } from "lucide-react"
import useSWR from "swr"
import { fetchApi } from "@/lib/api"
import type { TradingStatus } from "@/lib/types"
import { useState } from "react"

export function StatusStrip() {
  const { data: status, mutate } = useSWR<TradingStatus>("status", () => fetchApi<TradingStatus>("/status", true), {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })

  const [killSwitchOpen, setKillSwitchOpen] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  const isLive = status?.liveTrading ?? false
  const feedConnected = status?.marketFeedConnected ?? false
  const tradingInit = status?.tradingClientInitialized ?? false

  const handleReconnect = async () => {
    setReconnecting(true)
    setTimeout(async () => {
      await mutate()
      setReconnecting(false)
    }, 1000)
  }

  return (
    <>
      <header className="flex h-11 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-4">
          {/* Mode Badge */}
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
              isLive
                ? "bg-danger/15 text-danger"
                : "bg-warning/15 text-warning"
            )}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                isLive ? "bg-danger animate-pulse" : "bg-warning"
              )}
            />
            {isLive ? "Live" : "Paper"}
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {feedConnected ? (
                <Wifi className="h-3 w-3 text-success" />
              ) : (
                <WifiOff className="h-3 w-3 text-danger" />
              )}
              <span className="text-[11px] text-muted-foreground">
                Feed {feedConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  tradingInit ? "bg-success" : "bg-danger"
                )}
              />
              <span className="text-[11px] text-muted-foreground">
                Trading {tradingInit ? "Ready" : "Offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", reconnecting && "animate-spin")} />
            Reconnect
          </button>
          <button
            onClick={() => setKillSwitchOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <ShieldAlert className="h-3 w-3" />
            Kill Switch
          </button>
        </div>
      </header>

      {/* Kill Switch Modal */}
      {killSwitchOpen && <KillSwitchModal onClose={() => setKillSwitchOpen(false)} />}
    </>
  )
}

function KillSwitchModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    if (!token.trim()) {
      setError("Admin token is required")
      return
    }
    setLoading(true)
    setError("")
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
      const res = await fetch(`${apiUrl}/kill`, { method: "POST", headers })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate kill switch")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kill-switch-title"
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kill-switch-title" className="mb-1 text-lg font-semibold text-foreground">
          Confirm Kill Switch
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          This will immediately cancel ALL open orders and halt trading. This action cannot be undone.
        </p>
        <div className="mb-4">
          <label htmlFor="kill-token" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Admin Token
          </label>
          <input
            id="kill-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter admin token"
            autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-danger-foreground transition-all hover:bg-danger/90 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Activating..." : "Activate Kill Switch"}
          </button>
        </div>
      </div>
    </div>
  )
}
