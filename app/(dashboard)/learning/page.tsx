"use client"

import { LearningOverview } from "@/components/learning/learning-overview"
import { PromotionPipeline } from "@/components/learning/promotion-pipeline"
import { SignalCatalogView } from "@/components/learning/signal-catalog-view"

export default function LearningPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Learning System</h1>
        <p className="text-sm text-muted-foreground">
          Strategy experimentation, signal catalog, and promotion workflow
        </p>
      </div>
      <LearningOverview />
      <PromotionPipeline />
      <SignalCatalogView />
    </div>
  )
}
