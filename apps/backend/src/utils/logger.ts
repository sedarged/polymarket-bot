/**
 * Categorized Logging System using Pino
 * 
 * Provides user-friendly, categorized logging for full project transparency
 * while maintaining security through automatic sensitive data redaction.
 * 
 * Features:
 * - Category-based logging (orderFlow, marketData, compliance, etc.)
 * - Automatic sensitive data masking (A-022)
 * - Human-readable output in development (pino-pretty)
 * - Structured JSON in production
 * - High performance with async logging
 * 
 * @see docs/adr/0009-categorized-logging-with-pino.md
 * @see Issue #323
 */

import pino from 'pino';

/**
 * Log categories for organizing messages by domain
 */
export enum LogCategory {
  ORDER_FLOW = 'orderFlow',        // Order placement, cancellation, fills
  MARKET_DATA = 'marketData',      // Market updates, orderbook changes, price feeds
  COMPLIANCE = 'compliance',       // Trading gates, risk checks, kill switch
  SYSTEM = 'system',               // Startup, shutdown, configuration, health
  WEBSOCKET = 'websocket',         // WebSocket connections, reconnects, subscriptions
  API = 'api',                     // API calls, rate limiting, circuit breakers
  LEARNING = 'learning',           // ML/learning system, backtesting
  ERROR = 'error',                 // All errors and exceptions
  DATABASE = 'database',           // Database operations, persistence
  AUDIT = 'audit',                 // Audit trail, compliance logging
}

/**
 * Metadata attached to log entries
 */
export type LogMetadata = Record<string, unknown>;

/**
 * Sensitive field paths that should be redacted
 * Supports nested paths with wildcards
 */
const SENSITIVE_FIELDS = [
  'address',
  'privateKey',
  'private_key',
  'secret',
  'apiKey',
  'api_key',
  'api_secret',
  'token',
  'password',
  'passphrase',
  'mnemonic',
  'seed',
  // Wildcard patterns for nested objects
  '*.address',
  '*.privateKey',
  '*.private_key',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.token',
  '*.password',
  // Deep nesting patterns
  '**.address',
  '**.privateKey',
  '**.private_key',
  '**.apiKey',
  '**.api_key',
  '**.secret',
  '**.token',
  '**.password',
];

/**
 * Custom redactor that masks sensitive data
 * Shows first 6 chars and last 4 chars for identifiability
 */
function maskSensitiveDataInternal(value: string): string {
  if (!value || value.length <= 10) {
    return '***';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/**
 * Recursively redact sensitive fields from objects
 * Handles nested objects and arrays
 */
function redactSensitiveFields(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveFields(item));
  }

  // Handle non-object primitives
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle objects
  const result: any = {};
  const sensitiveKeyPatterns = [
    'address',
    'privatekey',
    'private_key', 
    'apikey',
    'api_key',
    'api_secret',
    'secret',
    'password',
    'passphrase',
    'mnemonic',
    'seed',
  ];

  // Patterns that should match exact key names only (not substrings)
  const exactMatchPatterns = ['token'];

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if this key is sensitive (substring match)
    const isSensitiveSubstring = sensitiveKeyPatterns.some(pattern => 
      lowerKey.includes(pattern)
    );

    // Check if this key is sensitive (exact match)
    const isSensitiveExact = exactMatchPatterns.some(pattern =>
      lowerKey === pattern
    );

    const isSensitive = isSensitiveSubstring || isSensitiveExact;

    if (isSensitive && typeof value === 'string') {
      result[key] = maskSensitiveDataInternal(value);
    } else if (isSensitive && Array.isArray(value)) {
      // Mask array of sensitive strings
      result[key] = value.map(item => 
        typeof item === 'string' ? maskSensitiveDataInternal(item) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      // Recursively redact nested objects
      result[key] = redactSensitiveFields(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Configure Pino logger with appropriate settings for environment
 */
function createPinoLogger() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';

  // Base configuration
  const config: pino.LoggerOptions = {
    level: logLevel,
    
    // Redact sensitive fields (A-022)
    redact: {
      paths: SENSITIVE_FIELDS,
      censor: (value: unknown) => {
        if (typeof value === 'string') {
          return maskSensitiveDataInternal(value);
        }
        return '***';
      },
    },

    // Add timestamp
    timestamp: pino.stdTimeFunctions.isoTime,

    // Custom serializers for common objects
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },

    // Base fields added to all logs
    base: {
      pid: process.pid,
      hostname: undefined, // Don't log hostname for privacy
    },
  };

  // Add pretty printing for development
  if (isDevelopment) {
    return pino({
      ...config,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
          messageFormat: '[{category}] {msg}',
        },
      },
    });
  }

  // Production: structured JSON
  return pino(config);
}

/**
 * Root logger instance
 */
const rootLogger = createPinoLogger();

/**
 * Categorized logger wrapper for better UX
 * Maintains backward compatibility with existing logger API
 */
export class CategorizedLogger {
  private logger: pino.Logger;
  private categoryName: string;

  constructor(logger: pino.Logger, categoryName?: string) {
    this.logger = logger;
    this.categoryName = categoryName || 'general';
  }

  /**
   * Create a child logger for a specific category
   */
  category(category: LogCategory | string): CategorizedLogger {
    const childLogger = this.logger.child({ category });
    return new CategorizedLogger(childLogger, category);
  }

  /**
   * Log fatal error (unrecoverable, requires immediate action)
   */
  fatal(message: string, metadata?: LogMetadata): void {
    const redacted = metadata ? redactSensitiveFields(metadata) : {};
    this.logger.fatal({ ...redacted, category: this.categoryName }, message);
  }

  /**
   * Log error (needs investigation)
   */
  error(message: string, metadata?: LogMetadata): void {
    const redacted = metadata ? redactSensitiveFields(metadata) : {};
    this.logger.error({ ...redacted, category: this.categoryName }, message);
  }

  /**
   * Log warning (potential issues)
   */
  warn(message: string, metadata?: LogMetadata): void {
    const redacted = metadata ? redactSensitiveFields(metadata) : {};
    this.logger.warn({ ...redacted, category: this.categoryName }, message);
  }

  /**
   * Log info (normal operations)
   */
  info(message: string, metadata?: LogMetadata): void {
    const redacted = metadata ? redactSensitiveFields(metadata) : {};
    this.logger.info({ ...redacted, category: this.categoryName }, message);
  }

  /**
   * Log debug (detailed debugging)
   */
  debug(message: string, metadata?: LogMetadata): void {
    const redacted = metadata ? redactSensitiveFields(metadata) : {};
    this.logger.debug({ ...redacted, category: this.categoryName }, message);
  }

  /**
   * Log trace (very detailed tracing)
   */
  trace(message: string, metadata?: LogMetadata): void {
    const redacted = metadata ? redactSensitiveFields(metadata) : {};
    this.logger.trace({ ...redacted, category: this.categoryName }, message);
  }

  /**
   * Get underlying Pino logger for advanced use cases
   */
  getPinoLogger(): pino.Logger {
    return this.logger;
  }
}

/**
 * Default logger instance (general category)
 * Maintains backward compatibility with existing code
 */
export const logger = new CategorizedLogger(rootLogger);

/**
 * Pre-configured category loggers for common use cases
 * Usage: import { orderFlowLogger } from './utils/logger';
 */
export const orderFlowLogger = logger.category(LogCategory.ORDER_FLOW);
export const marketDataLogger = logger.category(LogCategory.MARKET_DATA);
export const complianceLogger = logger.category(LogCategory.COMPLIANCE);
export const systemLogger = logger.category(LogCategory.SYSTEM);
export const websocketLogger = logger.category(LogCategory.WEBSOCKET);
export const apiLogger = logger.category(LogCategory.API);
export const learningLogger = logger.category(LogCategory.LEARNING);
export const errorLogger = logger.category(LogCategory.ERROR);
export const databaseLogger = logger.category(LogCategory.DATABASE);
export const auditLogger = logger.category(LogCategory.AUDIT);

/**
 * Legacy exports for backward compatibility
 * Keep the maskSensitiveData function for any code that uses it directly
 */
export function maskSensitiveData(value: string): string {
  if (!value || value.length <= 10) {
    return '***';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

// Re-export LogLevel enum for backward compatibility
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}
