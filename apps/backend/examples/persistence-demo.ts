#!/usr/bin/env node
/**
 * Example: Persistence Layer Demo
 * 
 * This example demonstrates how the persistence layer works:
 * 1. Creates a paper trading engine with persistence
 * 2. Makes some trades
 * 3. Shows how state survives "restarts"
 */

import { PersistenceService } from '../src/trading/persistenceService';
import { PaperTradingEngine } from '../src/trading/paperTradingEngine';
import { Orderbook } from '@polymarket/shared';

// Sample orderbook for testing
const mockOrderbook: Orderbook = {
  market: 'test-market',
  asset_id: '0xtoken123',
  bids: [
    { price: '0.50', size: '100' },
    { price: '0.49', size: '50' },
  ],
  asks: [
    { price: '0.51', size: '100' },
    { price: '0.52', size: '50' },
  ],
  timestamp: Date.now(),
};

async function demo() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Persistence Layer Demo - Gap PA-001');
  console.log('═══════════════════════════════════════════════════════\n');

  // Use a demo database
  const dbPath = './data/demo.db';
  const persistence = new PersistenceService(dbPath);

  try {
    console.log('Step 1: Create engine with persistence');
    console.log('───────────────────────────────────────────────────────');
    
    const engine1 = new PaperTradingEngine(
      {
        slippage: 0.01,
        feeRate: 0.002,
        persistenceService: persistence,
      },
      10000
    );

    console.log(`Initial balance: ${engine1.getBalance()}`);
    console.log(`Existing orders: ${engine1.getOrders().length}`);
    console.log(`Existing positions: ${engine1.getPositions().length}\n`);

    console.log('Step 2: Create and fill some orders');
    console.log('───────────────────────────────────────────────────────');
    
    // Create and fill a buy order
    const order1 = engine1.createOrder('0xtoken123', 'BUY', '0.55', '10');
    console.log(`✓ Created buy order: ${order1.orderId}`);
    
    const filled1 = engine1.tryFillOrder(order1.orderId, mockOrderbook);
    console.log(`✓ Order filled: ${filled1}`);
    console.log(`  Balance after: ${engine1.getBalance()}`);
    console.log(`  Position size: ${engine1.getPositions()[0]?.size || '0'}\n`);

    // Create another order (unfilled)
    const order2 = engine1.createOrder('0xtoken123', 'BUY', '0.56', '5');
    console.log(`✓ Created another buy order: ${order2.orderId}`);
    console.log(`  Status: ${order2.status}\n`);

    console.log('Step 3: Simulate restart by creating new engine');
    console.log('───────────────────────────────────────────────────────');
    
    // Create a new engine instance (simulating restart)
    const engine2 = new PaperTradingEngine(
      {
        slippage: 0.01,
        feeRate: 0.002,
        persistenceService: persistence,
      },
      10000 // This initial balance is ignored since state exists
    );

    console.log('✓ State restored from database!');
    console.log(`  Balance: ${engine2.getBalance()}`);
    console.log(`  Orders: ${engine2.getOrders().length}`);
    console.log(`  Fills: ${engine2.getFills().length}`);
    console.log(`  Positions: ${engine2.getPositions().length}\n`);

    console.log('Step 4: Verify restored orders');
    console.log('───────────────────────────────────────────────────────');
    
    const orders = engine2.getOrders();
    orders.forEach((order, index) => {
      console.log(`Order ${index + 1}:`);
      console.log(`  ID: ${order.orderId}`);
      console.log(`  Side: ${order.side}`);
      console.log(`  Price: ${order.price}`);
      console.log(`  Size: ${order.size}`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Filled: ${order.filledSize}`);
      console.log();
    });

    console.log('Step 5: Continue trading after restart');
    console.log('───────────────────────────────────────────────────────');
    
    // Fill the second order
    const filled2 = engine2.tryFillOrder(order2.orderId, mockOrderbook);
    console.log(`✓ Filled pending order: ${filled2}`);
    console.log(`  Balance now: ${engine2.getBalance()}`);
    console.log(`  Total fills: ${engine2.getFills().length}\n`);

    console.log('Step 6: Query historical data');
    console.log('───────────────────────────────────────────────────────');
    
    const allOrders = persistence.getOrders();
    const allFills = persistence.getFills();
    const allPositions = persistence.getPositions();
    const balance = persistence.getBalance();

    console.log('Direct database query results:');
    console.log(`  Total orders: ${allOrders.length}`);
    console.log(`  Total fills: ${allFills.length}`);
    console.log(`  Total positions: ${allPositions.length}`);
    console.log(`  Current balance: ${balance?.balance}`);
    console.log(`  Initial balance: ${balance?.initialBalance}`);
    console.log(`  Realized P&L: ${balance?.realizedPnl}\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('  Demo Complete!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nKey Takeaways:');
    console.log('✓ All trading state is persisted to SQLite database');
    console.log('✓ State automatically restores on restart');
    console.log('✓ Orders, fills, positions, and balances survive restarts');
    console.log('✓ Historical data can be queried directly');
    console.log('✓ No data loss on process restart\n');

  } finally {
    // Clean up
    persistence.close();
    console.log('Database connection closed.\n');
    console.log(`Demo database location: ${dbPath}`);
    console.log(`You can inspect it with: sqlite3 ${dbPath}\n`);
  }
}

// Run the demo
demo().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
