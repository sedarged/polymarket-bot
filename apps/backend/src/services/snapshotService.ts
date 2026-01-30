import axios from 'axios';
import { config } from '../config';
import { OrderbookSnapshot } from '../types';
import { LogService } from './logService';

export class SnapshotService {
  constructor(private logger: LogService) {}

  async fetchOrderbook(marketId: string, tokenId?: string): Promise<OrderbookSnapshot> {
    const response = await axios.get(`${config.clobApiUrl}/book`, {
      params: {
        token_id: tokenId ?? marketId,
      },
    });
    const data = response.data as { bids: [number, number][]; asks: [number, number][] };
    const snapshot: OrderbookSnapshot = {
      marketId,
      bids: data.bids.map(([price, size]) => ({ price, size })),
      asks: data.asks.map(([price, size]) => ({ price, size })),
      updatedAt: new Date().toISOString(),
    };
    this.logger.info('Orderbook snapshot fetched', { marketId });
    return snapshot;
  }
}
