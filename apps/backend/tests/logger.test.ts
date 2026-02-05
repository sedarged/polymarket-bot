import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, maskSensitiveData, LogLevel } from '../src/utils/logger';

describe('Logger - Sensitive Data Masking (A-022)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
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

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.address).toBe('0x1234...5678');
      expect(logOutput.address).not.toBe(address);
    });

    it('should mask privateKey fields', () => {
      const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      logger.info('Test message', { privateKey });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.privateKey).toBe('0xabcd...7890');
      expect(logOutput.privateKey).not.toBe(privateKey);
    });

    it('should mask private_key fields (snake_case)', () => {
      const private_key = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      logger.info('Test message', { private_key });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.private_key).toBe('0xabcd...7890');
      expect(logOutput.private_key).not.toBe(private_key);
    });

    it('should mask apiKey fields', () => {
      const apiKey = 'sk-1234567890abcdef1234567890abcdef';
      logger.info('Test message', { apiKey });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.apiKey).toBe('sk-123...cdef');
      expect(logOutput.apiKey).not.toBe(apiKey);
    });

    it('should mask api_key fields (snake_case)', () => {
      const api_key = 'sk-1234567890abcdef1234567890abcdef';
      logger.info('Test message', { api_key });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.api_key).toBe('sk-123...cdef');
      expect(logOutput.api_key).not.toBe(api_key);
    });

    it('should mask secret fields', () => {
      const secret = 'my-super-secret-value-12345';
      logger.info('Test message', { secret });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.secret).toBe('my-sup...2345');
      expect(logOutput.secret).not.toBe(secret);
    });

    it('should mask token fields', () => {
      const token = 'Bearer-token-1234567890abcdef';
      logger.info('Test message', { token });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.token).toBe('Bearer...cdef');
      expect(logOutput.token).not.toBe(token);
    });

    it('should mask password fields', () => {
      const password = 'MySecurePassword123!';
      logger.info('Test message', { password });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.password).toBe('MySecu...123!');
      expect(logOutput.password).not.toBe(password);
    });

    it('should mask fields with "key" in the name', () => {
      const walletKey = '0x1234567890abcdef1234567890abcdef12345678';
      logger.info('Test message', { walletKey });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.walletKey).toBe('0x1234...5678');
      expect(logOutput.walletKey).not.toBe(walletKey);
    });

    it('should not mask non-sensitive fields', () => {
      const chainId = 137;
      const source = 'env';
      logger.info('Test message', { chainId, source });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.chainId).toBe(chainId);
      expect(logOutput.source).toBe(source);
    });

    it('should handle mixed sensitive and non-sensitive fields', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const chainId = 137;
      const source = 'env';
      
      logger.info('Test message', { address, chainId, source });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.address).toBe('0x1234...5678'); // Masked
      expect(logOutput.chainId).toBe(chainId); // Not masked
      expect(logOutput.source).toBe(source); // Not masked
    });

    it('should mask nested sensitive fields', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const apiKey = 'sk-1234567890abcdef1234567890abcdef';
      
      logger.info('Test message', {
        wallet: { address },
        config: { apiKey, chainId: 137 }
      });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.wallet.address).toBe('0x1234...5678');
      expect(logOutput.config.apiKey).toBe('sk-123...cdef');
      expect(logOutput.config.chainId).toBe(137);
    });

    it('should handle arrays without masking', () => {
      const items = ['item1', 'item2', 'item3'];
      logger.info('Test message', { items });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.items).toEqual(items);
    });

    it('should handle null and undefined values', () => {
      logger.info('Test message', { nullValue: null, undefinedValue: undefined });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.nullValue).toBeNull();
      expect(logOutput.undefinedValue).toBeUndefined();
    });
  });

  describe('Real-world scenarios', () => {
    it('should mask wallet address in trading client initialization', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const chainId = 137;
      
      logger.info('Trading client initialized', { address, chainId });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.message).toBe('Trading client initialized');
      expect(logOutput.address).toBe('0x1234...5678');
      expect(logOutput.chainId).toBe(137);
    });

    it('should mask private key source logging', () => {
      const source = 'env';
      
      // Even though source is not sensitive, if someone accidentally logs the key
      logger.info('Private key loaded securely', { source });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.source).toBe(source);
    });

    it('should mask multiple addresses in order logging', () => {
      const makerAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const takerAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
      
      logger.info('Order matched', { 
        makerAddress, 
        takerAddress,
        orderId: '12345',
        price: 0.5
      });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.makerAddress).toBe('0x1234...5678');
      expect(logOutput.takerAddress).toBe('0xabcd...ef12');
      expect(logOutput.orderId).toBe('12345');
      expect(logOutput.price).toBe(0.5);
    });
  });

  describe('Log levels', () => {
    it('should mask sensitive data in error logs', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      logger.error('Error occurred', { address });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.address).toBe('0x1234...5678');
    });

    it('should mask sensitive data in warn logs', () => {
      const apiKey = 'sk-1234567890abcdef1234567890abcdef';
      logger.warn('Warning message', { apiKey });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.apiKey).toBe('sk-123...cdef');
    });

    it('should mask sensitive data in info logs (default level)', () => {
      const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      logger.info('Info message', { privateKey });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.privateKey).toBe('0xabcd...7890');
    });
  });
});
