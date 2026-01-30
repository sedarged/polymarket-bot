import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config';
import { LogService } from './logService';

export type WsMessage = {
  channel: string;
  type: string;
  payload: unknown;
};

export class WsClient extends EventEmitter {
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private shouldReconnect = true;
  private subscriptions: WsMessage[] = [];

  constructor(private logger: LogService) {
    super();
  }

  connect(): void {
    this.socket = new WebSocket(config.wsUrl);
    this.socket.on('open', () => {
      this.logger.info('WS connected');
      this.emit('open');
      this.subscriptions.forEach((sub) => this.send(sub));
    });
    this.socket.on('message', (data) => {
      const text = data.toString();
      try {
        const message = JSON.parse(text) as WsMessage;
        this.emit('message', message);
      } catch (error) {
        this.logger.warn('WS message parse error', { error: String(error) });
      }
    });
    this.socket.on('close', () => {
      this.logger.warn('WS disconnected');
      this.emit('close');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });
    this.socket.on('error', (error) => {
      this.logger.error('WS error', { error: String(error) });
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.socket?.close();
  }

  subscribe(channel: string, payload: unknown): void {
    const message: WsMessage = { channel, type: 'subscribe', payload };
    this.subscriptions.push(message);
    this.send(message);
  }

  resync(): void {
    this.logger.info('WS resync requested');
    this.subscriptions.forEach((sub) => this.send(sub));
  }

  private send(message: WsMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.logger.info('WS reconnecting');
      this.connect();
      this.resync();
    }, 2000);
  }
}
