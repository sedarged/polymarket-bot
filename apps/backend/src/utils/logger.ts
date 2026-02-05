export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export type LogMetadata = Record<string, unknown>;

/**
 * Mask sensitive data for logging (Audit Finding A-022)
 * 
 * Masks wallet addresses, private keys, and other sensitive strings
 * to prevent privacy leaks in logs.
 * 
 * @param value - The value to mask
 * @returns Masked string (first 6 chars...last 4 chars)
 */
export function maskSensitiveData(value: string): string {
  if (!value || value.length <= 10) {
    // Too short to mask meaningfully, return full mask
    return '***';
  }
  
  // For Ethereum addresses (0x + 40 hex chars) and similar long strings
  // Show first 6 chars and last 4 chars
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/**
 * Recursively mask sensitive fields in metadata objects
 * 
 * Automatically masks fields named: address, privateKey, private_key, 
 * secret, apiKey, api_key, token, password
 * 
 * @param metadata - Metadata object to sanitize
 * @returns Sanitized metadata with masked sensitive fields
 */
function maskSensitiveFields(metadata: LogMetadata): LogMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }

  const sensitiveFieldNames = [
    'address',
    'privatekey',  // matches privateKey (camelCase) and private_key (snake_case)
    'private_key',
    'secret',
    'apikey',      // matches apiKey (camelCase) and api_key (snake_case)
    'api_key',
    'token',
    'password',
    'key',         // Note: Broadly matches any field containing 'key' (e.g., walletKey, userKey)
  ];

  const masked: LogMetadata = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    
    // Check if this is a sensitive field
    const isSensitive = sensitiveFieldNames.some(sensitive => 
      lowerKey.includes(sensitive)
    );
    
    if (isSensitive && typeof value === 'string') {
      masked[key] = maskSensitiveData(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively mask nested objects
      masked[key] = maskSensitiveFields(value as LogMetadata);
    } else {
      masked[key] = value;
    }
  }
  
  return masked;
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

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (level <= this.level) {
      // Mask sensitive fields in metadata (A-022)
      const sanitizedMetadata = metadata ? maskSensitiveFields(metadata) : undefined;
      
      const payload = {
        timestamp: new Date().toISOString(),
        level: LogLevel[level],
        message,
        ...sanitizedMetadata,
      };
      console.log(JSON.stringify(payload));
    }
  }

  error(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }
}

export const logger = new Logger(process.env.LOG_LEVEL);
