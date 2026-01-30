import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClient, type BotStatus, type StreamPayload } from "./api/client";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";

const isLocalHost = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch (error) {
    return false;
  }
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
};

export default function App() {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [adminToken, setAdminToken] = useState("");
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [streamEvents, setStreamEvents] = useState<StreamPayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState("connecting");
  const [killConfirm, setKillConfirm] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const adminContext = useMemo(() => ({
    token: adminToken.trim() || undefined,
    isLocal: isLocalHost(backendUrl)
  }), [adminToken, backendUrl]);

  const client = useMemo(() => new ApiClient(backendUrl, adminContext), [backendUrl, adminContext]);

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await client.getStatus();
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    }
  }, [client]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let timeoutId: number | undefined;
    let isActive = true;
    setConnection("connecting");
    setError(null);

    const handleEvent = (payload: StreamPayload) => {
      setStreamEvents((prev) => [payload, ...prev].slice(0, 6));
      if (payload.status) {
        setStatus(payload.status);
      }
    };

    const handleError = () => {
      setConnection("disconnected");
      if (!cleanup || !isActive) {
        return;
      }
      cleanup();
      cleanup = undefined;
      timeoutId = window.setTimeout(() => {
        if (!isActive) {
          return;
        }
        cleanup = client.subscribeWebSocket(handleEvent, () => {
          setConnection("disconnected");
        });
        setConnection("websocket");
      }, 1000);
    };

    cleanup = client.subscribe(handleEvent, handleError);
    setConnection("sse");

    return () => {
      isActive = false;
      cleanup?.();
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [client]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const canControl = adminContext.isLocal || Boolean(adminContext.token);

  const handlePause = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await client.pausePaper();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause");
    } finally {
      setIsBusy(false);
    }
  };

  const handleResume = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await client.resumePaper();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setIsBusy(false);
    }
  };

  const handleKill = async () => {
    if (killConfirm !== "KILL") {
      setError("Type KILL to confirm the kill switch.");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await client.killSwitch("Manual dashboard kill switch");
      setKillConfirm("");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger kill switch");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Polymarket Bot</p>
          <h1>Operations Dashboard</h1>
          <p className="subtitle">Live monitoring with safe controls for paper-only actions.</p>
        </div>
        <div className="badge">
          <span className={`status-dot ${connection}`}></span>
          <span>{connection === "sse" ? "SSE" : connection === "websocket" ? "WebSocket" : connection}</span>
        </div>
      </header>

      <section className="card grid">
        <div>
          <h2>Connection</h2>
          <p className="muted">Use a locally bound backend or supply an admin token to enable controls.</p>
          <label className="label">Backend URL</label>
          <input
            className="input"
            value={backendUrl}
            onChange={(event) => setBackendUrl(event.target.value)}
            placeholder="http://127.0.0.1:3000"
          />
          <label className="label">Admin token (only required when not local)</label>
          <input
            className="input"
            type="password"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="ADMIN_TOKEN"
          />
        </div>
        <div className="status-grid">
          <div className="status-card">
            <h3>LIVE_TRADING</h3>
            <p className={`status-value ${status?.liveTrading ? "danger" : "safe"}`}>
              {status ? (status.liveTrading ? "ENABLED" : "DISABLED") : "UNKNOWN"}
            </p>
            <p className="muted">Read-only — enforced by backend.</p>
          </div>
          <div className="status-card">
            <h3>Paper Mode</h3>
            <p className={`status-value ${status?.paperMode ? "safe" : "danger"}`}>
              {status ? (status.paperMode ? "ON" : "OFF") : "UNKNOWN"}
            </p>
          </div>
          <div className="status-card">
            <h3>Paused</h3>
            <p className={`status-value ${status?.paused ? "danger" : "safe"}`}>
              {status ? (status.paused ? "YES" : "NO") : "UNKNOWN"}
            </p>
          </div>
          <div className="status-card">
            <h3>Uptime</h3>
            <p className="status-value">{status ? formatDuration(status.uptimeSeconds) : "--"}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Safe Controls (paper-only)</h2>
        <div className="controls">
          <button className="button" disabled={!canControl || isBusy} onClick={handlePause}>
            Pause Paper Mode
          </button>
          <button className="button" disabled={!canControl || isBusy} onClick={handleResume}>
            Resume Paper Mode
          </button>
          <div className="kill">
            <label className="label">Kill switch confirmation</label>
            <input
              className="input"
              value={killConfirm}
              onChange={(event) => setKillConfirm(event.target.value)}
              placeholder="Type KILL to confirm"
            />
            <button className="button danger" disabled={!canControl || isBusy} onClick={handleKill}>
              Trigger Kill Switch
            </button>
          </div>
        </div>
        {!canControl && (
          <p className="warning">Controls disabled: backend is not local and no admin token provided.</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>Live Feed</h2>
        <p className="muted">Streaming updates from SSE (with WebSocket fallback).</p>
        <ul className="feed">
          {streamEvents.length === 0 && <li className="muted">Waiting for events…</li>}
          {streamEvents.map((event, index) => (
            <li key={`${event.timestamp}-${index}`}>
              <span className="feed-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
              <span className="feed-type">{event.type.toUpperCase()}</span>
              <span>{event.message ?? "Status update received"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
