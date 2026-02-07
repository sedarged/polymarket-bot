"use client"

import { useState } from "react"
import { ShieldAlert, OctagonX, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/lib/dashboard-store"

export function DangerZone() {
  const [killConfirmOpen, setKillConfirmOpen] = useState(false)
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [cancelAllLoading, setCancelAllLoading] = useState(false)
  const { addAlert } = useDashboard()

  const handleKillSwitch = async () => {
    if (!token.trim()) {
      setError("Admin token is required")
      return
    }
    setLoading(true)
    setError("")
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
      const res = await fetch(`${apiUrl}/kill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      addAlert("danger", "Kill switch activated - all orders cancelled, trading halted")
      setKillConfirmOpen(false)
      setToken("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate kill switch")
    } finally {
      setLoading(false)
    }
  }

  const handleCancelAll = async () => {
    setCancelAllLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
      const adminToken = localStorage.getItem("adminToken") || "dev-test-token-12345"
      const res = await fetch(`${apiUrl}/kill-switch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      addAlert("warning", "All open orders have been cancelled")
    } catch (e) {
      addAlert("danger", e instanceof Error ? e.message : "Failed to cancel orders")
    } finally {
      setCancelAllLoading(false)
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-danger/70">
        Danger Zone
      </h2>
      <div className="rounded-lg border border-danger/20 bg-danger/[0.03]">
        <div className="flex flex-col gap-4 p-5">
          {/* Cancel All Orders */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Cancel All Orders</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Immediately cancel all open and partially filled orders. Trading will continue
                to place new orders after cancellation.
              </p>
            </div>
            <button
              onClick={handleCancelAll}
              disabled={cancelAllLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger transition-all hover:bg-danger/20 active:scale-[0.98] disabled:opacity-50"
            >
              {cancelAllLoading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <OctagonX className="h-3.5 w-3.5" />
              )}
              Cancel All Orders
            </button>
          </div>

          <div className="border-t border-danger/10" />

          {/* Kill Switch */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Emergency Kill Switch</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cancel ALL orders, disable risk manager, and halt all trading activity.
                Requires admin authentication. This cannot be undone remotely.
              </p>
            </div>
            {!killConfirmOpen ? (
              <button
                onClick={() => setKillConfirmOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-danger px-3 py-2 text-xs font-medium text-danger-foreground transition-all hover:bg-danger/90 active:scale-[0.98]"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Activate Kill Switch
              </button>
            ) : (
              <div className="flex shrink-0 flex-col gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Admin token"
                  autoComplete="off"
                  className="w-48 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {error && <p className="text-[11px] text-danger">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setKillConfirmOpen(false)
                      setToken("")
                      setError("")
                    }}
                    className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleKillSwitch}
                    disabled={loading}
                    className="flex-1 rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-danger-foreground transition-all hover:bg-danger/90 active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? "Activating..." : "Confirm"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
