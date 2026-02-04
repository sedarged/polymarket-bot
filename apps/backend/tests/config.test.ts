import { describe, it, expect } from 'vitest';
import { parseConfig } from '../src/config';

describe('Config validation', () => {
  it('parses defaults when env is empty', () => {
    const parsed = parseConfig({});

    expect(parsed.gammaApiUrl).toBe('https://gamma-api.polymarket.com');
    expect(parsed.clobApiUrl).toBe('https://clob.polymarket.com');
    expect(parsed.logLevel).toBe('info');
    expect(parsed.retryAttempts).toBe(3);
    expect(parsed.retryDelay).toBe(1000);
    expect(parsed.liveTrading).toBe(false);
    expect(parsed.complianceAccepted).toBe(false);
    expect(parsed.port).toBe(3000);
    expect(parsed.allowedOrigins).toEqual(['http://localhost:3000']);
  });

  it('rejects invalid configuration values', () => {
    expect(() =>
      parseConfig({
        GAMMA_API_URL: 'not-a-url',
        RETRY_ATTEMPTS: '0',
        LIVE_TRADING: 'not-boolean',
      })
    ).toThrow('Invalid configuration');
  });
});

describe('CORS configuration validation', () => {
  it('parses single origin correctly', () => {
    const parsed = parseConfig({
      ALLOWED_ORIGINS: 'https://app.example.com',
    });
    expect(parsed.allowedOrigins).toEqual(['https://app.example.com']);
  });

  it('parses multiple origins correctly', () => {
    const parsed = parseConfig({
      ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
    });
    expect(parsed.allowedOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('handles whitespace in origin list', () => {
    const parsed = parseConfig({
      ALLOWED_ORIGINS: 'https://app.example.com, https://admin.example.com , https://test.example.com',
    });
    expect(parsed.allowedOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
      'https://test.example.com',
    ]);
  });

  it('allows wildcard in development mode', () => {
    const parsed = parseConfig({
      ALLOWED_ORIGINS: '*',
      LIVE_TRADING: 'false',
    });
    expect(parsed.allowedOrigins).toEqual(['*']);
  });

  it('throws error when wildcard is used with live trading enabled', () => {
    expect(() =>
      parseConfig({
        ALLOWED_ORIGINS: '*',
        LIVE_TRADING: 'true',
        COMPLIANCE_ACCEPTED: 'true',
      })
    ).toThrow('CRITICAL SECURITY ERROR: Wildcard CORS (*) is not allowed in production');
  });

  it('throws error when wildcard is used in production environment', () => {
    expect(() =>
      parseConfig({
        ALLOWED_ORIGINS: '*',
        NODE_ENV: 'production',
      })
    ).toThrow('CRITICAL SECURITY ERROR: Wildcard CORS (*) is not allowed in production');
  });

  it('allows specific origins with live trading enabled', () => {
    const parsed = parseConfig({
      ALLOWED_ORIGINS: 'https://app.example.com',
      LIVE_TRADING: 'true',
      COMPLIANCE_ACCEPTED: 'true',
    });
    expect(parsed.allowedOrigins).toEqual(['https://app.example.com']);
  });
});
