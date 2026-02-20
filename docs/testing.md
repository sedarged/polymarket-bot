# Testing Guide

This document describes the testing strategy, infrastructure, and best practices for the Polymarket bot project.

## Overview

The project uses [Vitest](https://vitest.dev/) as the testing framework. Tests are organized under `apps/backend/tests/` in **unit**, **integration**, and **backtest** directories (Research §6.3).

## Test Coverage

### Current Status

- **Total test files:** 89 (67 unit, 21 integration, 1 backtest)
- **Total tests:** 1630+ tests (1617 passed + 13 skipped)
- **Target coverage:** >80% code coverage
- **Test framework:** Vitest 4.0.18
- **Coverage provider:** V8

### Test Categories

#### Unit Tests (`tests/unit/`)
- Individual component testing with mocked dependencies
- No real server, database, or network
- Fast execution

#### Integration Tests (`tests/integration/`)
- Real HTTP server, database, or WebSocket server
- Multi-component interactions (e.g. server + auth, database, market feed reconnect)

#### Backtest Tests (`tests/backtest/`)
- Historical replay and backtest engine
- Event store and metrics computation

#### Shared
- **Setup:** `tests/setup.ts` (runs before each file; e.g. sets `ADMIN_TOKEN`)
- **Fixtures:** `tests/fixtures/` (e.g. `websocket.ts` for mock orderbook helpers)

## Running Tests

Run from `apps/backend/` (or use `npm run --workspace @polymarket/backend <script>` from root).

### All Tests
```bash
npm test
```

### By Directory (CI runs these separately)
```bash
npm run test:unit          # tests/unit/**/*.test.ts
npm run test:integration   # tests/integration/**/*.test.ts
npm run test:backtest      # tests/backtest/**/*.test.ts
```

### Specific Test File
```bash
npm test -- tests/unit/config.test.ts
npm test -- tests/integration/server.test.ts
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### With Coverage Report
```bash
npm run test:coverage
```

Coverage reports are generated in:
- **Text:** Console output
- **HTML:** `apps/backend/coverage/index.html`
- **JSON:** `apps/backend/coverage/coverage-final.json`

## Test File Organization

### Naming Convention
- Test files: `*.test.ts`
- Location: `apps/backend/tests/` with subdirs `unit/`, `integration/`, `backtest/`

### Directory Structure
```
apps/backend/
├── src/
│   ├── clients/
│   ├── server/
│   ├── trading/
│   └── ...
└── tests/
    ├── setup.ts              # Global setup (e.g. ADMIN_TOKEN)
    ├── fixtures/              # Shared test helpers (e.g. websocket.ts)
    ├── unit/                 # Unit tests (mocked deps)
    │   ├── clob.test.ts
    │   ├── gamma.test.ts
    │   ├── config.test.ts
    │   ├── paperTradingEngine.test.ts
    │   └── ...
    ├── integration/          # Integration tests (real server/DB/WS)
    │   ├── server.test.ts
    │   ├── auth.test.ts
    │   ├── database.test.ts
    │   ├── integration-reconnect.test.ts
    │   ├── signalRouting.test.ts  # Signal routing and error handling
    │   └── ...
    └── backtest/             # Backtest engine tests
        └── backtestEngine.test.ts
```

## Critical Components Tested

### Audit Finding A-025 Resolution

The following critical components now have comprehensive test coverage:

#### Database Layer (`src/utils/database.ts`)
- **18 tests** in `tests/integration/database.test.ts` covering:
  - Database initialization and schema creation
  - CRUD operations for orders, fills, positions, balances
  - Foreign key constraints
  - Index creation and usage
  - Read-only mode
  - Error handling

#### Live Trading Gate (`src/utils/liveTrading.ts`)
- **11 tests** covering:
  - Two-factor live trading gate (LIVE_TRADING + COMPLIANCE_ACCEPTED)
  - Fail-safe default behavior
  - Error messages
  - Partial configuration handling

#### CLOB Client (`src/clients/clob.ts`)
- **16 tests** covering:
  - Constructor and initialization
  - Orderbook fetching
  - Retry logic with exponential backoff
  - Circuit breaker integration
  - Rate limit handling (429 errors)
  - Error classification and handling

#### Gamma API Client (`src/clients/gamma.ts`)
- **18 tests** covering:
  - Active markets retrieval
  - Events retrieval
  - Limit parameter handling
  - Retry logic
  - Network error handling
  - Data validation

#### Health Checks (`src/server/health.ts`)
- **28 tests** covering:
  - Liveness checks (memory, uptime)
  - Readiness checks (market feed, trading client)
  - Circuit breaker integration
  - Live trading status reporting
  - Overall status determination

#### Signal Routing and Error Handling (`src/learning/signalCatalog.ts`, `src/trading/strategies/`)
- **14 integration tests** in `tests/integration/signalRouting.test.ts` covering:
  - End-to-end signal flow from catalog to strategies
  - Signal propagation via `updateSignals()` hook
  - Multiple signals routed to same strategy
  - Signal versioning compatibility
  - Missing signal handling
  - Version mismatch handling
  - Duplicate signal registration rejection
  - Catalog unavailability scenarios
  - Strategy signal processing errors
  - Malformed signal data handling
  - Strategies without updateSignals hook
  - Cascading failures (catalog failure during active trading)
  - Partial signal routing failures with multiple strategies
  - Signal query by feature group and metadata operations

**Resolution of GAP-033:** Comprehensive integration test coverage for signal routing and error handling flows.

### Previously Covered Components

- Trading Client (`src/clients/tradingClient.ts`)
- Risk Manager (`src/trading/riskManager.ts`)
- Paper Trading Engine (`src/trading/paperTradingEngine.ts`)
- WebSocket Client (`src/clients/websocket.ts`)
- Order Validation (`src/utils/orderValidation.ts`)
- Rate Limiter (`src/utils/rateLimiter.ts`)
- Circuit Breaker (`src/utils/circuitBreaker.ts`)
- Metrics (`src/utils/metrics.ts`)
- Audit Trail (`src/trading/auditTrail.ts`)
- State Persistence (`src/utils/statePersistence.ts`)

## Testing Best Practices

### 1. Test Structure

Use the AAA pattern (Arrange, Act, Assert):

```typescript
it('should calculate position correctly', () => {
  // Arrange
  const orders = [{ size: '100', price: '0.55' }];
  
  // Act
  const position = calculatePosition(orders);
  
  // Assert
  expect(position).toBe('100');
});
```

### 2. Descriptive Test Names

Use descriptive names that explain what is being tested:

```typescript
// Good
it('should retry on transient network errors')
it('should not retry on 4xx client errors')

// Bad
it('test retry')
it('works')
```

### 3. Test Independence

Each test should be independent and not rely on other tests:

```typescript
describe('Database', () => {
  beforeEach(() => {
    // Reset state before each test
    db = initializeDatabase({ path: testDbPath });
  });

  afterEach(() => {
    // Clean up after each test
    closeDatabase(db);
  });
});
```

### 4. Mock External Dependencies

Use Vitest mocking for external dependencies:

```typescript
import { vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = axios as any;

beforeEach(() => {
  mockedAxios.create = vi.fn(() => ({
    get: vi.fn().mockResolvedValue({ data: mockData }),
  }));
});
```

### 5. Test Edge Cases

Always test edge cases and error scenarios:

```typescript
describe('Order Validation', () => {
  it('should accept valid order');
  it('should reject order with negative size');
  it('should reject order with zero price');
  it('should reject order without token_id');
  it('should handle undefined gracefully');
});
```

### 6. Timeout Configuration

Set appropriate timeouts for long-running tests:

```typescript
it('should handle slow network', async () => {
  // Test code
}, 30000); // 30 second timeout
```

## Common Testing Patterns

### Testing Async Functions

```typescript
it('should fetch data asynchronously', async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});
```

### Testing Errors

```typescript
it('should throw on invalid input', () => {
  expect(() => validateOrder(invalidOrder)).toThrow('Invalid order');
});

it('should reject promise on error', async () => {
  await expect(fetchData()).rejects.toThrow();
});
```

### Testing Retry Logic

```typescript
it('should retry on failure', async () => {
  let callCount = 0;
  const mockFn = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount < 3) {
      throw new Error('Temporary error');
    }
    return 'success';
  });

  const result = await retryOperation(mockFn);
  
  expect(mockFn).toHaveBeenCalledTimes(3);
  expect(result).toBe('success');
});
```

### Testing Event Emitters

```typescript
it('should emit event on state change', (done) => {
  emitter.on('stateChanged', (newState) => {
    expect(newState).toBe('connected');
    done();
  });

  emitter.connect();
});
```

## CI/CD Integration

Tests run automatically on:
- Every push to any branch
- Every pull request
- Before merging to main

### GitHub Actions Workflow

CI runs tests by directory (`.github/workflows/ci.yml`):

```yaml
- name: Run backend unit tests
  run: npm run test:unit
  working-directory: apps/backend
- name: Run backend integration tests
  run: npm run test:integration
  working-directory: apps/backend
- name: Run backend backtest tests
  run: npm run test:backtest
  working-directory: apps/backend
- name: Run test coverage
  run: npm run test:coverage
  working-directory: apps/backend
  continue-on-error: true
```

**Note:** Coverage threshold enforcement is not currently implemented in CI. The coverage report is generated but does not fail the build if coverage falls below 80%. This could be added in the future with a step like:

```yaml
# Future enhancement - not currently implemented
- name: Check coverage threshold
  run: |
    if [ $(jq '.total.lines.pct' coverage/coverage-final.json) -lt 80 ]; then
      echo "Coverage below 80%"
      exit 1
    fi
```

## Troubleshooting

### Test Timeouts

If tests timeout, increase the timeout:

```typescript
// In test file
it('long running test', async () => {
  // test code
}, 30000); // 30 seconds

// Or globally in vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 10000,
  },
});
```

### Flaky Tests

If tests are flaky:
1. Check for race conditions
2. Add appropriate `await` statements
3. Increase timeouts if needed
4. Mock time-dependent code

### Memory Issues

If tests fail due to memory:
1. Clean up resources in `afterEach`
2. Close database connections
3. Clear timers and intervals
4. Dispose of event listeners

### Flaky or Slow Tests

- Integration and persistence tests use real I/O; default `testTimeout` is 15s in `vitest.config.ts`.
- If a test is slow under load, add a per-test timeout: `it('...', { timeout: 15000 }, () => { ... });`

## Coverage Goals

### Overall Target: >80%

- **Statements:** >80%
- **Branches:** >80%
- **Functions:** >80%
- **Lines:** >80%

### Priority Areas (Must be >90%)

- Trading logic
- Risk management
- Order validation
- State persistence
- Circuit breakers
- Kill switch

### Lower Priority (Can be >70%)

- CLI commands
- Logging utilities
- Configuration loading

## Adding New Tests

When adding new features:

1. **Write tests first** (TDD approach recommended for critical components)
2. **Achieve >80% coverage** for the new feature
3. **Test happy path and error cases**
4. **Add integration tests** if the feature interacts with multiple components
5. **Update this document** if new testing patterns are introduced

## Related Documentation

- [Architecture](./architecture.md) - System design and component interactions
- [Runbook](./runbook.md) - Operational procedures and troubleshooting
- [Audit Report](../REPORTS/AUDIT.md) - Security audit findings
- [Small PR Plan](./small-pr-plan.md) - Implementation roadmap (PR-011)

## Audit Finding A-025 Resolution

**Finding:** Insufficient test coverage for critical components

**Resolution:** Added 91 new tests covering:
- Database operations (18 tests)
- Live trading gate (11 tests)
- CLOB client (16 tests)
- Gamma API client (18 tests)
- Health checks (28 tests)

**Impact:** Increased test count from 613 to 704+, adding comprehensive coverage for previously untested critical infrastructure components.

**Status:** ✅ Resolved

---

**Last Updated:** 2026-02-10
**Audit Finding:** A-025 (LOW severity)
**Related PR:** #106
**Note:** Tests reorganized into `tests/unit/`, `tests/integration/`, `tests/backtest/` per Research §6.3; CI runs by directory.
