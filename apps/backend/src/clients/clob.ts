import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry } from '../utils/retry';
import { logger } from '../utils/logger';
import { Orderbook } from '@polymarket/shared';

/**
 * CLOB (Central Limit Order Book) API Client
 * 
 * Official Documentation: https://docs.polymarket.com/developers/CLOB/introduction
 * Base URL: https://clob.polymarket.com
 * 
 * This client provides read-only access to the CLOB API for fetching orderbooks.
 * For write operations (order placement), see TradingClient which uses the official SDK.
 * 
 * Implementation Review: See REPORTS/RESEARCH_REVIEW.md Section 2.1
 * Rate Limits: 500-1,500 requests per 10 seconds for market data endpoints
 *              See docs/adr/0002-rate-limiting-strategy.md for enhancement plan
 * 
 * @see {@link https://docs.polymarket.com/developers/CLOB/introduction}
 * @see {@link ../../../REPORTS/RESEARCH_REVIEW.md}
 */
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
      logger.debug('Fetching orderbook', { tokenId });
      
      const response = await this.client.get<Orderbook>(`/book`, {
        params: {
          token_id: tokenId,
        },
      });

      logger.info('Retrieved orderbook', { tokenId });
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }
}
