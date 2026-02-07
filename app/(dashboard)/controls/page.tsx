"use client"

import { RiskSettings } from "@/components/controls/risk-settings"
import { StrategyConfig } from "@/components/controls/strategy-config"
import { DangerZone } from "@/components/controls/danger-zone"

export default function ControlsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Controls</h1>
        <p className="text-sm text-muted-foreground">Risk management, strategy configuration, and safety controls</p>
      </div>
      <RiskSettings />
      <StrategyConfig />
      <DangerZone />
    </div>
  )
}
