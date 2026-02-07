"use client"

import { useState } from "react"
import { useDashboard } from "@/lib/dashboard-store"
import { EmptyState } from "@/components/ui/empty-state"
import { ScrollText, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LogEntry } from "@/lib/types"

const levelConfig: Record<LogEntry["level"], { label: string; color: string; bg: string }> = {
  error: { label: "ERR", color: "text-danger", bg: "bg-danger/10" },
  warn: { label: "WRN", color: "text-warning", bg: "bg-warning/10" },
  info: { label: "INF", color: "text-primary", bg: "bg-primary/10" },
  debug: { label: "DBG", color: "text-muted-foreground", bg: "bg-muted" },
}

export function LogsPanel() {
  const { logs, clearLogs } = useDashboard()
  const [filter, setFilter] = useState<LogEntry["level"] | "all">("all")

  const filteredLogs = filter === "all" ? logs : logs.filter((l) => l.level === filter)

  const filterOptions: { value: LogEntry["level"] | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "error", label: "Errors" },
    { value: "warn", label: "Warnings" },
    { value: "info", label: "Info" },
    { value: "debug", label: "Debug" },
  ]

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Activity Logs
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md bg-surface p-0.5">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  filter === opt.value
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title={filter === "all" ? "No log entries" : `No ${filter} logs`}
          description="Activity logs from the trading bot will stream here in real-time."
        />
      ) : (
        <div className="max-h-96 overflow-y-auto font-mono text-xs">
          {filteredLogs.map((log, i) => {
            const config = levelConfig[log.level]
            return (
              <div
                key={`${log.timestamp}-${i}`}
                className="flex items-start gap-3 border-b border-border/30 px-5 py-2 last:border-0 transition-colors duration-100 hover:bg-surface-elevated/30"
              >
                <span className="mt-px shrink-0 text-[11px] text-muted-foreground">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={cn(
                    "mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    config.bg,
                    config.color
                  )}
                >
                  {config.label}
                </span>
                <span className="text-foreground/90">{log.message}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
