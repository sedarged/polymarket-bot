"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Activity,
  Settings2,
  Bell,
  Brain,
} from "lucide-react"

const navigation = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Monitoring", href: "/monitoring", icon: Activity },
  { name: "Controls", href: "/controls", icon: Settings2 },
  { name: "Alerts & Logs", href: "/alerts", icon: Bell },
  { name: "Learning System", href: "/learning", icon: Brain },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-border bg-sidebar">
      {/* App Header */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Activity className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground leading-tight">Polymarket</span>
          <span className="text-[10px] text-muted-foreground leading-tight">Trading Bot</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3" role="navigation" aria-label="Main navigation">
        <ul className="flex flex-col gap-0.5">
          {navigation.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-sidebar-active text-sidebar-active-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors duration-150",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <p className="text-[10px] text-muted-foreground">v1.27.1</p>
      </div>
    </aside>
  )
}
