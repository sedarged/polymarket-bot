"use client"

import { EmptyState } from "@/components/ui/empty-state"
import { GitPullRequest, FlaskConical, Eye, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const stages = [
  {
    label: "Experimental",
    icon: FlaskConical,
    description: "Initial testing phase",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
  },
  {
    label: "Under Review",
    icon: Eye,
    description: "Passed metrics, awaiting review",
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/20",
  },
  {
    label: "Candidate",
    icon: CheckCircle2,
    description: "Approved for continued paper trading",
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/20",
  },
  {
    label: "Rejected",
    icon: XCircle,
    description: "Failed criteria or review",
    color: "text-danger",
    bgColor: "bg-danger/10",
    borderColor: "border-danger/20",
  },
]

export function PromotionPipeline() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Promotion Pipeline
        </h3>
      </div>

      {/* Pipeline stages visualization */}
      <div className="p-5">
        <div className="grid grid-cols-4 gap-3">
          {stages.map((stage, i) => (
            <div
              key={stage.label}
              className={cn(
                "flex flex-col items-center rounded-lg border p-4 text-center transition-colors duration-150",
                stage.borderColor,
                stage.bgColor
              )}
            >
              <stage.icon className={cn("mb-2 h-5 w-5", stage.color)} />
              <span className={cn("text-xs font-semibold", stage.color)}>
                {stage.label}
              </span>
              <span className="mt-1 text-[10px] text-muted-foreground">
                {stage.description}
              </span>
              <span className="mt-2 text-lg font-semibold text-foreground">0</span>
              <span className="text-[10px] text-muted-foreground">strategies</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border">
        <EmptyState
          icon={<GitPullRequest className="h-8 w-8" />}
          title="No strategies in pipeline"
          description="Strategies will appear here once the learning system begins evaluating them. Run backtests and experiments to generate promotion candidates."
          className="py-8"
        />
      </div>
    </div>
  )
}
