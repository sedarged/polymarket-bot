const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api"

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem("adminToken")
  if (stored) return stored
  const hostname = window.location.hostname
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return "dev-test-token-12345"
  }
  return null
}

export async function fetchApi<T>(endpoint: string, requiresAuth = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (requiresAuth) {
    const token = getAdminToken()
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
  }
  const response = await fetch(`${API_URL}${endpoint}`, { headers })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

export async function postApi<T>(endpoint: string, data: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const authToken = token || getAdminToken()
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`
  }
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  return response.json()
}

export function formatAddress(address: string | null | undefined): string {
  if (!address) return "-"
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatTimestamp(timestamp: string | number): string {
  return new Date(timestamp).toLocaleString()
}

export function formatNumber(num: number | null | undefined, decimals = 2): string {
  if (num === null || num === undefined || isNaN(num)) return "-"
  return Number(num).toFixed(decimals)
}

export function formatCurrency(num: number | null | undefined, decimals = 2): string {
  if (num === null || num === undefined || isNaN(num)) return "-"
  const formatted = Number(num).toFixed(decimals)
  return Number(num) >= 0 ? `$${formatted}` : `-$${Math.abs(Number(formatted))}`
}
