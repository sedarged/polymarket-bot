/**
 * User Feed WebSocket Example
 * 
 * This example demonstrates how to use the UserFeedClient to receive
 * real-time updates about your orders and trades on Polymarket.
 * 
 * Features demonstrated:
 * - Connecting to the user WebSocket channel with L1/L2 authentication
 * - Listening to order events (creation, updates, fills, cancellation)
 * - Listening to fill/trade events with detailed execution information
 * - Subscribing to specific markets
 * - Handling reconnection automatically
 * 
 * Requirements:
 * - Valid wallet private key with trading permissions
 * - LIVE_TRADING=true in environment (user channel requires credentials)
 * 
 * Security Notes:
 * - Never commit private keys to source control
 * - Use environment variables for sensitive data
 * - User feed requires same security gates as live trading
 */

import { UserFeedClient } from '../../apps/backend/src/clients/userFeed';
import { ethers } from 'ethers';
import { WSUserOrder, WSUserFill } from '@polymarket/shared';
import dotenv from 'dotenv';

dotenv.config();

async function runUserFeedExample() {
  // Load wallet from environment variable
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable not set');
  }

  // Create wallet
  const wallet = new ethers.Wallet(privateKey);
  console.log(`Using wallet address: ${wallet.address}`);

  // Optional: Specify markets to monitor (leave empty for all markets)
  const marketIds: string[] = [
    // '0x1234...', // Example market/condition ID
  ];

  // Create user feed client
  const userFeed = new UserFeedClient({
    wallet,
    marketIds,
    reconnectDelay: 1000, // Start with 1 second retry delay
    maxReconnectDelay: 30000, // Max 30 seconds between retries
  });

  // Listen to connection events
  userFeed.on('connected', () => {
    console.log('✅ Connected to user feed');
    console.log('Authenticated:', userFeed.isAuthenticatedState());
  });

  userFeed.on('disconnected', () => {
    console.log('❌ Disconnected from user feed');
  });

  userFeed.on('error', (error: Error) => {
    console.error('🚨 User feed error:', error.message);
  });

  // Listen to order events
  userFeed.on('order', (event: WSUserOrder) => {
    console.log('\n📝 Order Event:');
    console.log('  Order ID:', event.order_id);
    console.log('  Client Order ID:', event.client_order_id || 'N/A');
    console.log('  Asset ID:', event.asset_id);
    console.log('  Side:', event.side);
    console.log('  Price:', event.price);
    console.log('  Original Size:', event.original_size);
    console.log('  Size Matched:', event.size_matched);
    console.log('  Status:', event.status);
    console.log('  Created At:', new Date(event.created_at).toISOString());

    // Calculate fill percentage
    const matched = parseFloat(event.size_matched);
    const total = parseFloat(event.original_size);
    const fillPercentage = total > 0 ? ((matched / total) * 100).toFixed(2) : '0';
    console.log('  Fill Progress:', `${fillPercentage}%`);
  });

  // Listen to fill/trade events
  userFeed.on('fill', (event: WSUserFill) => {
    console.log('\n💰 Fill Event:');
    console.log('  Fill ID:', event.fill_id);
    console.log('  Order ID:', event.order_id);
    console.log('  Asset ID:', event.asset_id);
    console.log('  Side:', event.side);
    console.log('  Price:', event.price);
    console.log('  Size:', event.size);
    console.log('  Fee:', event.fee);
    console.log('  Timestamp:', new Date(event.timestamp).toISOString());

    // Calculate trade value and cost
    const price = parseFloat(event.price);
    const size = parseFloat(event.size);
    const fee = parseFloat(event.fee);
    const tradeValue = price * size;
    const totalCost = tradeValue + fee;

    console.log('  Trade Value:', `$${tradeValue.toFixed(4)}`);
    console.log('  Total Cost (with fee):', `$${totalCost.toFixed(4)}`);
    console.log('  Fee Rate:', `${fee > 0 ? ((fee / tradeValue) * 100).toFixed(3) : '0'}%`);
  });

  // Connect to user feed
  console.log('\n🔌 Connecting to Polymarket user WebSocket...');
  await userFeed.connect();

  // Example: Subscribe to additional markets dynamically
  // Uncomment to test subscription management
  /*
  setTimeout(async () => {
    console.log('\n➕ Subscribing to additional markets...');
    await userFeed.subscribe(['0x5678...', '0x9abc...']);
  }, 10000);
  */

  // Example: Unsubscribe from markets
  /*
  setTimeout(async () => {
    console.log('\n➖ Unsubscribing from markets...');
    await userFeed.unsubscribe(['0x1234...']);
  }, 20000);
  */

  // Keep the connection alive
  console.log('\n🎧 Listening for events... (Press Ctrl+C to exit)');

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    userFeed.disconnect();
    process.exit(0);
  });
}

// Run the example
if (require.main === module) {
  runUserFeedExample().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runUserFeedExample };
