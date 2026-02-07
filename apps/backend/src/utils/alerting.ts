/**
 * Alerting Service - Telegram notifications for critical events
 * 
 * Provides centralized alerting for:
 * - Circuit breaker trips
 * - Kill switch activation
 * - High error rates
 * - Strategy execution failures
 * 
 * Addresses:
 * - Gap OB-002: Set up basic alerting
 * - Issue #100: [Observability] Set up basic alerting (Telegram)
 */

import { logger } from './logger';

export interface AlertConfig {
  telegramBotToken: string;
  telegramChatId: string;
  thresholds?: {
    errorRatePercent: number; // Alert when error rate exceeds this (default: 5%)
    circuitBreakerTrips: number; // Alert after N circuit breaker trips (default: 1)
  };
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  dedupeKey?: string; // Optional key for more granular deduplication
}

/**
 * Alerting Service for sending notifications to Telegram
 */
export class AlertingService {
  private config: AlertConfig;
  private alertHistory: Alert[] = [];
  private maxHistorySize = 1000;
  
  // Rate limiting to prevent alert storms
  private lastAlertTimestamps = new Map<string, number>();
  private alertCooldownMs = 60000; // 1 minute cooldown for same alert
  
  // Circuit breaker trip tracking
  private circuitBreakerTripCounts = new Map<string, number>();
  private circuitBreakerTripResetMs = 300000; // Reset count after 5 minutes
  private lastCircuitBreakerTripTime = new Map<string, number>();
  
  // Sensitive keys to mask in context
  private readonly SENSITIVE_KEYS = [
    'password', 'token', 'secret', 'key', 'apiKey', 'apiSecret',
    'privateKey', 'accessToken', 'refreshToken', 'authorization'
  ];

  constructor(config: AlertConfig) {
    this.config = {
      ...config,
      thresholds: {
        errorRatePercent: 5,
        circuitBreakerTrips: 1,
        ...config.thresholds,
      },
    };
    
    logger.info('Alerting service initialized', {
      hasTelegram: true,
      thresholds: this.config.thresholds,
    });
  }

  /**
   * Mask sensitive values in context
   */
  private maskSensitiveContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context) {
      return {};
    }
    
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.SENSITIVE_KEYS.some(sensitiveKey => 
        lowerKey.includes(sensitiveKey.toLowerCase())
      );
      
      if (isSensitive && typeof value === 'string' && value.length > 4) {
        // Mask all but last 4 characters
        masked[key] = '***' + value.slice(-4);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  /**
   * Send an alert via all configured channels
   */
  async sendAlert(alert: Alert): Promise<void> {
    // Check rate limiting FIRST to prevent alert storms
    const alertKey = alert.dedupeKey || `${alert.title}:${alert.severity}`;
    const lastAlertTime = this.lastAlertTimestamps.get(alertKey) || 0;
    const now = Date.now();
    
    if (now - lastAlertTime < this.alertCooldownMs) {
      logger.debug('Alert suppressed due to rate limiting', {
        alertKey,
        cooldownRemaining: this.alertCooldownMs - (now - lastAlertTime),
      });
      return;
    }
    
    this.lastAlertTimestamps.set(alertKey, now);

    // Add to history AFTER rate limiting check
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }

    // Mask sensitive context before logging or sending
    const maskedContext = this.maskSensitiveContext(alert.context);

    // Log the alert with nested context
    logger[alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warn' : 'info'](
      `ALERT: ${alert.title}`,
      {
        message: alert.message,
        context: maskedContext,
      }
    );

    // Send to Telegram
    await this.sendTelegramAlert({ ...alert, context: maskedContext });
  }

  /**
   * Escape Markdown special characters for Telegram
   */
  private escapeMarkdown(text: string): string {
    // Escape Markdown special characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
  }

  /**
   * Send alert to Telegram bot
   */
  private async sendTelegramAlert(alert: Alert): Promise<void> {
    const emoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    
    // Escape content for Markdown to prevent API errors
    const escapedTitle = this.escapeMarkdown(alert.title);
    const escapedMessage = this.escapeMarkdown(alert.message);
    
    // Format message for Telegram using Markdown
    let message = `${emoji} *${escapedTitle}*\n\n`;
    message += `*Severity:* ${alert.severity.toUpperCase()}\n`;
    message += `*Time:* ${this.escapeMarkdown(alert.timestamp)}\n`;
    message += `*Message:* ${escapedMessage}\n`;
    
    // Add context fields if present
    if (alert.context && Object.keys(alert.context).length > 0) {
      message += '\n*Details:*\n';
      for (const [key, value] of Object.entries(alert.context)) {
        const escapedKey = this.escapeMarkdown(key);
        const escapedValue = this.escapeMarkdown(String(value));
        message += `• ${escapedKey}: ${escapedValue}\n`;
      }
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.config.telegramChatId,
          text: message,
          parse_mode: 'Markdown',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Telegram API failed: ${response.status} ${errorText}`);
      }

      logger.debug('Alert sent to Telegram', { title: alert.title });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Telegram alert timed out', {
          title: alert.title,
          timeout: '10s',
        });
      } else {
        logger.error('Failed to send Telegram alert', {
          error: error instanceof Error ? error.message : String(error),
          title: alert.title,
        });
      }
    }
  }

  /**
   * Alert on circuit breaker trip
   */
  async alertCircuitBreakerTrip(breakerName: string, failures: number): Promise<void> {
    const now = Date.now();
    const lastTripTime = this.lastCircuitBreakerTripTime.get(breakerName) || 0;
    
    // Reset count if it's been more than 5 minutes since last trip
    if (now - lastTripTime > this.circuitBreakerTripResetMs) {
      this.circuitBreakerTripCounts.set(breakerName, 0);
    }
    
    // Increment trip count
    const currentCount = (this.circuitBreakerTripCounts.get(breakerName) || 0) + 1;
    this.circuitBreakerTripCounts.set(breakerName, currentCount);
    this.lastCircuitBreakerTripTime.set(breakerName, now);
    
    // Only alert if threshold is reached
    const threshold = this.config.thresholds?.circuitBreakerTrips || 1;
    if (currentCount < threshold) {
      logger.debug('Circuit breaker trip below threshold', {
        breaker: breakerName,
        tripCount: currentCount,
        threshold,
      });
      return;
    }
    
    await this.sendAlert({
      severity: 'critical',
      title: 'Circuit Breaker Tripped',
      message: `Circuit breaker "${breakerName}" has opened after ${failures} consecutive failures`,
      context: {
        breaker: breakerName,
        failures,
        tripCount: currentCount,
      },
      timestamp: new Date().toISOString(),
      dedupeKey: `circuit-breaker:${breakerName}:critical`,
    });
  }

  /**
   * Alert on kill switch activation
   */
  async alertKillSwitch(reason: string, activatedBy?: string): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title: 'Kill Switch Activated',
      message: `Trading has been halted: ${reason}`,
      context: {
        reason,
        activatedBy: activatedBy || 'system',
      },
      timestamp: new Date().toISOString(),
      dedupeKey: 'kill-switch:critical',
    });
  }

  /**
   * Alert on high error rate
   */
  async alertHighErrorRate(errorRate: number, windowSize: number): Promise<void> {
    const threshold = this.config.thresholds?.errorRatePercent || 5;
    
    if (errorRate * 100 < threshold) {
      return; // Below threshold, no alert
    }

    await this.sendAlert({
      severity: 'warning',
      title: 'High Error Rate Detected',
      message: `Error rate of ${(errorRate * 100).toFixed(2)}% exceeds threshold of ${threshold}%`,
      context: {
        errorRatePercent: (errorRate * 100).toFixed(2),
        threshold,
        windowSize,
      },
      timestamp: new Date().toISOString(),
      dedupeKey: 'error-rate:warning',
    });
  }

  /**
   * Alert on strategy execution error
   */
  async alertStrategyError(
    strategyName: string,
    error: Error,
    context: {
      marketId?: string;
      signals?: Record<string, unknown>;
      decision?: unknown;
    }
  ): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title: 'Strategy Execution Error',
      message: `Strategy "${strategyName}" failed: ${error.message}`,
      context: {
        strategy: strategyName,
        error: error.message,
        stack: error.stack,
        ...context,
      },
      timestamp: new Date().toISOString(),
      dedupeKey: `strategy-error:${strategyName}:critical`,
    });
  }

  /**
   * Get recent alert history
   */
  getAlertHistory(limit = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Clear alert history
   */
  clearHistory(): void {
    this.alertHistory = [];
    this.lastAlertTimestamps.clear();
  }
}

// Singleton instance
let alertingService: AlertingService | null = null;

/**
 * Initialize the alerting service with configuration
 */
export function initializeAlerting(config: AlertConfig): AlertingService {
  alertingService = new AlertingService(config);
  return alertingService;
}

/**
 * Get the alerting service instance
 */
export function getAlertingService(): AlertingService | null {
  return alertingService;
}
