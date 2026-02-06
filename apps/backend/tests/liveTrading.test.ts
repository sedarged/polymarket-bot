import { describe, it, expect } from 'vitest';
import { isLiveTradingEnabled, assertLiveTradingEnabled } from '../src/utils/liveTrading';
import { Config } from '../src/config';

describe('Live Trading Utility - Audit Finding A-025', () => {
  describe('isLiveTradingEnabled', () => {
    it('should return false when liveTrading is false', () => {
      const config: Config = {
        liveTrading: false,
        complianceAccepted: true,
      } as Config;

      expect(isLiveTradingEnabled(config)).toBe(false);
    });

    it('should return false when complianceAccepted is false', () => {
      const config: Config = {
        liveTrading: true,
        complianceAccepted: false,
      } as Config;

      expect(isLiveTradingEnabled(config)).toBe(false);
    });

    it('should return false when both are false', () => {
      const config: Config = {
        liveTrading: false,
        complianceAccepted: false,
      } as Config;

      expect(isLiveTradingEnabled(config)).toBe(false);
    });

    it('should return true only when both liveTrading and complianceAccepted are true', () => {
      const config: Config = {
        liveTrading: true,
        complianceAccepted: true,
      } as Config;

      expect(isLiveTradingEnabled(config)).toBe(true);
    });
  });

  describe('assertLiveTradingEnabled', () => {
    it('should throw when liveTrading is false', () => {
      const config: Config = {
        liveTrading: false,
        complianceAccepted: true,
      } as Config;

      expect(() => assertLiveTradingEnabled(config)).toThrow(
        'Live trading is disabled. Set LIVE_TRADING=true and COMPLIANCE_ACCEPTED=true to enable.'
      );
    });

    it('should throw when complianceAccepted is false', () => {
      const config: Config = {
        liveTrading: true,
        complianceAccepted: false,
      } as Config;

      expect(() => assertLiveTradingEnabled(config)).toThrow(
        'Live trading is disabled. Set LIVE_TRADING=true and COMPLIANCE_ACCEPTED=true to enable.'
      );
    });

    it('should throw when both are false', () => {
      const config: Config = {
        liveTrading: false,
        complianceAccepted: false,
      } as Config;

      expect(() => assertLiveTradingEnabled(config)).toThrow(
        'Live trading is disabled. Set LIVE_TRADING=true and COMPLIANCE_ACCEPTED=true to enable.'
      );
    });

    it('should not throw when both liveTrading and complianceAccepted are true', () => {
      const config: Config = {
        liveTrading: true,
        complianceAccepted: true,
      } as Config;

      expect(() => assertLiveTradingEnabled(config)).not.toThrow();
    });
  });

  describe('Two-Factor Live Trading Gate', () => {
    it('should require BOTH flags to enable live trading (safety gate)', () => {
      // Test all combinations
      const combinations = [
        { liveTrading: false, complianceAccepted: false, expected: false },
        { liveTrading: true, complianceAccepted: false, expected: false },
        { liveTrading: false, complianceAccepted: true, expected: false },
        { liveTrading: true, complianceAccepted: true, expected: true },
      ];

      for (const combo of combinations) {
        const config: Config = {
          liveTrading: combo.liveTrading,
          complianceAccepted: combo.complianceAccepted,
        } as Config;

        expect(isLiveTradingEnabled(config)).toBe(combo.expected);
      }
    });

    it('should fail safe (default to disabled) when config is partial', () => {
      // When liveTrading is undefined, && returns undefined (falsy)
      let config: Config = {
        liveTrading: undefined as any,
        complianceAccepted: true,
      } as Config;
      // Function returns falsy value (undefined), test with toBeFalsy()
      expect(isLiveTradingEnabled(config)).toBeFalsy();

      // When complianceAccepted is undefined, && returns undefined (falsy)
      config = {
        liveTrading: true,
        complianceAccepted: undefined as any,
      } as Config;
      expect(isLiveTradingEnabled(config)).toBeFalsy();
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error message for disabled trading', () => {
      const config: Config = {
        liveTrading: false,
        complianceAccepted: false,
      } as Config;

      try {
        assertLiveTradingEnabled(config);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Live trading is disabled');
        expect(error.message).toContain('LIVE_TRADING=true');
        expect(error.message).toContain('COMPLIANCE_ACCEPTED=true');
      }
    });
  });
});
