export type BotStatus = {
  liveTrading: boolean;
  paused: boolean;
  paperMode: boolean;
  uptimeSeconds: number;
  lastUpdate: string;
};

export type StreamPayload = {
  type: "status" | "log" | "alert";
  message?: string;
  status?: BotStatus;
  timestamp: string;
};

export type AdminContext = {
  token?: string;
  isLocal: boolean;
};

export class ApiClient {
  private baseUrl: string;
  private adminContext: AdminContext;

  constructor(baseUrl: string, adminContext: AdminContext) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.adminContext = adminContext;
  }

  setAdminContext(context: AdminContext) {
    this.adminContext = context;
  }

  async getStatus(): Promise<BotStatus> {
    return this.request<BotStatus>("/api/status");
  }

  async pausePaper(): Promise<void> {
    await this.request<void>("/api/control/pause", {
      method: "POST",
      body: JSON.stringify({ mode: "paper" })
    });
  }

  async resumePaper(): Promise<void> {
    await this.request<void>("/api/control/resume", {
      method: "POST",
      body: JSON.stringify({ mode: "paper" })
    });
  }

  async killSwitch(reason: string): Promise<void> {
    await this.request<void>("/api/control/kill", {
      method: "POST",
      body: JSON.stringify({ reason })
    });
  }

  subscribe(onEvent: (payload: StreamPayload) => void, onError: (error: Event) => void) {
    const controller = new AbortController();
    const url = this.withAuth(`/api/stream`);
    const decoder = new TextDecoder();
    let buffer = "";
    let dataBuffer = "";

    const emitData = (data: string) => {
      try {
        const payload = JSON.parse(data) as StreamPayload;
        onEvent(payload);
      } catch (error) {
        console.error("Failed to parse stream payload", error);
      }
    };

    const processChunk = (chunk: Uint8Array) => {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataBuffer += line.slice(5).trim();
        } else if (line === "") {
          if (dataBuffer) {
            emitData(dataBuffer);
            dataBuffer = "";
          }
        }
      }
    };

    const start = async () => {
      try {
        const response = await fetch(url, {
          headers: this.authHeader(),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed (${response.status})`);
        }

        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            processChunk(value);
          }
        }
        if (dataBuffer) {
          emitData(dataBuffer);
          dataBuffer = "";
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onError(new Event("error"));
        }
      }
    };

    void start();

    return () => {
      controller.abort();
    };
  }

  subscribeWebSocket(onEvent: (payload: StreamPayload) => void, onError: (error: Event) => void) {
    const wsUrl = this.withAuth(`/ws`, { queryToken: true }).replace(/^http/, "ws");
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StreamPayload;
        onEvent(payload);
      } catch (error) {
        console.error("Failed to parse websocket payload", error);
      }
    };

    socket.onerror = (event) => {
      onError(event);
    };

    return () => {
      socket.close();
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.withAuth(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...this.authHeader(),
        ...init.headers
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private authHeader() {
    if (this.adminContext.isLocal || !this.adminContext.token) {
      return {};
    }

    return {
      "X-Admin-Token": this.adminContext.token
    };
  }

  private withAuth(path: string, options?: { queryToken?: boolean }) {
    if (this.adminContext.isLocal || !this.adminContext.token || !options?.queryToken) {
      return `${this.baseUrl}${path}`;
    }

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("adminToken", this.adminContext.token);
    return url.toString();
  }
}
