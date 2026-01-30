import axios from 'axios';
import { config } from '../config';
import { Market } from '../types';
import { LogService } from './logService';

export class MarketDiscoveryService {
  private markets: Market[] = [];

  constructor(private logger: LogService) {}

  async refresh(): Promise<Market[]> {
    const response = await axios.get(`${config.gammaApiUrl}/markets`);
    const markets = (response.data as Market[]) ?? [];
    this.markets = markets;
    this.logger.info('Market discovery refresh complete', { count: markets.length });
    return markets;
  }

  list(): Market[] {
    return this.markets;
  }
}
