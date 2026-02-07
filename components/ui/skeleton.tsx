import { cn } from "@/lib/utils"

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} {...props} />
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-20" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Skeleton className="mb-4 h-3 w-32" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
