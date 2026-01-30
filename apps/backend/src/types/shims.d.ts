declare module 'express' {
  import { IncomingMessage, ServerResponse } from 'http';
  type Handler = (req: any, res: any, next?: () => void) => void;
  type ExpressApp = {
    use: (...args: any[]) => ExpressApp;
    get: (path: string, handler: Handler) => ExpressApp;
    post: (path: string, handler: Handler) => ExpressApp;
    delete: (path: string, handler: Handler) => ExpressApp;
    listen: (port: number, callback?: () => void) => void;
  };
  type Express = () => ExpressApp;
  namespace Express {
    const json: () => Handler;
  }
  const express: Express & { json: () => Handler };
  export default express;
}

declare module 'better-sqlite3' {
  type Statement = {
    run: (params?: Record<string, unknown>) => void;
    all: (params?: unknown) => any[];
  };
  type Database = {
    exec: (sql: string) => void;
    prepare: (sql: string) => Statement;
  };
  const Database: {
    new (path: string): Database;
  };
  export default Database;
}

declare module 'ws' {
  import { EventEmitter } from 'events';
  class WebSocket extends EventEmitter {
    static OPEN: number;
    readyState: number;
    constructor(url: string);
    send(data: string): void;
    close(): void;
  }
  export default WebSocket;
}

declare module '@polymarket/clob-client' {
  type ClobClientConfig = {
    apiKey: string;
    secret: string;
    passphrase: string;
    host: string;
    level?: string;
  };
  class ClobClient {
    constructor(config: ClobClientConfig);
    isUserBanned?: () => Promise<boolean>;
    getBalanceAllowance?: () => Promise<unknown>;
  }
  export { ClobClient };
}
