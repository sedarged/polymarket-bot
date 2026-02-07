"use client"

import { EmptyState } from "@/components/ui/empty-state"
import { Brain, FlaskConical, BarChart3, GitBranch } from "lucide-react"

export function LearningOverview() {
  // The learning system is paper-trading only and runs in the backend.
  // This overview displays a static summary of the system's capabilities
  // and readiness indicators. Live data would come from a dedicated API
  // endpoint (not yet exposed by the backend for the dashboard).

  const modules = [
    {
      label: "Event Store",
      icon: FlaskConical,
      status: "Available",
      description: "Append-only storage for market data, signals, and decisions",
    },
    {
      label: "Signal Catalog",
      icon: BarChart3,
      status: "Available",
      description: "Versioned signal and feature definitions with grouping",
    },
    {
      label: "Backtest Engine",
      icon: GitBranch,
      status: "Available",
      description: "Historical replay and strategy evaluation",
    },
    {
      label: "Bandit Allocator",
      icon: Brain,
      status: "Available",
      description: "Multi-armed bandit algorithms for capital allocation",
    },
  ]

  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        System Modules
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {modules.map((mod) => (
          <div
            key={mod.label}
            className="group rounded-lg border border-border bg-card p-5 transition-colors duration-150 hover:border-border/80 hover:bg-card/80"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {mod.label}
              </span>
              <mod.icon className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-sm font-medium text-foreground">{mod.status}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{mod.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
