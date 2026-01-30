import { config, Config } from '../config';

export function isLiveTradingEnabled(currentConfig: Config = config): boolean {
  return currentConfig.liveTrading && currentConfig.complianceAccepted;
}

export function assertLiveTradingEnabled(currentConfig: Config = config): void {
  if (!isLiveTradingEnabled(currentConfig)) {
    throw new Error(
      'Live trading is disabled. Set LIVE_TRADING=true and COMPLIANCE_ACCEPTED=true to enable.'
    );
  }
}
