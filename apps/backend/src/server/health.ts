import { config, Config } from '../config';
import { isLiveTradingEnabled } from '../utils/liveTrading';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  liveTradingEnabled: boolean;
}

export function getHealthStatus(currentConfig: Config = config): HealthStatus {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    liveTradingEnabled: isLiveTradingEnabled(currentConfig),
  };
}
