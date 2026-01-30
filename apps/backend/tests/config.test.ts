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
