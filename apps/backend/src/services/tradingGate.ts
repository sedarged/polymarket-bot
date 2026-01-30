import { config } from '../config';
import { LogService } from './logService';

type ClobClientInstance = {
  isUserBanned?: () => Promise<boolean>;
  getBalanceAllowance?: () => Promise<unknown>;
  getOpenOrders?: () => Promise<unknown>;
};

type ClobClientConstructor = new (...args: unknown[]) => ClobClientInstance;

type ClobClientModule = {
  ClobClient: ClobClientConstructor;
};

export class TradingGate {
  private client?: ClobClientInstance;
  private banned = false;

  constructor(private logger: LogService) {}

  isLive(): boolean {
    return config.liveTrading;
  }

  async initialize(): Promise<void> {
    if (!config.liveTrading) {
      this.logger.warn('LIVE_TRADING is false; trading will be simulated.');
      return;
    }
    const clobModule = (await import('@polymarket/clob-client')) as unknown as ClobClientModule;
    this.client = new clobModule.ClobClient({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      passphrase: config.apiPassphrase,
      host: config.clobApiUrl,
      level: 'l2',
    });
    await this.refreshBanStatus();
  }

  async refreshBanStatus(): Promise<boolean> {
    if (!this.client?.isUserBanned) {
      this.banned = false;
      return this.banned;
    }
    this.banned = await this.client.isUserBanned();
    if (this.banned) {
      this.logger.error('User is banned from trading.');
    }
    return this.banned;
  }

  async fetchBalances(): Promise<unknown> {
    if (!this.client?.getBalanceAllowance) {
      return null;
    }
    return this.client.getBalanceAllowance();
  }

  async fetchOpenOrders(): Promise<unknown> {
    if (!this.client?.getOpenOrders) {
      return null;
    }
    return this.client.getOpenOrders();
  }

  ensureTradingAllowed(): void {
    if (!config.liveTrading) {
      throw new Error('Live trading disabled');
    }
    if (this.banned) {
      throw new Error('Trading blocked due to ban status');
    }
  }

  isBanned(): boolean {
    return this.banned;
  }
}
