"use client"

import { useDashboard } from "@/lib/dashboard-store"
import { EmptyState } from "@/components/ui/empty-state"
import { Radio } from "lucide-react"

export function EventFeed() {
  const { events } = useDashboard()

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Real-Time Event Feed
        </h3>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={<Radio className="h-8 w-8" />}
          title="Waiting for events..."
          description="Real-time bot events will stream here as they occur."
        />
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {events.map((event, i) => (
            <div
              key={`${event.timestamp}-${i}`}
              className="flex items-start gap-3 border-b border-border/30 px-5 py-2.5 last:border-0"
            >
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                {event.type}
              </span>
              <span className="text-xs text-foreground">{event.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
