# Testing Guide

This document describes the testing strategy, infrastructure, and best practices for the Polymarket bot project.

## Overview

The project uses [Vitest](https://vitest.dev/) as the testing framework. All tests are located in the `apps/backend/tests/` directory.

## Test Coverage

### Current Status

- **Total test files:** 41 test files
- **Total tests:** 712+ tests (704 passing + 8 pre-existing failures)
- **Target coverage:** >80% code coverage
- **Test framework:** Vitest 4.0.18
- **Coverage provider:** V8

### Test Categories

#### Unit Tests
- Individual component testing
- Mock external dependencies
- Fast execution (<100ms per test)

#### Integration Tests
- Multiple component interactions
- Real dependencies where appropriate
- WebSocket reconnection scenarios
- Database operations

#### Error Scenario Tests
- Network failures
- Timeout handling
- Circuit breaker behavior
- Rate limiting
- Invalid inputs

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test File
```bash
npm test -- database.test.ts
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
- Location: `apps/backend/tests/`
- Mirror source structure when possible

### Example Structure
```
apps/backend/
├── src/
│   ├── clients/
│   │   ├── clob.ts
│   │   └── gamma.ts
│   └── utils/
│       ├── database.ts
│       └── liveTrading.ts
└── tests/
    ├── clob.test.ts         # Tests for src/clients/clob.ts
    ├── gamma.test.ts        # Tests for src/clients/gamma.ts
    ├── database.test.ts     # Tests for src/utils/database.ts
    └── liveTrading.test.ts  # Tests for src/utils/liveTrading.ts
```

## Critical Components Tested

### Audit Finding A-025 Resolution

The following critical components now have comprehensive test coverage:

#### Database Layer (`src/utils/database.ts`)
- **18 tests** covering:
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

```yaml
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

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

### Pre-existing Test Failures

As of the test coverage expansion (A-025):
- 8 pre-existing test failures in `auth.test.ts` and `websocket.test.ts`
- These are unrelated to the new test coverage
- They are tracked separately and will be fixed in future PRs

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

**Last Updated:** 2026-02-05
**Audit Finding:** A-025 (LOW severity)
**Related PR:** #106
