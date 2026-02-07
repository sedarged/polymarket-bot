"use client"

import { useDashboard } from "@/lib/dashboard-store"
import { EmptyState } from "@/components/ui/empty-state"
import { History, ArrowRight } from "lucide-react"

export function ConfigHistory() {
  const { configChanges } = useDashboard()

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Configuration Change History
        </h3>
      </div>

      {configChanges.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="No configuration changes"
          description="Changes to bot configuration will be tracked and displayed here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Time
                </th>
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Section
                </th>
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Field
                </th>
                <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {configChanges.map((change, i) => (
                <tr
                  key={`${change.timestamp}-${i}`}
                  className="border-b border-border/50 transition-colors duration-100 last:border-0 hover:bg-surface-elevated/50"
                >
                  <td className="px-5 py-3 text-[11px] text-muted-foreground">
                    {new Date(change.timestamp).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                      {change.section}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-foreground">
                    {change.field}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="text-danger line-through">{change.oldValue}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-success">{change.newValue}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
