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

  it('throws error when ALLOWED_ORIGINS is empty string', () => {
    expect(() =>
      parseConfig({
        ALLOWED_ORIGINS: '',
      })
    ).toThrow('CRITICAL CONFIGURATION ERROR: ALLOWED_ORIGINS cannot be empty');
  });

  it('throws error when ALLOWED_ORIGINS is only commas', () => {
    expect(() =>
      parseConfig({
        ALLOWED_ORIGINS: ',,,',
      })
    ).toThrow('CRITICAL CONFIGURATION ERROR: ALLOWED_ORIGINS cannot be empty');
  });

  it('throws error when ALLOWED_ORIGINS contains only whitespace', () => {
    expect(() =>
      parseConfig({
        ALLOWED_ORIGINS: '  ,  ,  ',
      })
    ).toThrow('CRITICAL CONFIGURATION ERROR: ALLOWED_ORIGINS cannot be empty');
  });
});

describe('Paper trading slippage validation', () => {
  it('accepts valid slippage config where maxSlippage >= slippage', () => {
    const parsed = parseConfig({
      PAPER_TRADING_SLIPPAGE: '0.01',
      PAPER_TRADING_MAX_SLIPPAGE: '0.05',
    });
    expect(parsed.paperTradingSlippage).toBe(0.01);
    expect(parsed.paperTradingMaxSlippage).toBe(0.05);
  });

  it('accepts edge case where maxSlippage equals slippage', () => {
    const parsed = parseConfig({
      PAPER_TRADING_SLIPPAGE: '0.03',
      PAPER_TRADING_MAX_SLIPPAGE: '0.03',
    });
    expect(parsed.paperTradingSlippage).toBe(0.03);
    expect(parsed.paperTradingMaxSlippage).toBe(0.03);
  });

  it('throws error when maxSlippage < slippage', () => {
    expect(() =>
      parseConfig({
        PAPER_TRADING_SLIPPAGE: '0.05',
        PAPER_TRADING_MAX_SLIPPAGE: '0.01',
      })
    ).toThrow('PAPER_TRADING_MAX_SLIPPAGE must be greater than or equal to PAPER_TRADING_SLIPPAGE');
  });
});
