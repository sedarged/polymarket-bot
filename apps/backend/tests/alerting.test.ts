import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AlertingService,
  initializeAlerting,
  getAlertingService,
  type AlertConfig,
} from '../src/utils/alerting';

describe('AlertingService', () => {
  let alertingService: AlertingService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset the singleton
    const config: AlertConfig = {
      slackWebhookUrl: 'https://hooks.slack.com/services/test/webhook',
      thresholds: {
        errorRatePercent: 5,
        circuitBreakerTrips: 1,
      },
    };
    alertingService = new AlertingService(config);

    // Mock global fetch
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = mockFetch;
  });

  describe('Initialization', () => {
    it('should initialize with config', () => {
      expect(alertingService).toBeDefined();
    });

    it('should initialize singleton via initializeAlerting', () => {
      const service = initializeAlerting({
        slackWebhookUrl: 'https://test.com/webhook',
      });
      expect(service).toBeDefined();
      expect(getAlertingService()).toBe(service);
    });
  });

  describe('sendAlert', () => {
    it('should send alert to Slack', async () => {
      await alertingService.sendAlert({
        severity: 'critical',
        title: 'Test Alert',
        message: 'This is a test',
        timestamp: new Date().toISOString(),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should include context in Slack alert', async () => {
      await alertingService.sendAlert({
        severity: 'warning',
        title: 'Test Alert',
        message: 'This is a test',
        context: {
          breaker: 'test-breaker',
          failures: 5,
        },
        timestamp: new Date().toISOString(),
      });

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.attachments[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'breaker', value: 'test-breaker' }),
          expect.objectContaining({ title: 'failures', value: '5' }),
        ])
      );
    });

    it('should add alert to history', async () => {
      await alertingService.sendAlert({
        severity: 'info',
        title: 'Test Alert',
        message: 'This is a test',
        timestamp: new Date().toISOString(),
      });

      const history = alertingService.getAlertHistory();
      expect(history).toHaveLength(1);
      expect(history[0].title).toBe('Test Alert');
    });

    it('should rate limit duplicate alerts', async () => {
      const alert = {
        severity: 'critical' as const,
        title: 'Test Alert',
        message: 'This is a test',
        timestamp: new Date().toISOString(),
      };

      // Send first alert
      await alertingService.sendAlert(alert);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Send duplicate immediately - should be rate limited
      await alertingService.sendAlert(alert);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should handle Slack webhook failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Should not throw
      await expect(
        alertingService.sendAlert({
          severity: 'critical',
          title: 'Test Alert',
          message: 'This is a test',
          timestamp: new Date().toISOString(),
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Circuit Breaker Alerts', () => {
    it('should alert on circuit breaker trip', async () => {
      await alertingService.alertCircuitBreakerTrip('market-feed', 5);

      expect(mockFetch).toHaveBeenCalled();
      const history = alertingService.getAlertHistory();
      expect(history[0].title).toBe('Circuit Breaker Tripped');
      expect(history[0].severity).toBe('critical');
      expect(history[0].context).toMatchObject({
        breaker: 'market-feed',
        failures: 5,
      });
    });
  });

  describe('Kill Switch Alerts', () => {
    it('should alert on kill switch activation', async () => {
      await alertingService.alertKillSwitch('High error rate detected', 'admin');

      expect(mockFetch).toHaveBeenCalled();
      const history = alertingService.getAlertHistory();
      expect(history[0].title).toBe('Kill Switch Activated');
      expect(history[0].severity).toBe('critical');
      expect(history[0].context).toMatchObject({
        reason: 'High error rate detected',
        activatedBy: 'admin',
      });
    });

    it('should default activatedBy to system', async () => {
      await alertingService.alertKillSwitch('Automatic shutdown');

      const history = alertingService.getAlertHistory();
      expect(history[0].context?.activatedBy).toBe('system');
    });
  });

  describe('Error Rate Alerts', () => {
    it('should alert when error rate exceeds threshold', async () => {
      await alertingService.alertHighErrorRate(0.08, 100); // 8% error rate

      expect(mockFetch).toHaveBeenCalled();
      const history = alertingService.getAlertHistory();
      expect(history[0].title).toBe('High Error Rate Detected');
      expect(history[0].severity).toBe('warning');
    });

    it('should not alert when error rate is below threshold', async () => {
      await alertingService.alertHighErrorRate(0.03, 100); // 3% error rate

      expect(mockFetch).not.toHaveBeenCalled();
      expect(alertingService.getAlertHistory()).toHaveLength(0);
    });
  });

  describe('Strategy Error Alerts', () => {
    it('should alert on strategy execution error', async () => {
      const error = new Error('Strategy failed');
      error.stack = 'Error: Strategy failed\n    at test.ts:10:5';

      await alertingService.alertStrategyError('momentum-strategy', error, {
        marketId: 'market-123',
        signals: { rsi: 70, macd: 0.5 },
        decision: { action: 'BUY', size: 10 },
      });

      expect(mockFetch).toHaveBeenCalled();
      const history = alertingService.getAlertHistory();
      expect(history[0].title).toBe('Strategy Execution Error');
      expect(history[0].severity).toBe('critical');
      expect(history[0].context).toMatchObject({
        strategy: 'momentum-strategy',
        error: 'Strategy failed',
        marketId: 'market-123',
      });
    });
  });

  describe('Alert History', () => {
    it('should maintain alert history', async () => {
      await alertingService.sendAlert({
        severity: 'info',
        title: 'Alert 1',
        message: 'First alert',
        timestamp: new Date().toISOString(),
      });
      await alertingService.sendAlert({
        severity: 'warning',
        title: 'Alert 2',
        message: 'Second alert',
        timestamp: new Date().toISOString(),
      });

      const history = alertingService.getAlertHistory();
      expect(history).toHaveLength(2);
      expect(history[0].title).toBe('Alert 1');
      expect(history[1].title).toBe('Alert 2');
    });

    it('should limit history size', async () => {
      // Send more than max history size (1000)
      for (let i = 0; i < 1100; i++) {
        await alertingService.sendAlert({
          severity: 'info',
          title: `Alert ${i}`,
          message: 'Test alert',
          timestamp: new Date().toISOString(),
        });
      }

      const history = alertingService.getAlertHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });

    it('should clear alert history', async () => {
      await alertingService.sendAlert({
        severity: 'info',
        title: 'Test Alert',
        message: 'This is a test',
        timestamp: new Date().toISOString(),
      });

      expect(alertingService.getAlertHistory()).toHaveLength(1);

      alertingService.clearHistory();
      expect(alertingService.getAlertHistory()).toHaveLength(0);
    });

    it('should return limited history', async () => {
      for (let i = 0; i < 50; i++) {
        await alertingService.sendAlert({
          severity: 'info',
          title: `Alert ${i}`,
          message: 'Test alert',
          timestamp: new Date().toISOString(),
        });
      }

      const recent = alertingService.getAlertHistory(10);
      expect(recent).toHaveLength(10);
      // Should return the most recent 10
      expect(recent[9].title).toBe('Alert 49');
    });
  });

  describe('Email Configuration', () => {
    it('should initialize with email config', () => {
      const service = new AlertingService({
        emailConfig: {
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpSecure: true,
          smtpUser: 'user@example.com',
          smtpPassword: 'password',
          fromAddress: 'bot@example.com',
          toAddresses: ['admin@example.com'],
        },
      });

      expect(service).toBeDefined();
    });

    it('should log email alerts when email is configured', async () => {
      const service = new AlertingService({
        emailConfig: {
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpSecure: true,
          smtpUser: 'user@example.com',
          smtpPassword: 'password',
          fromAddress: 'bot@example.com',
          toAddresses: ['admin@example.com'],
        },
      });

      // Should not throw even though actual email sending is not implemented yet
      await expect(
        service.sendAlert({
          severity: 'critical',
          title: 'Test Alert',
          message: 'This is a test',
          timestamp: new Date().toISOString(),
        })
      ).resolves.not.toThrow();
    });
  });
});
