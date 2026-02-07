"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { Alert, LogEntry, EventEntry, ConfigChange } from "@/lib/types"

console.log("[v0] Dashboard store loading")

interface DashboardState {
  alerts: Alert[]
  logs: LogEntry[]
  events: EventEntry[]
  configChanges: ConfigChange[]
  addAlert: (type: Alert["type"], message: string) => void
  clearAlerts: () => void
  addLog: (level: LogEntry["level"], message: string) => void
  clearLogs: () => void
  addEvent: (type: string, message: string) => void
  addConfigChange: (section: string, field: string, oldValue: string, newValue: string) => void
}

const DashboardContext = createContext<DashboardState | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [events, setEvents] = useState<EventEntry[]>([])
  const [configChanges, setConfigChanges] = useState<ConfigChange[]>([])

  const addAlert = useCallback((type: Alert["type"], message: string) => {
    const alert: Alert = {
      id: Date.now(),
      type,
      message,
      timestamp: new Date().toISOString(),
    }
    setAlerts((prev) => [alert, ...prev])
    if (type === "success") {
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
      }, 5000)
    }
  }, [])

  const clearAlerts = useCallback(() => setAlerts([]), [])

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const log: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    }
    setLogs((prev) => [log, ...prev].slice(0, 500))
  }, [])

  const clearLogs = useCallback(() => setLogs([]), [])

  const addEvent = useCallback((type: string, message: string) => {
    const event: EventEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
    }
    setEvents((prev) => [event, ...prev].slice(0, 100))
  }, [])

  const addConfigChange = useCallback(
    (section: string, field: string, oldValue: string, newValue: string) => {
      const change: ConfigChange = {
        timestamp: new Date().toISOString(),
        section,
        field,
        oldValue,
        newValue,
      }
      setConfigChanges((prev) => [change, ...prev].slice(0, 50))
    },
    []
  )

  return (
    <DashboardContext.Provider
      value={{
        alerts,
        logs,
        events,
        configChanges,
        addAlert,
        clearAlerts,
        addLog,
        clearLogs,
        addEvent,
        addConfigChange,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider")
  return ctx
}
