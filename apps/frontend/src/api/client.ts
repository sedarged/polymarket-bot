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
    const url = this.withAuth(`/api/stream`, { queryToken: false });
    const decoder = new TextDecoder();
    let buffer = "";
    let dataLines: string[] = [];

    const emitData = (data: string) => {
      try {
        const payload = JSON.parse(data) as StreamPayload;
        onEvent(payload);
      } catch (error) {
        console.error("Failed to parse stream payload", error);
        onError(new Event("error"));
      }
    };

    const processChunk = (chunk: Uint8Array) => {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        } else if (line === "") {
          if (dataLines.length > 0) {
            emitData(dataLines.join("\n"));
            dataLines = [];
          }
        }
      }
    };

    const start = async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await fetch(url, {
          headers: this.authHeader(),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed (${response.status})`);
        }

        reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            processChunk(value);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onError(new Event("error"));
        }
      } finally {
        if (dataLines.length > 0) {
          emitData(dataLines.join("\n"));
          dataLines = [];
        }
        if (reader) {
          try {
            reader.releaseLock();
          } catch {
            // Reader may already be released
          }
        }
      }
    };

    void start();

    return () => {
      controller.abort();
      buffer = "";
      dataLines = [];
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
        const parseErrorEvent = new ErrorEvent("error", { error });
        onError(parseErrorEvent);
      }
    };

    socket.onerror = (event) => {
      onError(event);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket.readyState === WebSocket.CONNECTING) {
        const timeoutId = setTimeout(() => {
          socket.removeEventListener("open", handleOpen);
        }, 30000); // 30 second timeout
        const handleOpen = () => {
          clearTimeout(timeoutId);
          socket.removeEventListener("open", handleOpen);
          socket.close();
        };
        socket.addEventListener("open", handleOpen);
      }
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

    try {
      const url = new URL(`${this.baseUrl}${path}`);
      url.searchParams.set("adminToken", this.adminContext.token);
      return url.toString();
    } catch (error) {
      console.error(`Failed to construct URL with baseUrl="${this.baseUrl}" and path="${path}", falling back to string concatenation`, error);
      const separator = path.includes("?") ? "&" : "?";
      const tokenParam = `adminToken=${encodeURIComponent(this.adminContext.token)}`;
      return `${this.baseUrl}${path}${separator}${tokenParam}`;
    }
  }
}
