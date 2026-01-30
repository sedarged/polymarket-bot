import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry } from '../utils/retry';
import { logger } from '../utils/logger';
import { Market, Event } from '../domain/market';

export class GammaClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.gammaApiUrl,
      timeout: 10000,
    });
  }

  async getActiveMarkets(limit?: number): Promise<Market[]> {
    return retry(async () => {
      logger.debug('Fetching active markets from Gamma API');
      
      const response = await this.client.get<Market[]>('/markets', {
        params: {
          active: true,
          closed: false,
          ...(limit && { limit }),
        },
      });

      logger.info(`Retrieved ${response.data.length} active markets`);
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }

  async getEvents(limit?: number): Promise<Event[]> {
    return retry(async () => {
      logger.debug('Fetching events from Gamma API');
      
      const response = await this.client.get<Event[]>('/events', {
        params: {
          active: true,
          closed: false,
          ...(limit && { limit }),
        },
      });

      logger.info(`Retrieved ${response.data.length} events`);
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }
}
