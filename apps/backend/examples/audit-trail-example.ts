#!/usr/bin/env node

/**
 * Example: Using the Audit Trail
 * 
 * This example demonstrates how to use the audit trail to track
 * trading activity and query historical data.
 */

import { PaperTradingEngine } from '../src/trading/paperTradingEngine';
import { AuditTrail } from '../src/trading/auditTrail';
import { Orderbook } from '@polymarket/shared';

// Create audit trail
console.log('Creating audit trail...');
const auditTrail = new AuditTrail('./data/example-audit.db');

// Create paper trading engine with audit trail
console.log('Initializing paper trading engine with audit trail...');
const engine = new PaperTradingEngine({
  slippage: 0.01,
  feeRate: 0.002,
  partialFillRate: 0,
  auditTrail,
}, 10000);

// Create some orders
console.log('\n--- Creating Orders ---');
const order1 = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
console.log(`Created order: ${order1.orderId}`);

const order2 = engine.createOrder('0xtoken123', 'SELL', '0.45', '5');
console.log(`Created order: ${order2.orderId}`);

const order3 = engine.createOrder('0xtoken456', 'BUY', '0.60', '15');
console.log(`Created order: ${order3.orderId}`);

// Simulate orderbook
const orderbook: Orderbook = {
  market: '0xmarket1',
  asset_id: '0xtoken123',
  bids: [{ price: '0.50', size: '100' }],
  asks: [{ price: '0.51', size: '100' }],
  timestamp: Date.now(),
};

// Try to fill first order
console.log('\n--- Filling Orders ---');
const filled1 = engine.tryFillOrder(order1.orderId, orderbook);
console.log(`Order ${order1.orderId} filled: ${filled1}`);

// Cancel third order
console.log('\n--- Cancelling Orders ---');
engine.cancelOrder(order3.orderId);
console.log(`Order ${order3.orderId} cancelled`);

// Query audit trail
console.log('\n--- Querying Audit Trail ---');

// Get all orders
const allOrders = auditTrail.getOrders();
console.log(`Total orders: ${allOrders.length}`);

// Get orders by status
const openOrders = auditTrail.getOrders({ status: 'OPEN' });
console.log(`Open orders: ${openOrders.length}`);

const matchedOrders = auditTrail.getOrders({ status: 'MATCHED' });
console.log(`Matched orders: ${matchedOrders.length}`);

const cancelledOrders = auditTrail.getOrders({ status: 'CANCELLED' });
console.log(`Cancelled orders: ${cancelledOrders.length}`);

// Get fills
const fills = auditTrail.getFills();
console.log(`Total fills: ${fills.length}`);

// Get order lifecycle events
console.log(`\n--- Order Lifecycle for ${order1.orderId} ---`);
const events = auditTrail.getOrderEvents(order1.orderId);
events.forEach(event => {
  console.log(`[${new Date(event.timestamp).toISOString()}] ${event.eventType}: ${event.details || 'N/A'}`);
});

// Get statistics
console.log('\n--- Trading Statistics ---');
const stats = auditTrail.getStatistics();
console.log(`Total orders: ${stats.totalOrders}`);
console.log(`Total fills: ${stats.totalFills}`);
console.log(`Total volume: ${stats.totalVolume}`);
console.log('Orders by status:', stats.ordersByStatus);

// Get statistics for specific token
const tokenStats = auditTrail.getStatistics({ tokenId: '0xtoken123' });
console.log(`\nStatistics for token 0xtoken123:`);
console.log(`Total orders: ${tokenStats.totalOrders}`);
console.log(`Total fills: ${tokenStats.totalFills}`);

// Clean up
console.log('\nClosing audit trail...');
auditTrail.close();
console.log('Done!');
