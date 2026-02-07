"use client"

import { cn } from "@/lib/utils"
import { AlertCircle, RefreshCw } from "lucide-react"

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  message = "Something went wrong",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/20 bg-danger/5 py-8 text-center",
        className
      )}
    >
      <AlertCircle className="h-5 w-5 text-danger" />
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  )
}
