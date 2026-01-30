import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { LogEntry } from '../types';
import { SqliteStore } from '../storage/sqlite';

export class LogService {
  private emitter = new EventEmitter();
  private cache: LogEntry[] = [];

  constructor(private store: SqliteStore) {}

  on(event: 'log', listener: (entry: LogEntry) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: 'log', listener: (entry: LogEntry) => void): void {
    this.emitter.off(event, listener);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.record('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.record('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.record('error', message, context);
  }

  list(limit = 100): LogEntry[] {
    return [...this.cache].slice(0, limit);
  }

  private record(level: LogEntry['level'], message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: randomUUID(),
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    };
    this.cache.unshift(entry);
    if (this.cache.length > 500) {
      this.cache.pop();
    }
    if (level === 'error') {
      this.store.insertLog(entry);
    }
    this.emitter.emit('log', entry);
  }
}
