/**
 * Alerting Service - Slack and Email notifications for critical events
 * 
 * Provides centralized alerting for:
 * - Circuit breaker trips
 * - Kill switch activation
 * - High error rates
 * - Strategy execution failures
 * 
 * Addresses:
 * - Gap OB-002: Set up basic alerting
 * - Issue #100: [Observability] Set up basic alerting (Slack/email)
 */

import { logger } from './logger';

export interface AlertConfig {
  slackWebhookUrl?: string;
  emailConfig?: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    fromAddress: string;
    toAddresses: string[];
  };
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
}

/**
 * Alerting Service for sending notifications to Slack and Email
 */
export class AlertingService {
  private config: AlertConfig;
  private alertHistory: Alert[] = [];
  private maxHistorySize = 1000;
  
  // Rate limiting to prevent alert storms
  private lastAlertTimestamps = new Map<string, number>();
  private alertCooldownMs = 60000; // 1 minute cooldown for same alert

  constructor(config: AlertConfig) {
    this.config = {
      thresholds: {
        errorRatePercent: 5,
        circuitBreakerTrips: 1,
        ...config.thresholds,
      },
      ...config,
    };
    
    logger.info('Alerting service initialized', {
      hasSlack: !!config.slackWebhookUrl,
      hasEmail: !!config.emailConfig,
      thresholds: this.config.thresholds,
    });
  }

  /**
   * Send an alert via all configured channels
   */
  async sendAlert(alert: Alert): Promise<void> {
    // Add to history
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }

    // Check rate limiting to prevent alert storms
    const alertKey = `${alert.title}:${alert.severity}`;
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

    // Log the alert
    logger[alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warn' : 'info'](
      `ALERT: ${alert.title}`,
      {
        message: alert.message,
        ...alert.context,
      }
    );

    // Send to configured channels
    const promises: Promise<void>[] = [];
    
    if (this.config.slackWebhookUrl) {
      promises.push(this.sendSlackAlert(alert));
    }
    
    if (this.config.emailConfig) {
      promises.push(this.sendEmailAlert(alert));
    }

    // Wait for all alerts to be sent
    await Promise.allSettled(promises);
  }

  /**
   * Send alert to Slack webhook
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.slackWebhookUrl) {
      return;
    }

    const emoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    const color = alert.severity === 'critical' ? '#ff0000' : alert.severity === 'warning' ? '#ffaa00' : '#0099ff';
    
    const payload = {
      text: `${emoji} *${alert.title}*`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Time',
              value: alert.timestamp,
              short: true,
            },
            {
              title: 'Message',
              value: alert.message,
              short: false,
            },
          ],
        },
      ],
    };

    // Add context fields if present
    if (alert.context) {
      const contextFields = Object.entries(alert.context).map(([key, value]) => ({
        title: key,
        value: String(value),
        short: true,
      }));
      payload.attachments[0].fields.push(...contextFields);
    }

    try {
      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
      }

      logger.debug('Alert sent to Slack', { title: alert.title });
    } catch (error) {
      logger.error('Failed to send Slack alert', {
        error: error instanceof Error ? error.message : String(error),
        title: alert.title,
      });
    }
  }

  /**
   * Send alert via email
   * Note: Minimal implementation - requires nodemailer or similar library
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.config.emailConfig) {
      return;
    }

    // Email sending requires nodemailer which is not installed yet
    // For now, just log that we would send an email
    logger.info('Email alert would be sent (nodemailer not configured)', {
      title: alert.title,
      severity: alert.severity,
      recipients: this.config.emailConfig.toAddresses,
    });
    
    // TODO: Implement actual email sending with nodemailer
    // This is a placeholder that can be expanded when nodemailer is added
  }

  /**
   * Alert on circuit breaker trip
   */
  async alertCircuitBreakerTrip(breakerName: string, failures: number): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title: 'Circuit Breaker Tripped',
      message: `Circuit breaker "${breakerName}" has opened after ${failures} consecutive failures`,
      context: {
        breaker: breakerName,
        failures,
      },
      timestamp: new Date().toISOString(),
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
