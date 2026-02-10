import { describe, it, expect } from 'vitest';
import { assertLiveTradingEnabled, isLiveTradingEnabled } from '../../src/utils/liveTrading';
import { parseConfig, type Config } from '../../src/config';

describe('Live trading gating', () => {
  const baseConfig = parseConfig({});
  const withOverrides = (overrides: Partial<Config>): Config => ({
    ...baseConfig,
    ...overrides,
  });

  it('allows live trading only when both flags are true', () => {
    expect(
      isLiveTradingEnabled(withOverrides({ liveTrading: false, complianceAccepted: false }))
    ).toBe(false);
    expect(
      isLiveTradingEnabled(withOverrides({ liveTrading: true, complianceAccepted: false }))
    ).toBe(false);
    expect(
      isLiveTradingEnabled(withOverrides({ liveTrading: false, complianceAccepted: true }))
    ).toBe(false);
    expect(
      isLiveTradingEnabled(withOverrides({ liveTrading: true, complianceAccepted: true }))
    ).toBe(true);
  });

  it('throws when live trading is disabled', () => {
    expect(() =>
      assertLiveTradingEnabled(withOverrides({ liveTrading: true, complianceAccepted: false }))
    ).toThrow('Live trading is disabled');
  });
});
