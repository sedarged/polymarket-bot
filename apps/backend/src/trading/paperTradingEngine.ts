import { Order, Fill, Position, Orderbook } from '@polymarket/shared';
import { logger } from '../utils/logger';

export interface PaperTradingEngineConfig {
  slippage: number;
  feeRate: number;
}

export interface EngineState {
  orders: Order[];
  fills: Fill[];
  positions: Map<string, Position>;
  balance: number;
  initialBalance: number;
  realizedPnl: number;
}

/**
 * Paper Trading Engine with deterministic fills based on crossing best bid/ask
 * Tracks positions, realized/unrealized PnL, and fees
 */
export class PaperTradingEngine {
  private config: PaperTradingEngineConfig;
  private state: EngineState;
  private orderIdCounter = 0;

  constructor(config?: Partial<PaperTradingEngineConfig>, initialBalance = 10000) {
    this.config = {
      slippage: config?.slippage ?? 0.01,
      feeRate: config?.feeRate ?? 0.002,
    };

    this.state = {
      orders: [],
      fills: [],
      positions: new Map(),
      balance: initialBalance,
      initialBalance,
      realizedPnl: 0,
    };

    logger.info('Paper trading engine initialized', {
      slippage: this.config.slippage,
      feeRate: this.config.feeRate,
      initialBalance,
    });
  }

  /**
   * Create a new order (does not fill it immediately)
   */
  createOrder(tokenId: string, side: 'BUY' | 'SELL', price: string, size: string): Order {
    const orderId = `paper-${Date.now()}-${this.orderIdCounter++}`;
    const order: Order = {
      orderId,
      tokenId,
      side,
      price,
      size,
      status: 'OPEN',
      createdAt: Date.now(),
      filledSize: '0',
    };

    this.state.orders.push(order);
    logger.info('Paper order created', { orderId, tokenId, side, price, size });
    return order;
  }

  /**
   * Attempt to fill an order against the current orderbook
   * Returns true if the order was filled (fully or partially)
   */
  tryFillOrder(orderId: string, orderbook: Orderbook): boolean {
    const order = this.state.orders.find(o => o.orderId === orderId && o.status === 'OPEN');
    if (!order) {
      return false;
    }

    // Get best bid/ask from orderbook
    const bestBid = orderbook.bids.length > 0 ? Number(orderbook.bids[0].price) : null;
    const bestAsk = orderbook.asks.length > 0 ? Number(orderbook.asks[0].price) : null;

    const orderPrice = Number(order.price);
    const orderSize = Number(order.size);
    const alreadyFilled = Number(order.filledSize || 0);
    const remainingSize = orderSize - alreadyFilled;

    if (remainingSize <= 0) {
      return false;
    }

    let fillPrice: number | null = null;

    // Determine if order can be filled
    if (order.side === 'BUY') {
      // Buy order crosses if our price >= best ask
      if (bestAsk !== null && orderPrice >= bestAsk) {
        // Fill at best ask + slippage
        fillPrice = bestAsk * (1 + this.config.slippage);
      }
    } else {
      // Sell order crosses if our price <= best bid
      if (bestBid !== null && orderPrice <= bestBid) {
        // Fill at best bid - slippage
        fillPrice = bestBid * (1 - this.config.slippage);
      }
    }

    if (fillPrice === null) {
      return false;
    }

    // Determine fill size (for simplicity, fill the entire remaining order)
    const fillSize = remainingSize;
    const fillValue = fillSize * fillPrice;
    const fee = fillValue * this.config.feeRate;

    // Check if we have sufficient balance for buys
    if (order.side === 'BUY') {
      const totalCost = fillValue + fee;
      if (this.state.balance < totalCost) {
        logger.warn('Insufficient balance for buy order', {
          orderId,
          required: totalCost,
          available: this.state.balance,
        });
        return false;
      }
    }

    // Create fill
    const fill: Fill = {
      orderId: order.orderId,
      tokenId: order.tokenId,
      side: order.side,
      price: String(fillPrice),
      size: String(fillSize),
      timestamp: Date.now(),
      fee: String(fee),
    };

    this.state.fills.push(fill);

    // Update order
    const newFilledSize = alreadyFilled + fillSize;
    order.filledSize = String(newFilledSize);
    if (newFilledSize >= orderSize) {
      order.status = 'MATCHED';
    }

    // Update balance
    if (order.side === 'BUY') {
      this.state.balance -= fillValue + fee;
    } else {
      this.state.balance += fillValue - fee;
    }

    // Update position
    this.updatePosition(order.tokenId, order.side, fillSize, fillPrice, fee);

    logger.info('Paper order filled', {
      orderId,
      fillPrice,
      fillSize,
      fee,
      balance: this.state.balance,
    });

    return true;
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId: string): boolean {
    const order = this.state.orders.find(o => o.orderId === orderId && o.status === 'OPEN');
    if (!order) {
      return false;
    }

    order.status = 'CANCELLED';
    logger.info('Paper order cancelled', { orderId });
    return true;
  }

  /**
   * Cancel all open orders
   */
  cancelAllOrders(): void {
    const openOrders = this.state.orders.filter(o => o.status === 'OPEN');
    for (const order of openOrders) {
      order.status = 'CANCELLED';
    }
    logger.warn('All paper orders cancelled', { count: openOrders.length });
  }

  /**
   * Get all orders
   */
  getOrders(): Order[] {
    return [...this.state.orders];
  }

  /**
   * Get all fills
   */
  getFills(): Fill[] {
    return [...this.state.fills];
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    return Array.from(this.state.positions.values());
  }

  /**
   * Get current balance
   */
  getBalance(): number {
    return this.state.balance;
  }

  /**
   * Get realized PnL
   */
  getRealizedPnl(): number {
    return this.state.realizedPnl;
  }

  /**
   * Get unrealized PnL for all positions given current market prices
   */
  getUnrealizedPnl(orderbooks: Map<string, Orderbook>): number {
    let totalUnrealizedPnl = 0;

    for (const position of this.state.positions.values()) {
      const orderbook = orderbooks.get(position.tokenId);
      if (!orderbook) {
        continue;
      }

      // Use mid price as current market value
      const bestBid = orderbook.bids.length > 0 ? Number(orderbook.bids[0].price) : null;
      const bestAsk = orderbook.asks.length > 0 ? Number(orderbook.asks[0].price) : null;
      
      if (bestBid === null || bestAsk === null) {
        continue;
      }

      const midPrice = (bestBid + bestAsk) / 2;
      const positionSize = Number(position.size);
      const averagePrice = Number(position.averagePrice);

      // Unrealized PnL = (current price - average price) * size
      const unrealizedPnl = (midPrice - averagePrice) * positionSize;
      totalUnrealizedPnl += unrealizedPnl;
    }

    return totalUnrealizedPnl;
  }

  /**
   * Get total PnL (realized + unrealized)
   */
  getTotalPnl(orderbooks: Map<string, Orderbook>): number {
    return this.state.realizedPnl + this.getUnrealizedPnl(orderbooks);
  }

  /**
   * Update position after a fill
   */
  private updatePosition(
    tokenId: string,
    side: 'BUY' | 'SELL',
    fillSize: number,
    fillPrice: number,
    fee: number
  ): void {
    const existing = this.state.positions.get(tokenId);

    if (!existing) {
      // New position
      const netSize = side === 'BUY' ? fillSize : -fillSize;
      this.state.positions.set(tokenId, {
        tokenId,
        size: String(netSize),
        averagePrice: String(fillPrice),
      });
      return;
    }

    const currentSize = Number(existing.size);
    const currentAvgPrice = Number(existing.averagePrice);

    if (currentSize === 0) {
      // Opening a new position
      const netSize = side === 'BUY' ? fillSize : -fillSize;
      existing.size = String(netSize);
      existing.averagePrice = String(fillPrice);
    } else if (currentSize > 0) {
      // Currently long
      if (side === 'BUY') {
        // Add to long position
        const newSize = currentSize + fillSize;
        const newAvgPrice = (currentAvgPrice * currentSize + fillPrice * fillSize) / newSize;
        existing.size = String(newSize);
        existing.averagePrice = String(newAvgPrice);
      } else {
        // Reduce or flip long position
        if (fillSize < currentSize) {
          // Partial close - realize PnL
          const pnl = (fillPrice - currentAvgPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          existing.size = String(currentSize - fillSize);
          // Average price stays the same
        } else if (fillSize === currentSize) {
          // Full close - realize PnL
          const pnl = (fillPrice - currentAvgPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          this.state.positions.delete(tokenId);
        } else {
          // Over close: close long and open short
          const closePnl = (fillPrice - currentAvgPrice) * currentSize - fee;
          this.state.realizedPnl += closePnl;
          const remaining = fillSize - currentSize;
          existing.size = String(-remaining);
          existing.averagePrice = String(fillPrice);
        }
      }
    } else {
      // Currently short (currentSize < 0)
      const currentShortSize = -currentSize;
      if (side === 'SELL') {
        // Add to short position
        const newSize = currentShortSize + fillSize;
        const newAvgPrice = (currentAvgPrice * currentShortSize + fillPrice * fillSize) / newSize;
        existing.size = String(-newSize);
        existing.averagePrice = String(newAvgPrice);
      } else {
        // Reduce or flip short position
        if (fillSize < currentShortSize) {
          // Partial close - realize PnL
          const pnl = (currentAvgPrice - fillPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          existing.size = String(-(currentShortSize - fillSize));
          // Average price stays the same
        } else if (fillSize === currentShortSize) {
          // Full close - realize PnL
          const pnl = (currentAvgPrice - fillPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          this.state.positions.delete(tokenId);
        } else {
          // Over close: close short and open long
          const closePnl = (currentAvgPrice - fillPrice) * currentShortSize - fee;
          this.state.realizedPnl += closePnl;
          const remaining = fillSize - currentShortSize;
          existing.size = String(remaining);
          existing.averagePrice = String(fillPrice);
        }
      }
    }
  }

  /**
   * Reset engine state (for testing)
   */
  reset(initialBalance?: number): void {
    const balance = initialBalance ?? this.state.initialBalance;
    this.state = {
      orders: [],
      fills: [],
      positions: new Map(),
      balance,
      initialBalance: balance,
      realizedPnl: 0,
    };
    logger.info('Paper trading engine reset', { initialBalance: balance });
  }
}
