import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry } from '../utils/retry';
import { logger } from '../utils/logger';
import { Orderbook } from '../domain/orderbook';

export class ClobClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.clobApiUrl,
      timeout: 10000,
    });
  }

  async getOrderbook(tokenId: string): Promise<Orderbook> {
    return retry(async () => {
      logger.debug(`Fetching orderbook for token ${tokenId}`);
      
      const response = await this.client.get<Orderbook>(`/book`, {
        params: {
          token_id: tokenId,
        },
      });

      logger.info(`Retrieved orderbook for token ${tokenId}`);
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }
}
