import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  logger, 
  maskSensitiveData, 
  orderFlowLogger, 
  marketDataLogger, 
  complianceLogger 
} from '../../src/utils/logger';

describe('Logger - Sensitive Data Masking (A-022)', () => {
  // Mock pino to capture log calls
  let logCalls: any[] = [];

  beforeEach(() => {
    logCalls = [];
    // Capture calls to the logger's getPinoLogger() method
    const originalLogger = (logger as any).logger;
    if (originalLogger) {
      ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].forEach(level => {
        vi.spyOn(originalLogger, level).mockImplementation((...args: any[]) => {
          logCalls.push({ level, args });
        });
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('maskSensitiveData', () => {
    it('should mask Ethereum addresses (42 chars)', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const masked = maskSensitiveData(address);
      expect(masked).toBe('0x1234...5678');
      expect(masked.length).toBeLessThan(address.length);
    });

    it('should mask private keys (66 chars)', () => {
      const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const masked = maskSensitiveData(privateKey);
      expect(masked).toBe('0xabcd...7890');
      expect(masked.length).toBeLessThan(privateKey.length);
    });

    it('should mask long strings', () => {
      const longString = 'this-is-a-very-long-secret-string-that-should-be-masked';
      const masked = maskSensitiveData(longString);
      expect(masked).toBe('this-i...sked');
    });

    it('should fully mask short strings (10 chars or less)', () => {
      const shortString = 'short';
      const masked = maskSensitiveData(shortString);
      expect(masked).toBe('***');
    });

    it('should handle empty strings', () => {
      const masked = maskSensitiveData('');
      expect(masked).toBe('***');
    });
  });

  describe('Automatic field masking', () => {
    it('should mask address fields', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      logger.info('Test message', { address });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.address).toBe('0x1234...5678');
      expect(logData.address).not.toBe(address);
    });

    it('should mask privateKey fields', () => {
      const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      logger.info('Test message', { privateKey });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.privateKey).toBe('0xabcd...7890');
      expect(logData.privateKey).not.toBe(privateKey);
    });

    it('should mask private_key fields (snake_case)', () => {
      const private_key = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      logger.info('Test message', { private_key });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.private_key).toBe('0xabcd...7890');
      expect(logData.private_key).not.toBe(private_key);
    });

    it('should mask apiKey fields', () => {
      const apiKey = 'sk-1234567890abcdef1234567890abcdef';
      logger.info('Test message', { apiKey });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.apiKey).toBe('sk-123...cdef');
      expect(logData.apiKey).not.toBe(apiKey);
    });

    it('should not mask non-sensitive fields', () => {
      const data = { userId: '12345', balance: 1000, market: 'BTC' };
      logger.info('Test message', data);

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.userId).toBe('12345');
      expect(logData.balance).toBe(1000);
      expect(logData.market).toBe('BTC');
    });

    it('should not mask tokenId or tokenIds (regression test)', () => {
      const data = { 
        tokenId: '21742633143463906290569050155826241533067272736897614950488156847949938836455',
        tokenIds: ['token-1', 'token-2'],
        orderId: 'order-123'
      };
      logger.info('Test message', data);

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.tokenId).toBe('21742633143463906290569050155826241533067272736897614950488156847949938836455');
      expect(logData.tokenIds).toEqual(['token-1', 'token-2']);
      expect(logData.orderId).toBe('order-123');
    });

    it('should handle mixed sensitive and non-sensitive fields', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const data = { userId: '12345', address, balance: 1000 };
      logger.info('Test message', data);

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.userId).toBe('12345');
      expect(logData.address).toBe('0x1234...5678');
      expect(logData.balance).toBe(1000);
    });

    it('should mask nested sensitive fields', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const data = { user: { address, balance: 1000 } };
      logger.info('Test message', data);

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.user.address).toBe('0x1234...5678');
      expect(logData.user.balance).toBe(1000);
    });

    it('should mask arrays of sensitive strings', () => {
      const addresses = [
        '0x1234567890abcdef1234567890abcdef12345678',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      ];
      const data = { addresses, count: 2 };
      logger.info('Test message', data);

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.addresses).toEqual(['0x1234...5678', '0xabcd...abcd']);
      expect(logData.count).toBe(2);
    });

    it('should handle arrays without masking', () => {
      const data = { ids: ['1', '2', '3'] };
      logger.info('Test message', data);

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.ids).toEqual(['1', '2', '3']);
    });

    it('should handle null and undefined values', () => {
      logger.info('Test message', { value: null, other: undefined });

      expect(logCalls.length).toBeGreaterThan(0);
      // Should not throw
    });
  });

  describe('Real-world scenarios', () => {
    it('should mask wallet address in trading client initialization', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      logger.info('Trading client initialized', { 
        address, 
        mode: 'paper',
        balance: 10000 
      });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.address).toBe('0x1234...5678');
      expect(logData.mode).toBe('paper');
      expect(logData.balance).toBe(10000);
    });

    it('should mask private key source logging', () => {
      const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      logger.info('Using private key from env', { 
        source: 'env',
        privateKey
      });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.privateKey).toBe('0xabcd...7890');
      expect(logData.source).toBe('env');
    });

    it('should mask multiple addresses in order logging', () => {
      const userAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const makerAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
      logger.info('Order placed', {
        orderId: 'order-123',
        userAddress,
        makerAddress,
        size: 100
      });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.userAddress).toBe('0x1234...5678');
      expect(logData.makerAddress).toBe('0xabcd...ef12');
      expect(logData.orderId).toBe('order-123');
      expect(logData.size).toBe(100);
    });
  });

  describe('Log levels', () => {
    it('should mask sensitive data in error logs', () => {
      const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      logger.error('Authentication failed', { privateKey });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      expect(lastCall.level).toBe('error');
      const logData = lastCall.args[0];
      expect(logData.privateKey).toBe('0xabcd...7890');
    });

    it('should mask sensitive data in warn logs', () => {
      const apiKey = 'sk-1234567890abcdef';
      logger.warn('Rate limit approaching', { apiKey });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      expect(lastCall.level).toBe('warn');
      const logData = lastCall.args[0];
      expect(logData.apiKey).toBe('sk-123...cdef');
    });

    it('should mask sensitive data in info logs (default level)', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      logger.info('User login', { address });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      expect(lastCall.level).toBe('info');
      const logData = lastCall.args[0];
      expect(logData.address).toBe('0x1234...5678');
    });
  });

  describe('Category loggers', () => {
    it('should include category in order flow logs', () => {
      orderFlowLogger.info('Order placed', { orderId: 'order-123' });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.category).toBe('orderFlow');
      expect(logData.orderId).toBe('order-123');
    });

    it('should include category in market data logs', () => {
      marketDataLogger.info('Price updated', { price: 0.65 });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.category).toBe('marketData');
      expect(logData.price).toBe(0.65);
    });

    it('should include category in compliance logs', () => {
      complianceLogger.warn('Risk limit approaching', { utilization: 0.95 });

      expect(logCalls.length).toBeGreaterThan(0);
      const lastCall = logCalls[logCalls.length - 1];
      const logData = lastCall.args[0];
      expect(logData.category).toBe('compliance');
      expect(logData.utilization).toBe(0.95);
    });
  });
});
