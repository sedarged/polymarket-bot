"use client"

import { useState } from "react"
import { EmptyState } from "@/components/ui/empty-state"
import { Layers, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const featureGroups = [
  { value: "all", label: "All" },
  { value: "market", label: "Market" },
  { value: "liquidity", label: "Liquidity" },
  { value: "volatility", label: "Volatility" },
  { value: "strategy", label: "Strategy" },
  { value: "risk", label: "Risk" },
]

export function SignalCatalogView() {
  const [activeGroup, setActiveGroup] = useState("all")
  const [search, setSearch] = useState("")

  // No signals are exposed via the API yet - this is a prepared UI
  // that will show signal definitions once the backend exposes a /signals endpoint.

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Signal Catalog
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search signals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Feature group filter tabs */}
      <div className="border-b border-border px-5 py-2">
        <div className="flex items-center gap-0.5">
          {featureGroups.map((group) => (
            <button
              key={group.value}
              onClick={() => setActiveGroup(group.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                activeGroup === group.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {group.label}
            </button>
          ))}
        </div>
      </div>

      <EmptyState
        icon={<Layers className="h-8 w-8" />}
        title="No signals registered"
        description="Signal definitions will appear here once they are added to the catalog. Use the backend API to register signals with versioned definitions."
      />
    </div>
  )
}
