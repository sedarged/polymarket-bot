"use client"

import { Sidebar } from "@/components/sidebar"
import { StatusStrip } from "@/components/status-strip"
import { DashboardProvider } from "@/lib/dashboard-store"
import { SWRConfig } from "swr"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        dedupingInterval: 2000,
      }}
    >
      <DashboardProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col pl-56">
            <StatusStrip />
            <main className="flex-1 overflow-y-auto px-6 py-5">
              {children}
            </main>
          </div>
        </div>
      </DashboardProvider>
    </SWRConfig>
  )
}
