import { Order, Fill, Position, Orderbook } from '@polymarket/shared';
import { logger } from '../utils/logger';
import { AuditTrail } from './auditTrail';
import { validateOrderParametersOrThrow } from '../utils/orderValidation';

export interface PaperTradingEngineConfig {
  slippage: number; // Base slippage for small orders
  maxSlippage: number; // Maximum slippage for large orders
  feeRate: number;
  partialFillRate: number; // Base probability of partial fill (0-1), scaled by liquidity ratio. 0 = always full fill
  minFillRatio: number; // Minimum fill ratio for partial fills (0-1)
  maxFillRatio: number; // Maximum fill ratio for partial fills (0-1)
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
  private auditTrail?: AuditTrail;

  constructor(config?: Partial<PaperTradingEngineConfig> & { auditTrail?: AuditTrail }, initialBalance = 10000) {
    this.config = {
      slippage: config?.slippage ?? 0.01,
      maxSlippage: config?.maxSlippage ?? 0.05,
      feeRate: config?.feeRate ?? 0.002,
      partialFillRate: config?.partialFillRate ?? 0.0, // Default: always full fill (backwards compatible)
      minFillRatio: config?.minFillRatio ?? 0.1, // Fill at least 10% of order
      maxFillRatio: config?.maxFillRatio ?? 0.9, // Fill at most 90% of order for partial fills
    };

    this.auditTrail = config?.auditTrail;

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
      maxSlippage: this.config.maxSlippage,
      feeRate: this.config.feeRate,
      partialFillRate: this.config.partialFillRate,
      minFillRatio: this.config.minFillRatio,
      maxFillRatio: this.config.maxFillRatio,
      initialBalance,
    });
  }

  /**
   * Create a new order (does not fill it immediately)
   * Validates order parameters before creation (Audit Finding A-015)
   */
  createOrder(tokenId: string, side: 'BUY' | 'SELL', price: string, size: string): Order {
    // Validate order parameters (Audit Finding A-015)
    // This prevents malformed orders from propagating through the system
    const validated = validateOrderParametersOrThrow({
      tokenId,
      side,
      price,
      size,
    });

    const orderId = `paper-${Date.now()}-${this.orderIdCounter++}`;
    const order: Order = {
      orderId,
      tokenId: validated.tokenId,
      side: validated.side,
      price: validated.price,
      size: validated.size,
      status: 'OPEN',
      createdAt: Date.now(),
      filledSize: '0',
      remainingSize: validated.size,
    };

    this.state.orders.push(order);
    
    // Record to audit trail if enabled
    if (this.auditTrail) {
      this.auditTrail.recordOrder(order);
      this.auditTrail.recordOrderEvent(orderId, 'CREATED', `Order created: ${validated.side} ${validated.size} @ ${validated.price}`);
    }
    
    logger.info('Paper order created', { orderId, tokenId: validated.tokenId, side: validated.side, price: validated.price, size: validated.size });
    return order;
  }

  /**
   * Attempt to fill an order against the current orderbook
   * Returns true if the order was filled (fully or partially)
   */
  tryFillOrder(orderId: string, orderbook: Orderbook): boolean {
    const order = this.state.orders.find(o => 
      o.orderId === orderId && 
      (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED')
    );
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
    let availableLiquidity = 0;

    // Determine if order can be filled
    if (order.side === 'BUY') {
      // Buy order crosses if our price >= best ask
      if (bestAsk !== null && orderPrice >= bestAsk) {
        // Calculate size-based slippage
        availableLiquidity = orderbook.asks.length > 0 ? Number(orderbook.asks[0].size) : 0;
        const slippage = this.calculateSlippage(remainingSize, availableLiquidity);
        // Fill at best ask + slippage
        fillPrice = bestAsk * (1 + slippage);
      }
    } else {
      // Sell order crosses if our price <= best bid
      if (bestBid !== null && orderPrice <= bestBid) {
        // Calculate size-based slippage
        availableLiquidity = orderbook.bids.length > 0 ? Number(orderbook.bids[0].size) : 0;
        const slippage = this.calculateSlippage(remainingSize, availableLiquidity);
        // Fill at best bid - slippage
        fillPrice = bestBid * (1 - slippage);
      }
    }

    if (fillPrice === null) {
      return false;
    }

    // Determine fill size with configurable partial fill simulation
    const fillSize = this.calculateFillSize(remainingSize, availableLiquidity);
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
    order.remainingSize = String(orderSize - newFilledSize);
    
    // Update status based on fill amount
    if (newFilledSize >= orderSize) {
      order.status = 'MATCHED';
    } else if (newFilledSize > 0) {
      order.status = 'PARTIALLY_FILLED';
    }

    // Record to audit trail if enabled
    if (this.auditTrail) {
      this.auditTrail.recordFill(fill);
      this.auditTrail.recordOrder(order); // Update order status
      this.auditTrail.recordOrderEvent(
        orderId, 
        order.status, 
        `Filled ${fillSize} @ ${fillPrice} (fee: ${fee})`
      );
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
    const order = this.state.orders.find(o => 
      o.orderId === orderId && 
      (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED')
    );
    if (!order) {
      return false;
    }

    order.status = 'CANCELLED';
    
    // Record to audit trail if enabled
    if (this.auditTrail) {
      this.auditTrail.recordOrder(order);
      this.auditTrail.recordOrderEvent(orderId, 'CANCELLED', 'Order cancelled manually');
    }
    
    logger.info('Paper order cancelled', { orderId });
    return true;
  }

  /**
   * Cancel all open orders
   */
  cancelAllOrders(): void {
    const openOrders = this.state.orders.filter(o => 
      o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
    );
    for (const order of openOrders) {
      order.status = 'CANCELLED';
      
      // Record to audit trail if enabled
      if (this.auditTrail) {
        this.auditTrail.recordOrder(order);
        this.auditTrail.recordOrderEvent(order.orderId, 'CANCELLED', 'Order cancelled (cancel all)');
      }
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
   * Calculate slippage based on order size vs available liquidity
   * Slippage scales from base (for small orders) to max (when order size equals liquidity)
   * 
   * Formula: slippage = baseSlippage + (maxSlippage - baseSlippage) * min(1, orderSize / availableLiquidity)
   * 
   * Examples:
   * - Small order (10% of liquidity): ~base slippage
   * - Medium order (50% of liquidity): ~halfway between base and max
   * - Large order (100%+ of liquidity): max slippage
   */
  private calculateSlippage(orderSize: number, availableLiquidity: number): number {
    // If no liquidity available, use max slippage (worst case)
    if (availableLiquidity <= 0) {
      return this.config.maxSlippage;
    }

    // Calculate the ratio of order size to available liquidity
    const sizeRatio = Math.min(1, orderSize / availableLiquidity);
    
    // Scale slippage linearly from base to max based on size ratio
    const slippage = this.config.slippage + 
      (this.config.maxSlippage - this.config.slippage) * sizeRatio;
    
    return slippage;
  }

  /**
   * Calculate the actual fill size for an order
   * Simulates partial fills based on configuration to match realistic CLOB behavior
   * 
   * Partial fills occur based on:
   * 1. Configured base probability (partialFillRate)
   * 2. Available liquidity (larger orders relative to liquidity more likely to be partial)
   * 
   * The actual probability is: baseRate + (1 - baseRate) * liquidityRatio
   * This means:
   * - With baseRate=0: always full fill (0% chance regardless of liquidity)
   * - With baseRate=1: always partial fill (100% chance regardless of liquidity)
   * - With baseRate=0.5 and small order (10% of liquidity): 50% + 50% * 0.1 = 55% chance
   * - With baseRate=0.5 and large order (100% of liquidity): 50% + 50% * 1.0 = 100% chance
   * 
   * @param requestedSize The size the order wants to fill
   * @param availableLiquidity The available liquidity at the best price
   * @returns The actual fill size
   */
  private calculateFillSize(requestedSize: number, availableLiquidity: number): number {
    // If partial fill simulation is disabled (partialFillRate = 0), always fill completely
    if (this.config.partialFillRate === 0) {
      return requestedSize;
    }

    // If partialFillRate is 1.0, always do partial fills
    if (this.config.partialFillRate >= 1.0) {
      // For partial fills, fill a random amount between min and max fill ratio
      const fillRatio = this.config.minFillRatio + 
        Math.random() * (this.config.maxFillRatio - this.config.minFillRatio);
      
      const fillSize = requestedSize * fillRatio;
      
      // Ensure we don't exceed available liquidity
      if (availableLiquidity > 0) {
        return Math.min(fillSize, availableLiquidity);
      }
      
      return fillSize;
    }

    // For values between 0 and 1, scale probability based on liquidity
    // Larger orders relative to liquidity have higher chance of partial fill
    const liquidityRatio = availableLiquidity > 0 ? Math.min(1, requestedSize / availableLiquidity) : 1;
    const partialFillProbability = this.config.partialFillRate + (1 - this.config.partialFillRate) * liquidityRatio;
    
    const shouldPartialFill = Math.random() < partialFillProbability;
    
    if (!shouldPartialFill) {
      // Full fill
      return requestedSize;
    }

    // For partial fills, fill a random amount between min and max fill ratio
    const fillRatio = this.config.minFillRatio + 
      Math.random() * (this.config.maxFillRatio - this.config.minFillRatio);
    
    const fillSize = requestedSize * fillRatio;
    
    // Ensure we don't exceed available liquidity
    if (availableLiquidity > 0) {
      return Math.min(fillSize, availableLiquidity);
    }
    
    return fillSize;
  }

  /**
   * Update position after a fill
   * Fees are incorporated into cost basis for position tracking
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
      // New position - incorporate fee into cost basis
      const netSize = side === 'BUY' ? fillSize : -fillSize;
      // For buys, fee increases cost basis; for sells, fee increases cost basis of short
      const feePerUnit = fee / fillSize;
      const adjustedPrice = side === 'BUY' ? fillPrice + feePerUnit : fillPrice + feePerUnit;
      
      this.state.positions.set(tokenId, {
        tokenId,
        size: String(netSize),
        averagePrice: String(adjustedPrice),
      });
      return;
    }

    const currentSize = Number(existing.size);
    const currentAvgPrice = Number(existing.averagePrice);

    if (currentSize === 0) {
      // Opening a new position - incorporate fee into cost basis
      const netSize = side === 'BUY' ? fillSize : -fillSize;
      const feePerUnit = fee / fillSize;
      const adjustedPrice = side === 'BUY' ? fillPrice + feePerUnit : fillPrice + feePerUnit;
      existing.size = String(netSize);
      existing.averagePrice = String(adjustedPrice);
    } else if (currentSize > 0) {
      // Currently long
      if (side === 'BUY') {
        // Add to long position - incorporate fee into cost basis
        const newSize = currentSize + fillSize;
        const feePerUnit = fee / fillSize;
        const adjustedFillPrice = fillPrice + feePerUnit;
        const newAvgPrice = (currentAvgPrice * currentSize + adjustedFillPrice * fillSize) / newSize;
        existing.size = String(newSize);
        existing.averagePrice = String(newAvgPrice);
      } else {
        // Reduce or flip long position
        if (fillSize < currentSize) {
          // Partial close - realize PnL (subtract fee from proceeds)
          const pnl = (fillPrice - currentAvgPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          existing.size = String(currentSize - fillSize);
          // Average price stays the same
        } else if (fillSize === currentSize) {
          // Full close - realize PnL (subtract fee from proceeds)
          const pnl = (fillPrice - currentAvgPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          this.state.positions.delete(tokenId);
        } else {
          // Over close: close long and open short
          // Split fee proportionally between closing and opening
          const closingPortion = currentSize / fillSize;
          const openingPortion = 1 - closingPortion;
          const closingFee = fee * closingPortion;
          const openingFee = fee * openingPortion;
          
          const closePnl = (fillPrice - currentAvgPrice) * currentSize - closingFee;
          this.state.realizedPnl += closePnl;
          
          const remaining = fillSize - currentSize;
          const feePerUnit = openingFee / remaining;
          existing.size = String(-remaining);
          existing.averagePrice = String(fillPrice + feePerUnit);
        }
      }
    } else {
      // Currently short (currentSize < 0)
      const currentShortSize = -currentSize;
      if (side === 'SELL') {
        // Add to short position - incorporate fee into cost basis
        const newSize = currentShortSize + fillSize;
        const feePerUnit = fee / fillSize;
        const adjustedFillPrice = fillPrice + feePerUnit;
        const newAvgPrice = (currentAvgPrice * currentShortSize + adjustedFillPrice * fillSize) / newSize;
        existing.size = String(-newSize);
        existing.averagePrice = String(newAvgPrice);
      } else {
        // Reduce or flip short position
        if (fillSize < currentShortSize) {
          // Partial close - realize PnL (subtract fee from proceeds)
          const pnl = (currentAvgPrice - fillPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          existing.size = String(-(currentShortSize - fillSize));
          // Average price stays the same
        } else if (fillSize === currentShortSize) {
          // Full close - realize PnL (subtract fee from proceeds)
          const pnl = (currentAvgPrice - fillPrice) * fillSize - fee;
          this.state.realizedPnl += pnl;
          this.state.positions.delete(tokenId);
        } else {
          // Over close: close short and open long
          // Split fee proportionally between closing and opening
          const closingPortion = currentShortSize / fillSize;
          const openingPortion = 1 - closingPortion;
          const closingFee = fee * closingPortion;
          const openingFee = fee * openingPortion;
          
          const closePnl = (currentAvgPrice - fillPrice) * currentShortSize - closingFee;
          this.state.realizedPnl += closePnl;
          
          const remaining = fillSize - currentShortSize;
          const feePerUnit = openingFee / remaining;
          existing.size = String(remaining);
          existing.averagePrice = String(fillPrice + feePerUnit);
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
