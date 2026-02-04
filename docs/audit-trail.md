# Audit Trail

## Overview

The audit trail provides a persistent record of all trading activity (orders, fills, cancellations) for compliance, analysis, and debugging purposes. It stores data in a SQLite database for easy querying and long-term retention.

## Database Schema

### Orders Table
Stores all orders created by the trading system:
- `id` (TEXT): Primary key, order ID
- `client_order_id` (TEXT): Optional client-provided order ID
- `token_id` (TEXT): Market token ID
- `side` (TEXT): 'BUY' or 'SELL'
- `price` (TEXT): Order price
- `size` (TEXT): Order size
- `filled_size` (TEXT): Amount filled
- `remaining_size` (TEXT): Amount remaining
- `status` (TEXT): Order status (OPEN, PARTIALLY_FILLED, MATCHED, CANCELLED)
- `created_at` (INTEGER): Creation timestamp
- `updated_at` (INTEGER): Last update timestamp

### Fills Table
Stores all trade fills:
- `id` (INTEGER): Auto-incremented primary key
- `order_id` (TEXT): Foreign key to orders table
- `token_id` (TEXT): Market token ID
- `side` (TEXT): 'BUY' or 'SELL'
- `price` (TEXT): Fill price
- `size` (TEXT): Fill size
- `fee` (TEXT): Trading fee
- `timestamp` (INTEGER): Fill timestamp

### Order Events Table
Tracks order lifecycle events:
- `id` (INTEGER): Auto-incremented primary key
- `order_id` (TEXT): Foreign key to orders table
- `event_type` (TEXT): Event type (CREATED, PARTIALLY_FILLED, MATCHED, CANCELLED)
- `timestamp` (INTEGER): Event timestamp
- `details` (TEXT): Optional event details

## Usage

### Basic Setup

```typescript
import { AuditTrail } from './trading/auditTrail';
import { PaperTradingEngine } from './trading/paperTradingEngine';

// Create audit trail (uses default path: ./data/audit.db)
const auditTrail = new AuditTrail();

// Or specify custom database path
const auditTrail = new AuditTrail('/path/to/custom/audit.db');

// Configure paper trading engine with audit trail
const engine = new PaperTradingEngine({
  slippage: 0.01,
  feeRate: 0.002,
  auditTrail, // Enable audit trail
}, 10000);
```

### Querying Data

```typescript
// Get all orders
const allOrders = auditTrail.getOrders();

// Filter orders by token
const tokenOrders = auditTrail.getOrders({ tokenId: '0xtoken123' });

// Filter by status
const openOrders = auditTrail.getOrders({ status: 'OPEN' });

// Filter by time range
const recentOrders = auditTrail.getOrders({ 
  startTime: Date.now() - 86400000, // Last 24 hours
  limit: 100 
});

// Get fills for an order
const orderFills = auditTrail.getFills({ orderId: 'order-123' });

// Get fills for a market
const marketFills = auditTrail.getFills({ tokenId: '0xtoken123' });

// Get order lifecycle events
const events = auditTrail.getOrderEvents('order-123');

// Get trading statistics
const stats = auditTrail.getStatistics({ tokenId: '0xtoken123' });
console.log(`Total orders: ${stats.totalOrders}`);
console.log(`Total fills: ${stats.totalFills}`);
console.log(`Total volume: ${stats.totalVolume}`);
console.log(`Orders by status:`, stats.ordersByStatus);
```

### Manual Recording (Advanced)

If not using the PaperTradingEngine integration, you can manually record events:

```typescript
import { Order, Fill } from '@polymarket/shared';

// Record an order
const order: Order = {
  orderId: 'order-123',
  tokenId: '0xtoken123',
  side: 'BUY',
  price: '0.55',
  size: '10',
  status: 'OPEN',
  createdAt: Date.now(),
  filledSize: '0',
  remainingSize: '10',
};
auditTrail.recordOrder(order);

// Record a fill
const fill: Fill = {
  orderId: 'order-123',
  tokenId: '0xtoken123',
  side: 'BUY',
  price: '0.55',
  size: '10',
  timestamp: Date.now(),
  fee: '0.011',
};
auditTrail.recordFill(fill);

// Record an order event
auditTrail.recordOrderEvent('order-123', 'MATCHED', 'Order fully filled');
```

## Database Location

By default, the audit database is stored at:
```
<project_root>/data/audit.db
```

This directory is automatically created and excluded from git via `.gitignore`.

## Compliance

The audit trail is designed to meet compliance requirements:
- **Immutable records**: Orders and fills are stored permanently
- **Lifecycle tracking**: Full order history from creation to completion/cancellation
- **Time-stamped events**: All events include precise timestamps
- **Queryable**: Supports filtering by market, time range, and status
- **Statistics**: Aggregated metrics for reporting and analysis

## Performance

The audit trail is optimized for write-heavy workloads:
- **Indexes**: Created on frequently queried columns (token_id, status, timestamps)
- **Foreign keys**: Enabled for data integrity
- **SQLite**: Lightweight, serverless, requires no additional infrastructure

## Testing

Comprehensive test coverage includes:
- Unit tests for all audit trail methods
- Integration tests with paper trading engine
- Edge cases (foreign key constraints, concurrent writes, etc.)

Run tests:
```bash
npm test
```

## Limitations

- **Single-threaded**: SQLite is single-threaded. For high-frequency trading with very high order rates, consider PostgreSQL
- **No automatic archival**: Old records are not automatically archived. Implement retention policies as needed
- **Local storage**: Database is stored locally. For multi-instance deployments, use a centralized database

## Future Enhancements

Potential improvements (not in current scope):
- Automatic data retention and archival policies
- Export to CSV/JSON for external analysis
- Integration with monitoring/alerting systems
- Support for PostgreSQL as alternative backend
- Read replicas for analytics queries

## Related

- Gap Analysis: PA-002 (Audit Trail)
- Issue: #129
- Documentation: docs/ARCHITECTURE.md
