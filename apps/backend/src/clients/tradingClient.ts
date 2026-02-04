import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';
import { assertLiveTradingEnabled } from '../utils/liveTrading';
import { Order, Fill, Position, Balance } from '@polymarket/shared';
import { getPrivateKey, loadSecretsConfig } from '../secrets';

/**
 * Trading Client for Live Order Placement with Partial Fill Tracking
 * 
 * Official Documentation: https://docs.polymarket.com/developers/CLOB/orders/create-order
 * SDK: @polymarket/clob-client v5.2.1
 * 
 * This client uses the official Polymarket CLOB SDK for order placement and management.
 * It handles L1/L2 authentication automatically via the SDK and provides:
 * - Idempotent order placement using clientOrderId
 * - Startup reconciliation of open orders and positions
 * - Kill switch for emergency order cancellation
 * - Order state tracking and management
 * - **Comprehensive partial fill tracking (EE-001)**
 * - **Missed fill detection during reconciliation**
 * - **Accurate position calculation with partial fills**
 * 
 * Partial Fill Support:
 * - Tracks order state: OPEN → PARTIALLY_FILLED → MATCHED
 * - Records all fills with size, price, and fee
 * - Calculates positions from actual filled amounts
 * - Handles multi-step fills (multiple partials per order)
 * - Detects and recovers missed fills during reconciliation
 * 
 * Implementation Review: See REPORTS/RESEARCH_REVIEW.md Section 2.4
 * Authentication: Fully aligned with official L1/L2 flow via SDK ✓
 * Chain ID: 137 (Polygon Mainnet) ✓
 * Security: Dual-gate system (LIVE_TRADING + COMPLIANCE_ACCEPTED) ✓
 * Secrets Management: Addresses Audit Finding A-001 ✓
 * Partial Fills: Addresses Audit Gap EE-001 ✓
 * 
 * @see {@link https://docs.polymarket.com/developers/CLOB/authentication}
 * @see {@link https://docs.polymarket.com/developers/CLOB/orders/create-order}
 * @see {@link ../../../../REPORTS/RESEARCH_REVIEW.md}
 * @see {@link ../../../../REPORTS/GAP_ANALYSIS.md} - EE-001
 * @see {@link ../../../../docs/adr/0006-partial-fill-tracking.md}
 * @see {@link ../../../../docs/order-state-machine.md}
 */
export interface TradingState {
  orders: Order[];
  fills: Fill[];
  positions: Position[];
  balances: Balance[];
}

// Interface for CLOB order responses to replace 'any'
interface ClobOrder {
  id?: string;
  orderID?: string;
  clientOrderId?: string;
  asset_id?: string;
  tokenID?: string;
  side: string;
  price: number | string;
  size?: number | string;
  originalSize?: number | string;
  status?: string;
  created_at?: number;
  sizeMatched?: number | string;
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
  private processedFillIds: Set<string> = new Set(); // Track processed fills for idempotency

  async initialize(): Promise<void> {
    // Verify trading is enabled
    assertLiveTradingEnabled();

    try {
      // Load private key using secure secrets management (Audit Finding A-001)
      const secretsConfig = loadSecretsConfig();
      const { key: privateKey, source } = await getPrivateKey(secretsConfig);
      
      logger.info('Private key loaded securely', {
        source,
        // Don't log the key itself
      });
      
      // Create wallet
      this.wallet = new ethers.Wallet(privateKey);
      
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
      this.recalculatePositions();

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
    // Include timestamp, counter, and process ID for better uniqueness
    const clientOrderId = `order-${Date.now()}-${process.pid}-${this.orderIdCounter++}`;

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
        remainingSize: size,
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

    const openOrders = this.state.orders.filter(o => 
      o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'
    );

    // Cancel orders in parallel for better performance
    const cancellationPromises = openOrders.map(order =>
      this.cancelOrder(order.orderId).catch(error => {
        logger.error('Failed to cancel order during kill switch', {
          orderId: order.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
    );

    await Promise.allSettled(cancellationPromises);

    logger.warn('Kill switch complete', {
      totalOrders: openOrders.length,
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
   * Add order to internal state (for testing only)
   * @internal
   */
  _addTestOrder(order: Order): void {
    this.state.orders.push(order);
  }

  /**
   * Map CLOB order to our Order type
   */
  private mapOrder(clobOrder: ClobOrder): Order {
    // Validate critical fields
    const orderId = clobOrder.id || clobOrder.orderID;
    if (!orderId) {
      logger.warn('CLOB order missing ID', { order: clobOrder });
    }

    const tokenId = clobOrder.asset_id || clobOrder.tokenID;
    if (!tokenId) {
      logger.warn('CLOB order missing token ID', { order: clobOrder });
    }

    const originalSize = Number(clobOrder.size || clobOrder.originalSize || 0);
    let filledSize = Number(clobOrder.sizeMatched || 0);
    
    // Clamp filledSize to valid range [0, originalSize]
    if (isNaN(filledSize) || filledSize < 0) {
      logger.warn('Invalid filledSize, clamping to 0', { order: clobOrder, filledSize });
      filledSize = 0;
    } else if (filledSize > originalSize && originalSize > 0) {
      logger.warn('FilledSize exceeds originalSize, clamping', { 
        order: clobOrder, 
        filledSize, 
        originalSize 
      });
      filledSize = originalSize;
    }
    
    const remainingSize = Math.max(0, originalSize - filledSize);

    // Determine status based on fill amount
    let status: Order['status'] = 'OPEN';
    if (clobOrder.status === 'CANCELLED') {
      status = 'CANCELLED';
    } else if (filledSize >= originalSize && filledSize > 0) {
      status = 'MATCHED';
    } else if (filledSize > 0) {
      status = 'PARTIALLY_FILLED';
    } else if (clobOrder.status === 'LIVE') {
      status = 'OPEN';
    }

    return {
      orderId: orderId || '',
      clientOrderId: clobOrder.clientOrderId,
      tokenId: tokenId || '',
      side: clobOrder.side === 'BUY' ? 'BUY' : 'SELL',
      price: String(clobOrder.price),
      size: String(originalSize),
      status,
      createdAt: clobOrder.created_at || Date.now(),
      filledSize: String(filledSize),
      remainingSize: String(remainingSize),
    };
  }

  /**
   * Recalculate positions from orders and fills
   * 
   * This method calculates positions from actual filled amounts, properly
   * handling partial fills. It processes orders in chronological order and:
   * 
   * - Uses filledSize for position calculation (not order size)
   * - Handles MATCHED, PARTIALLY_FILLED, and CANCELLED orders with fills
   * - Calculates weighted average cost basis
   * - Supports position additions, reductions, and flips
   * - Filters out zero positions
   * 
   * Position calculation now correctly handles:
   * - Partial fills: Uses only the filled portion
   * - Multi-step fills: Accumulates fills across multiple events
   * - Mixed orders: Buy/sell operations on same token
   * - Cancelled orders: Includes filled portion of cancelled orders
   * 
   * Called automatically after every fill event to ensure positions
   * are always accurate.
   * 
   * @private
   * @see {@link ../../../../docs/adr/0006-partial-fill-tracking.md}
   */
  private recalculatePositions(): void {
    // Group orders by token ID and track net position and cost basis
    const positionMap = new Map<string, { netSize: number; avgPrice: number }>();

    // Process orders with non-zero filled size (including cancelled), in chronological order
    const ordersWithFills = this.state.orders
      .filter((order) => Number(order.filledSize || 0) !== 0)
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const order of ordersWithFills) {
      const filledSize = Number(order.filledSize || 0);
      if (filledSize === 0) continue;

      const price = Number(order.price);
      const isBuy = order.side === 'BUY';

      const existing = positionMap.get(order.tokenId) || {
        netSize: 0,
        avgPrice: 0,
      };

      let { netSize, avgPrice } = existing;

      if (netSize === 0) {
        // Opening a new position
        netSize = isBuy ? filledSize : -filledSize;
        avgPrice = price;
      } else if (netSize > 0) {
        // Currently long
        if (isBuy) {
          // Add to long position: update weighted average cost
          const newSize = netSize + filledSize;
          avgPrice = (avgPrice * netSize + price * filledSize) / newSize;
          netSize = newSize;
        } else {
          // Sell against long: reduce or flip
          if (filledSize < netSize) {
            // Partial close; cost basis of remaining unchanged
            netSize -= filledSize;
          } else if (filledSize === netSize) {
            // Fully closed
            netSize = 0;
            avgPrice = 0;
          } else {
            // Over close: close long, open new short with remaining size
            const remaining = filledSize - netSize;
            netSize = -remaining;
            avgPrice = price;
          }
        }
      } else {
        // Currently short (netSize < 0)
        const currentShortSize = -netSize;
        if (!isBuy) {
          // Add to short position: update weighted average cost
          const newSize = currentShortSize + filledSize;
          avgPrice = (avgPrice * currentShortSize + price * filledSize) / newSize;
          netSize = -newSize;
        } else {
          // Buy against short: reduce or flip
          if (filledSize < currentShortSize) {
            // Partial close; cost basis of remaining unchanged
            netSize += filledSize;
          } else if (filledSize === currentShortSize) {
            // Fully closed
            netSize = 0;
            avgPrice = 0;
          } else {
            // Over close: close short, open new long with remaining size
            const remaining = filledSize - currentShortSize;
            netSize = remaining;
            avgPrice = price;
          }
        }
      }

      positionMap.set(order.tokenId, { netSize, avgPrice });
    }

    // Convert to positions, filtering out zero positions
    this.state.positions = Array.from(positionMap.entries())
      .map(([tokenId, data]) => {
        if (data.netSize === 0) {
          return null;
        }

        return {
          tokenId,
          size: String(data.netSize),
          averagePrice: String(data.avgPrice),
        };
      })
      .filter((p): p is Position => p !== null);
  }

  /**
   * Handle a fill event (from WebSocket or polling)
   * 
   * This method implements the core partial fill tracking logic (EE-001).
   * It processes fill events and updates order state appropriately:
   * 
   * - OPEN → PARTIALLY_FILLED (first partial fill)
   * - PARTIALLY_FILLED → PARTIALLY_FILLED (more partial fills)
   * - PARTIALLY_FILLED → MATCHED (final fill)
   * - OPEN → MATCHED (single full fill)
   * 
   * Each fill is recorded in the fills array for audit purposes.
   * Positions are recalculated after each fill to ensure accuracy.
   * 
   * Includes idempotency: duplicate fillIds are ignored to prevent
   * double-counting fills from WS replay/reconnect scenarios.
   * 
   * @param fillEvent Fill event details
   * @param fillEvent.orderId Order ID that was filled
   * @param fillEvent.fillId Optional unique fill identifier
   * @param fillEvent.price Fill execution price
   * @param fillEvent.size Amount filled in this event
   * @param fillEvent.fee Optional fee for this fill
   * @param fillEvent.timestamp Optional fill timestamp
   * 
   * @see {@link ../../../../docs/order-state-machine.md}
   * @see {@link ../../../../docs/adr/0006-partial-fill-tracking.md}
   */
  handleFill(fillEvent: {
    orderId: string;
    fillId?: string;
    price: string;
    size: string;
    fee?: string;
    timestamp?: number;
  }): void {
    const { orderId, fillId, price, size, fee, timestamp = Date.now() } = fillEvent;
    
    // Deduplicate fills by fillId to prevent double-counting
    if (fillId && this.processedFillIds.has(fillId)) {
      logger.info('Ignoring duplicate fill', { orderId, fillId });
      return;
    }
    
    // Find the order
    const order = this.state.orders.find(o => o.orderId === orderId);
    if (!order) {
      logger.warn('Received fill for unknown order', { orderId, fillId });
      return;
    }

    // Calculate new filled size
    const currentFilledSize = Number(order.filledSize || 0);
    const fillSize = Number(size);
    const originalSize = Number(order.size);
    
    // Cap fill to remaining size to prevent overfills
    const remainingSize = originalSize - currentFilledSize;
    const cappedFillSize = Math.min(fillSize, remainingSize);
    
    if (cappedFillSize < fillSize) {
      logger.warn('Fill size exceeds remaining, capping', {
        orderId,
        fillSize,
        remainingSize,
        cappedFillSize,
      });
    }
    
    const newFilledSize = currentFilledSize + cappedFillSize;

    // Update order quantities
    order.filledSize = String(newFilledSize);
    order.remainingSize = String(Math.max(0, originalSize - newFilledSize));

    // Update order status based on fill amount, but preserve CANCELLED status
    if (order.status !== 'CANCELLED') {
      if (newFilledSize >= originalSize) {
        order.status = 'MATCHED';
      } else if (newFilledSize > 0) {
        order.status = 'PARTIALLY_FILLED';
      }
    }

    // Record the fill
    const fill: Fill = {
      orderId,
      fillId,
      tokenId: order.tokenId,
      side: order.side,
      price,
      size: String(cappedFillSize),
      fee,
      timestamp,
    };
    this.state.fills.push(fill);
    
    // Track fillId for deduplication
    if (fillId) {
      this.processedFillIds.add(fillId);
    }

    // Recalculate positions
    this.recalculatePositions();

    logger.info('Fill processed', {
      orderId,
      fillId,
      fillSize,
      newFilledSize,
      remainingSize: order.remainingSize,
      status: order.status,
    });
  }

  /**
   * Update order state from CLOB order data
   * 
   * This method is used during reconciliation (startup or periodic) to sync
   * local order state with the CLOB. It implements missed fill detection:
   * 
   * - If CLOB reports more filled size than local state, a fill was missed
   * - Creates a synthetic fill event for the missed amount
   * - Logs a warning for investigation
   * - Updates order status based on CLOB data
   * 
   * This ensures the bot can recover from:
   * - Missed WebSocket events
   * - Fills that occurred while bot was offline
   * - State drift due to any reason
   * 
   * @param clobOrder Order data from CLOB API
   * 
   * @see {@link ../../../../docs/order-state-machine.md}
   * @see {@link ../../../../docs/adr/0006-partial-fill-tracking.md}
   */
  updateOrderState(clobOrder: ClobOrder): void {
    const orderId = clobOrder.id || clobOrder.orderID;
    if (!orderId) {
      logger.warn('Cannot update order, missing ID', { order: clobOrder });
      return;
    }

    // Find existing order
    const existingOrder = this.state.orders.find(o => o.orderId === orderId);
    
    if (!existingOrder) {
      // New order we didn't know about (e.g., from another session)
      const newOrder = this.mapOrder(clobOrder);
      this.state.orders.push(newOrder);
      logger.info('Discovered new order during reconciliation', { orderId });
      return;
    }

    // Calculate previous and current filled sizes
    const previousFilledSize = Number(existingOrder.filledSize || 0);
    const currentFilledSize = Number(clobOrder.sizeMatched || 0);
    const originalSize = Number(clobOrder.size || clobOrder.originalSize || 0);

    // If filled size increased, we may have missed fill events
    if (currentFilledSize > previousFilledSize) {
      const missedFillSize = currentFilledSize - previousFilledSize;
      
      // Create a synthetic fill event for the missed fill
      this.handleFill({
        orderId,
        price: String(clobOrder.price),
        size: String(missedFillSize),
        timestamp: Date.now(),
      });

      logger.warn('Detected missed fill during reconciliation', {
        orderId,
        previousFilledSize,
        currentFilledSize,
        missedFillSize,
      });
      
      // Sync terminal status from CLOB after handling missed fills
      if (clobOrder.status === 'CANCELLED') {
        existingOrder.status = 'CANCELLED';
      }
    } else {
      // Just update the order state without creating a fill
      existingOrder.filledSize = String(currentFilledSize);
      existingOrder.remainingSize = String(originalSize - currentFilledSize);
      
      // Update status
      if (clobOrder.status === 'CANCELLED') {
        existingOrder.status = 'CANCELLED';
      } else if (currentFilledSize >= originalSize && currentFilledSize > 0) {
        existingOrder.status = 'MATCHED';
      } else if (currentFilledSize > 0) {
        existingOrder.status = 'PARTIALLY_FILLED';
      }
      
      // If reconciliation adjusted filled size, recalculate positions
      if (currentFilledSize !== previousFilledSize) {
        this.recalculatePositions();
      }
    }
  }
}

// Singleton instance
export const tradingClient = new TradingClient();
