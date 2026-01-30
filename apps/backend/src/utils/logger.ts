export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

class Logger {
  private level: LogLevel;

  constructor(level: string = 'info') {
    this.level = this.parseLevel(level);
  }

  private parseLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level <= this.level) {
      const timestamp = new Date().toISOString();
      const levelName = LogLevel[level];
      console.log(`[${timestamp}] ${levelName}:`, message, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }
}

export const logger = new Logger(process.env.LOG_LEVEL);
