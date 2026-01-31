import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';
import { assertLiveTradingEnabled } from '../utils/liveTrading';
import { Order, Fill, Position, Balance } from '@polymarket/shared';

export interface TradingState {
  orders: Order[];
  fills: Fill[];
  positions: Position[];
  balances: Balance[];
}

export class TradingClient {
  private client: ClobClient | null = null;
  private wallet: ethers.Wallet | null = null;
  private state: TradingState = {
    orders: [],
    fills: [],
    positions: [],
    balances: [],
  };
  private orderIdCounter = 0;

  async initialize(): Promise<void> {
    // Verify trading is enabled
    assertLiveTradingEnabled();

    // Verify private key is provided
    if (!config.privateKey) {
      throw new Error('PRIVATE_KEY is required for live trading');
    }

    try {
      // Create wallet
      this.wallet = new ethers.Wallet(config.privateKey);
      
      // Initialize CLOB client
      this.client = new ClobClient(
        config.clobApiUrl,
        config.chainId,
        this.wallet
      );

      logger.info('Trading client initialized', {
        address: this.wallet.address,
        chainId: config.chainId,
      });

      // Perform startup reconciliation
      await this.reconcile();
    } catch (error) {
      logger.error('Failed to initialize trading client', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Startup reconciliation: fetch open orders, balances, and positions
   */
  async reconcile(): Promise<void> {
    if (!this.client) {
      throw new Error('Trading client not initialized');
    }

    try {
      logger.info('Starting reconciliation');

      // Fetch open orders
      const openOrders = await this.client.getOrders();
      this.state.orders = openOrders.map(this.mapOrder);

      // Fetch balances (if supported)
      try {
        // Note: The actual API might differ - this is a placeholder
        // @ts-ignore - API may not be exposed in types
        const balancesData = await this.client.getBalanceAllowance?.();
        if (balancesData) {
          this.state.balances = [{
            currency: 'USDC',
            available: balancesData.balance || '0',
            total: balancesData.balance || '0',
          }];
        }
      } catch (err) {
        logger.warn('Could not fetch balances', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Calculate positions from orders and fills
      await this.recalculatePositions();

      logger.info('Reconciliation complete', {
        orders: this.state.orders.length,
        positions: this.state.positions.length,
        balances: this.state.balances.length,
      });
    } catch (error) {
      logger.error('Reconciliation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new order with idempotency via clientOrderId
   */
  async createOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: string,
    size: string
  ): Promise<Order> {
    assertLiveTradingEnabled();

    if (!this.client) {
      throw new Error('Trading client not initialized');
    }

    // Generate unique clientOrderId for idempotency
    const clientOrderId = `order-${Date.now()}-${this.orderIdCounter++}`;

    try {
      logger.info('Creating order', { tokenId, side, price, size, clientOrderId });

      // Create order via CLOB client
      const response = await this.client.createOrder({
        tokenID: tokenId,
        side: side === 'BUY' ? 'BUY' : 'SELL',
        price: Number(price),
        size: Number(size),
        // @ts-ignore - clientOrderId might not be in types
        clientOrderId,
      });

      const order: Order = {
        orderId: response.orderID || clientOrderId,
        clientOrderId,
        tokenId,
        side,
        price,
        size,
        status: 'OPEN',
        createdAt: Date.now(),
        filledSize: '0',
      };

      this.state.orders.push(order);

      logger.info('Order created', { orderId: order.orderId, clientOrderId });

      return order;
    } catch (error) {
      logger.error('Failed to create order', {
        error: error instanceof Error ? error.message : String(error),
        tokenId,
        side,
        price,
        size,
      });
      throw error;
    }
  }

  /**
   * Cancel an order by ID
   */
  async cancelOrder(orderId: string): Promise<void> {
    assertLiveTradingEnabled();

    if (!this.client) {
      throw new Error('Trading client not initialized');
    }

    try {
      logger.info('Cancelling order', { orderId });

      await this.client.cancelOrder(orderId);

      // Update local state
      const order = this.state.orders.find(o => o.orderId === orderId);
      if (order) {
        order.status = 'CANCELLED';
      }

      logger.info('Order cancelled', { orderId });
    } catch (error) {
      logger.error('Failed to cancel order', {
        error: error instanceof Error ? error.message : String(error),
        orderId,
      });
      throw error;
    }
  }

  /**
   * Cancel all open orders (kill switch)
   */
  async cancelAllOrders(): Promise<void> {
    assertLiveTradingEnabled();

    if (!this.client) {
      throw new Error('Trading client not initialized');
    }

    logger.warn('Cancelling all orders (kill switch activated)');

    const openOrders = this.state.orders.filter(o => o.status === 'OPEN');

    for (const order of openOrders) {
      try {
        await this.cancelOrder(order.orderId);
      } catch (error) {
        logger.error('Failed to cancel order during kill switch', {
          orderId: order.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.warn('Kill switch complete', {
      cancelledOrders: openOrders.length,
    });
  }

  /**
   * Get current trading state
   */
  getState(): TradingState {
    return {
      orders: [...this.state.orders],
      fills: [...this.state.fills],
      positions: [...this.state.positions],
      balances: [...this.state.balances],
    };
  }

  /**
   * Get wallet address
   */
  getAddress(): string | null {
    return this.wallet?.address || null;
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.client !== null && this.wallet !== null;
  }

  /**
   * Map CLOB order to our Order type
   */
  private mapOrder(clobOrder: any): Order {
    return {
      orderId: clobOrder.id || clobOrder.orderID,
      clientOrderId: clobOrder.clientOrderId,
      tokenId: clobOrder.asset_id || clobOrder.tokenID,
      side: clobOrder.side === 'BUY' ? 'BUY' : 'SELL',
      price: String(clobOrder.price),
      size: String(clobOrder.size || clobOrder.originalSize),
      status: clobOrder.status === 'LIVE' ? 'OPEN' : clobOrder.status === 'MATCHED' ? 'MATCHED' : 'CANCELLED',
      createdAt: clobOrder.created_at || Date.now(),
      filledSize: String(clobOrder.sizeMatched || '0'),
    };
  }

  /**
   * Recalculate positions from orders and fills
   */
  private async recalculatePositions(): Promise<void> {
    // Group orders by token ID
    const positionMap = new Map<string, { totalBought: number; totalSold: number; avgBuyPrice: number; avgSellPrice: number }>();

    for (const order of this.state.orders) {
      if (order.status !== 'MATCHED') continue;

      const filledSize = Number(order.filledSize || 0);
      if (filledSize === 0) continue;

      const price = Number(order.price);
      const existing = positionMap.get(order.tokenId) || {
        totalBought: 0,
        totalSold: 0,
        avgBuyPrice: 0,
        avgSellPrice: 0,
      };

      if (order.side === 'BUY') {
        const newTotal = existing.totalBought + filledSize;
        existing.avgBuyPrice = (existing.avgBuyPrice * existing.totalBought + price * filledSize) / newTotal;
        existing.totalBought = newTotal;
      } else {
        const newTotal = existing.totalSold + filledSize;
        existing.avgSellPrice = (existing.avgSellPrice * existing.totalSold + price * filledSize) / newTotal;
        existing.totalSold = newTotal;
      }

      positionMap.set(order.tokenId, existing);
    }

    // Convert to positions
    this.state.positions = Array.from(positionMap.entries()).map(([tokenId, data]) => {
      const netSize = data.totalBought - data.totalSold;
      const avgPrice = netSize > 0 ? data.avgBuyPrice : data.avgSellPrice;

      return {
        tokenId,
        size: String(netSize),
        averagePrice: String(avgPrice),
      };
    }).filter(p => Number(p.size) !== 0);
  }
}

// Singleton instance
export const tradingClient = new TradingClient();
