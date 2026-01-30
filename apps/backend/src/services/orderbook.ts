import { OrderbookSnapshot, OrderbookLevel } from '../types';

export class OrderbookService {
  private books = new Map<string, OrderbookSnapshot>();

  applySnapshot(snapshot: OrderbookSnapshot): void {
    this.books.set(snapshot.marketId, snapshot);
  }

  applyDelta(marketId: string, bids: OrderbookLevel[], asks: OrderbookLevel[]): void {
    const existing = this.books.get(marketId);
    const updated: OrderbookSnapshot = {
      marketId,
      bids: bids.length ? bids : existing?.bids ?? [],
      asks: asks.length ? asks : existing?.asks ?? [],
      updatedAt: new Date().toISOString(),
    };
    this.books.set(marketId, updated);
  }

  get(marketId: string): OrderbookSnapshot | undefined {
    return this.books.get(marketId);
  }

  list(): OrderbookSnapshot[] {
    return Array.from(this.books.values());
  }
}
