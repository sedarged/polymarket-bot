import { randomUUID } from 'crypto';
import { Order, Fill, OrderSide } from '../types';
import { OrderbookService } from './orderbook';
import { SqliteStore } from '../storage/sqlite';
import { LogService } from './logService';

export class PaperTradingEngine {
  private orders = new Map<string, Order>();

  constructor(
    private orderbook: OrderbookService,
    private store: SqliteStore,
    private logger: LogService,
    private onFill?: (fill: Fill) => void,
  ) {}

  placeOrder(marketId: string, side: OrderSide, price: number, size: number): Order {
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      marketId,
      side,
      price,
      size,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      live: false,
    };
    this.orders.set(order.id, order);
    this.store.upsertOrder(order);

    const fill = this.fillAgainstBook(order);
    if (fill) {
      this.finalizeFill(order, fill);
    }
    return order;
  }

  cancelOrder(orderId: string): Order | undefined {
    const order = this.orders.get(orderId);
    if (!order) return undefined;
    const updated = {
      ...order,
      status: 'cancelled' as const,
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(orderId, updated);
    this.store.upsertOrder(updated);
    return updated;
  }

  listOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  private fillAgainstBook(order: Order): Fill | undefined {
    const book = this.orderbook.get(order.marketId);
    if (!book) {
      this.logger.warn('Paper trade missing orderbook', { marketId: order.marketId });
      return undefined;
    }
    const level = order.side === 'buy' ? book.asks[0] : book.bids[0];
    if (!level) return undefined;
    const fillPrice = order.side === 'buy' ? Math.min(order.price, level.price) : Math.max(order.price, level.price);
    if ((order.side === 'buy' && fillPrice > order.price) || (order.side === 'sell' && fillPrice < order.price)) {
      return undefined;
    }
    return {
      id: randomUUID(),
      orderId: order.id,
      marketId: order.marketId,
      side: order.side,
      price: fillPrice,
      size: order.size,
      fee: 0,
      timestamp: new Date().toISOString(),
    };
  }

  private finalizeFill(order: Order, fill: Fill): void {
    const updated: Order = {
      ...order,
      status: 'filled',
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(order.id, updated);
    this.store.upsertOrder(updated);
    this.store.insertFill(fill);
    this.onFill?.(fill);
  }
}
