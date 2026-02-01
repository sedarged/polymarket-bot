import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { retry } from '../utils/retry';
import { logger } from '../utils/logger';
import { Event, Market } from '@polymarket/shared';

/**
 * Gamma API Client
 * 
 * Official Documentation: https://docs.polymarket.com/developers/gamma-markets-api/overview
 * Base URL: https://gamma-api.polymarket.com
 * 
 * The Gamma API provides market discovery and metadata retrieval for all Polymarket markets.
 * It indexes on-chain data and provides rich endpoints for exploring markets, events, and tags.
 * 
 * Implementation Review: See REPORTS/RESEARCH_REVIEW.md Section 2.2
 * Rate Limits: Part of general CLOB rate limit (9,000 requests per 10 seconds)
 *              See docs/adr/0002-rate-limiting-strategy.md for enhancement plan
 * 
 * @see {@link https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide}
 * @see {@link ../../../../REPORTS/RESEARCH_REVIEW.md}
 */
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

      logger.info('Retrieved active markets', { count: response.data.length });
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

      logger.info('Retrieved events', { count: response.data.length });
      return response.data;
    }, {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
    });
  }
}
