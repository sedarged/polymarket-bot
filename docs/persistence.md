# Persistence Layer

**Status**: ✅ Implemented (Gap PA-001)  
**Version**: 1.0  
**Last Updated**: 2026-02-04

## Overview

The persistence layer provides database-backed storage for all trading state, ensuring data survives process restarts and enabling audit trails for compliance. This addresses **Gap PA-001** from the production gap analysis.

## Architecture

### Database Technology

- **SQLite** for development and MVP deployment
- **Schema design** supports future migration to PostgreSQL
- **better-sqlite3** library for synchronous operations

### Storage Location

```
polymarket-bot/
└── data/
    └── audit.db       # SQLite database file
```

## Data Model

### Tables

#### Orders Table
Stores all order state including lifecycle tracking.

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,                 -- Order ID
  client_order_id TEXT,                 -- Client-side order ID
  token_id TEXT NOT NULL,               -- Asset/token ID
  side TEXT NOT NULL,                   -- BUY or SELL
  price TEXT NOT NULL,                  -- Order price (stored as string)
  size TEXT NOT NULL,                   -- Order size (stored as string)
  filled_size TEXT DEFAULT '0',        -- Filled amount
  remaining_size TEXT,                  -- Remaining to fill
  status TEXT NOT NULL,                 -- Order status
  created_at INTEGER NOT NULL,          -- Creation timestamp
  updated_at INTEGER                    -- Last update timestamp
);

-- Indexes for fast queries
CREATE INDEX idx_orders_token_id ON orders(token_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

#### Fills Table
Records all fill events for audit trail.

```sql
CREATE TABLE fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,               -- Reference to order
  token_id TEXT NOT NULL,               -- Asset/token ID
  side TEXT NOT NULL,                   -- BUY or SELL
  price TEXT NOT NULL,                  -- Fill price
  size TEXT NOT NULL,                   -- Fill size
  fee TEXT,                              -- Transaction fee
  timestamp INTEGER NOT NULL,           -- Fill timestamp
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Indexes for fast queries
CREATE INDEX idx_fills_order_id ON fills(order_id);
CREATE INDEX idx_fills_token_id ON fills(token_id);
CREATE INDEX idx_fills_timestamp ON fills(timestamp);
```

#### Positions Table
Tracks current positions per token.

```sql
CREATE TABLE positions (
  token_id TEXT PRIMARY KEY,            -- Asset/token ID
  size TEXT NOT NULL,                   -- Position size (+ long, - short)
  average_price TEXT NOT NULL,          -- Cost basis
  updated_at INTEGER NOT NULL           -- Last update timestamp
);
```

#### Balances Table
Stores account balance and P&L state.

```sql
CREATE TABLE balances (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- Single row constraint
  balance TEXT NOT NULL,                   -- Current balance
  initial_balance TEXT NOT NULL,           -- Starting balance
  realized_pnl TEXT NOT NULL,              -- Realized profit/loss
  updated_at INTEGER NOT NULL              -- Last update timestamp
);
```

#### Order Events Table
Captures order lifecycle events for debugging.

```sql
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,               -- Reference to order
  event_type TEXT NOT NULL,             -- Event type (CREATED, FILLED, etc.)
  timestamp INTEGER NOT NULL,           -- Event timestamp
  details TEXT,                          -- Additional details
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Index for event history queries
CREATE INDEX idx_order_events_order_id ON order_events(order_id);
```

## Usage

### Basic Usage with Paper Trading Engine

```typescript
import { PersistenceService } from './trading/persistenceService';
import { PaperTradingEngine } from './trading/paperTradingEngine';

// Create persistence service
const persistence = new PersistenceService('./data/audit.db');

// Create engine with persistence
const engine = new PaperTradingEngine(
  {
    slippage: 0.01,
    feeRate: 0.002,
    persistenceService: persistence,
  },
  10000 // Initial balance (ignored if state exists)
);

// State is automatically restored on startup
console.log('Current balance:', engine.getBalance());
console.log('Existing orders:', engine.getOrders().length);

// All operations are automatically persisted
const order = engine.createOrder('0xtoken123', 'BUY', '0.55', '10');
engine.tryFillOrder(order.orderId, orderbook);

// State survives restart
// On next startup, all data is automatically restored
```

### Direct Access to Persistence Service

```typescript
// Query historical data
const orders = persistence.getOrders({
  tokenId: '0xtoken123',
  status: 'MATCHED',
  startTime: Date.now() - 86400000, // Last 24 hours
  limit: 100,
});

const fills = persistence.getFills({
  tokenId: '0xtoken123',
  startTime: Date.now() - 86400000,
});

const positions = persistence.getPositions();
const balance = persistence.getBalance();
```

### State Management

#### State Restoration
The engine automatically restores state on startup:

```typescript
// First run - fresh state
const engine1 = new PaperTradingEngine({ persistenceService }, 10000);
// Creates order, fills it
const order1 = engine1.createOrder('0xtoken123', 'BUY', '0.55', '10');
engine1.tryFillOrder(order1.orderId, orderbook);

// Restart - state restored
const engine2 = new PaperTradingEngine({ persistenceService }, 10000);
// Balance and orders are restored from database
console.log(engine2.getOrders().length); // 1
console.log(engine2.getBalance()); // Updated from first run
```

#### State Reset
For testing or resetting the bot:

```typescript
engine.reset(10000); // Clears all state and reinitializes
```

## State Lifecycle

### Order Creation
1. Order is added to in-memory state
2. Order is immediately persisted to database
3. Order event is recorded

### Order Fill
1. Fill is added to in-memory state
2. Fill is persisted to database
3. Order status is updated in database
4. Position is calculated and persisted
5. Balance is updated and persisted
6. Fill event is recorded

### Order Cancellation
1. Order status is updated in memory
2. Order status is updated in database
3. Cancellation event is recorded

### Restart Recovery
1. Database connection is established
2. Balance state is loaded
3. All orders are loaded and restored
4. All fills are loaded and restored
5. All positions are loaded and restored
6. Engine state is fully reconstructed

## Performance Considerations

### Write Operations
- All write operations are **synchronous** (using better-sqlite3)
- Average write latency: **<1ms** for most operations
- No write amplification - single writes per operation

### Read Operations
- Queries use indexes for fast lookups
- Common patterns:
  - Get orders by token: **O(log n)** with index
  - Get fills by order: **O(log n)** with index
  - Get all positions: **O(n)** full scan (small dataset)

### Database Size
- **Orders**: ~200 bytes per order
- **Fills**: ~150 bytes per fill
- **Positions**: ~100 bytes per position
- **Example**: 10,000 orders with 10,000 fills ≈ 3.5 MB

## Error Handling

### Database Errors
All database operations include error handling:

```typescript
try {
  persistenceService.saveOrder(order);
} catch (error) {
  logger.error('Failed to persist order', { error });
  // Error is logged but doesn't break trading flow
  // Orders remain in memory even if persistence fails
}
```

### Recovery Scenarios

#### Corrupted Database
If the database is corrupted:
1. Rename the corrupted file
2. Start with a fresh database
3. Trading continues with empty state

#### Disk Full
If disk is full:
1. Writes fail with disk full error
2. In-memory state continues to work
3. Free up space and restart to resume persistence

## Testing

### Unit Tests
The persistence layer includes comprehensive tests:

```bash
npm test -- persistence.test.ts
```

Test coverage includes:
- ✅ Order persistence and retrieval
- ✅ Fill persistence and retrieval
- ✅ Position tracking
- ✅ Balance state
- ✅ State restoration across restarts
- ✅ Data integrity across multiple restart cycles
- ✅ Backward compatibility without persistence

### Integration Testing
Test state persistence across restarts:

```typescript
describe('Data Survives Restarts', () => {
  it('should maintain complete trading state across multiple restarts', () => {
    // Session 1: Trade
    const engine1 = new PaperTradingEngine({ persistenceService }, 10000);
    engine1.createOrder('0xtoken123', 'BUY', '0.55', '10');
    
    // Session 2: Resume and trade more
    const engine2 = new PaperTradingEngine({ persistenceService }, 10000);
    expect(engine2.getOrders()).toHaveLength(1); // Restored!
    
    // Session 3: Verify accumulated state
    const engine3 = new PaperTradingEngine({ persistenceService }, 10000);
    expect(engine3.getBalance()).toBe(expectedBalance);
  });
});
```

## Migration Guide

### From In-Memory to Persistence

If upgrading from in-memory state:

```typescript
// Before (in-memory only)
const engine = new PaperTradingEngine({ slippage: 0.01 }, 10000);

// After (with persistence)
const persistence = new PersistenceService();
const engine = new PaperTradingEngine(
  { slippage: 0.01, persistenceService: persistence },
  10000
);

// That's it! State is now persisted automatically
```

### Backward Compatibility
The persistence layer is **fully backward compatible**:
- Omit `persistenceService` to use in-memory mode
- No breaking changes to existing code
- Tests work with or without persistence

## Backup and Recovery

### Manual Backup
```bash
# Backup database
cp data/audit.db data/audit.db.backup

# Restore from backup
cp data/audit.db.backup data/audit.db
```

### Automated Backup
Consider implementing periodic backups:

```bash
# Daily backup with rotation
0 0 * * * cp data/audit.db data/backups/audit-$(date +\%Y\%m\%d).db
```

## Future Enhancements

### Planned Improvements
- [ ] PostgreSQL support for production
- [ ] Read replicas for analytics
- [ ] Periodic state snapshots
- [ ] Data retention policies
- [ ] Write-ahead logging (WAL) mode
- [ ] Connection pooling for PostgreSQL

### Migration Path to PostgreSQL

The schema is designed for easy migration:

```sql
-- PostgreSQL equivalents
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  -- ... same columns ...
  created_at TIMESTAMP NOT NULL,  -- Use TIMESTAMP instead of INTEGER
  updated_at TIMESTAMP
);
```

Key changes needed:
1. Replace INTEGER timestamps with TIMESTAMP
2. Use connection pooling
3. Make operations async
4. Add retry logic for transient failures

## Compliance Benefits

### Audit Trail
The persistence layer provides:
- **Complete order history** - Every order tracked
- **Fill records** - All trades with timestamps
- **Lifecycle events** - Order state changes
- **Balance history** - Account state over time

### Regulatory Requirements
Supports:
- Trade reconstruction
- Position verification
- Risk analysis
- Performance attribution
- Compliance reporting

## Troubleshooting

### Common Issues

#### "Database locked" Error
**Cause**: Multiple processes accessing the same database  
**Solution**: Use only one process per database file

#### "FOREIGN KEY constraint failed"
**Cause**: Attempting to insert fill without corresponding order  
**Solution**: Always create orders before fills

#### Slow Queries
**Cause**: Missing indexes or large dataset  
**Solution**: Check query patterns and add indexes if needed

### Debug Mode

Enable detailed logging:

```typescript
// Set log level to debug
process.env.LOG_LEVEL = 'debug';
```

## See Also

- [Audit Trail Documentation](./audit-trail.md) - Order history tracking
- [Paper Trading Guide](./paper-trading.md) - Testing without real money
- [Observability](./observability.md) - Metrics and monitoring
- [Architecture](./architecture.md) - System design overview

## References

- Gap Analysis: PA-001 (No persistence layer)
- Issue: #103
- Implementation: PR #[number]
- Tests: `tests/persistence.test.ts`
