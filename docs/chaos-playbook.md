# Chaos Engineering Playbook

This playbook provides procedures for running chaos tests, interpreting results, and responding to failures discovered during chaos testing.

## Table of Contents

1. [Running Chaos Tests](#running-chaos-tests)
2. [Interpreting Results](#interpreting-results)
3. [Responding to Failures](#responding-to-failures)
4. [Documenting Weaknesses](#documenting-weaknesses)
5. [Continuous Improvement](#continuous-improvement)

## Running Chaos Tests

### Local Development

```bash
# Run all chaos tests
npm run test:chaos

# Run specific category
npm run test:chaos -- websocket
npm run test:chaos -- api
npm run test:chaos -- database
npm run test:chaos -- process

# Run with verbose output
npm run test:chaos -- --reporter=verbose

# Run single test file
npm run test:chaos -- websocket/disconnects.test.ts

# Run specific test
npm run test:chaos -- -t "should automatically reconnect"
```

### CI/CD Integration

Chaos tests run automatically in CI on every PR:

```yaml
- name: Run chaos tests
  run: npm run test:chaos
  working-directory: apps/backend
  continue-on-error: true  # Initially non-blocking
```

**Note**: Chaos tests currently use `continue-on-error: true` to allow gathering baseline data without blocking PRs. Once stable, this should be removed.

## Interpreting Results

### Test Categories

#### 1. WebSocket Failures (websocket/)

**Purpose**: Validate WebSocket reconnection and state management

**Expected Behaviors**:
- Automatic reconnection after disconnect
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
- Orderbook cache maintained during reconnection
- State consistency after reconnect
- Heartbeat timeout detection (30s interval, 5s timeout)

**Common Failures**:
- Connection not reconnecting → Check reconnection logic
- State lost after reconnect → Verify cache persistence
- Infinite reconnection attempts → Check max attempts limit
- Memory leak on repeated reconnects → Verify cleanup

#### 2. API Failures (api/)

**Purpose**: Validate API retry logic and circuit breaker

**Expected Behaviors**:
- Retry on 5xx errors with exponential backoff
- No retry on 4xx errors (client errors)
- Circuit breaker opens after 3 consecutive failures
- Circuit breaker transitions to half-open after timeout
- Rate limit (429) respected with backoff
- Malformed responses handled gracefully

**Common Failures**:
- No retry on 5xx → Check retry logic
- Circuit breaker not opening → Verify failure threshold
- Rate limits ignored → Add rate limit handling
- Timeout not detected → Verify timeout configuration

#### 3. Database/State Failures (database/)

**Purpose**: Validate persistence and state reconciliation

**Expected Behaviors**:
- Orders persist across restarts
- State recovered from database on startup
- Discrepancies detected (missing orders, status mismatch)
- Recovery actions executed (sync, cancel orphans)
- Audit trail maintained during failures
- Backups created and restored successfully

**Common Failures**:
- Data loss after restart → Check persistence logic
- Discrepancies not detected → Verify reconciliation
- Recovery not triggered → Check auto-recover setting
- Audit gaps → Verify transaction handling

#### 4. Process/System Failures (process/)

**Purpose**: Validate graceful shutdown and resource cleanup

**Expected Behaviors**:
- All connections closed on shutdown
- Pending orders cancelled before exit
- State persisted before shutdown
- Kill switch halts all trading immediately
- Orders reconciled on startup
- Missed fills detected during downtime

**Common Failures**:
- Resources not cleaned up → Add cleanup handlers
- Orders not cancelled → Implement cancel-all on shutdown
- Memory leaks → Track and clear timers/listeners
- Orphaned processes → Implement proper kill signals

## Responding to Failures

### Step 1: Identify the Failure

When a chaos test fails:

1. **Read the error message** carefully
2. **Check the test category** (websocket, api, database, process)
3. **Identify the expected behavior** from test name
4. **Review the actual behavior** from error output

### Step 2: Reproduce Locally

```bash
# Run the specific failing test
npm run test:chaos -- -t "test name here"

# Run with debug logging
LOG_LEVEL=debug npm run test:chaos -- -t "test name"

# Add console.log in the test for debugging
# Check system state at time of failure
```

### Step 3: Investigate Root Cause

**For WebSocket failures**:
- Check reconnection logic in `src/clients/websocket.ts`
- Verify event handlers are properly attached
- Review state management in reconnection path
- Check timer cleanup in close() method

**For API failures**:
- Review retry logic in API clients
- Check circuit breaker configuration
- Verify timeout settings
- Review error handling in catch blocks

**For Database failures**:
- Check database connection handling
- Verify transaction handling
- Review state reconciliation logic
- Check backup/restore procedures

**For Process failures**:
- Review shutdown handlers
- Check resource cleanup
- Verify signal handlers (SIGTERM, SIGINT)
- Review startup reconciliation

### Step 4: Fix or Document

**If the test is correct and code is buggy**:
1. Fix the underlying issue
2. Add comments explaining the fix
3. Reference the audit finding if applicable
4. Add regression test if needed

**If the test is flaky or incorrect**:
1. Update test expectations
2. Adjust timeouts or delays
3. Add comments explaining the change
4. Document the observed behavior

**If behavior is acceptable but test expectations are wrong**:
1. Update test to match actual behavior
2. Document why the behavior is acceptable
3. Add comments in the test

## Documenting Weaknesses

When chaos tests reveal weaknesses:

### 1. Create an Issue

```markdown
Title: [Chaos] WebSocket doesn't recover from network partition

**Severity**: High
**Category**: WebSocket
**Test**: chaos/websocket/heartbeat.test.ts

**Issue**:
WebSocket client fails to detect network partition and doesn't
reconnect after network recovery.

**Expected**:
Heartbeat should timeout after 35s, trigger reconnection

**Actual**:
Connection stays in "connected" state indefinitely even though
network is partitioned

**Impact**:
Stale market data, incorrect trading decisions

**Evidence**:
- Test: "should detect and recover from network partition"
- Error: "expected false to be true"
- Logs: No heartbeat timeout logged

**Fix**:
Implement proper heartbeat timeout detection in websocket.ts
```

### 2. Update Documentation

Add findings to relevant docs:
- `docs/troubleshooting.md` - Known issues
- `docs/ai/common-pitfalls.md` - Add to pitfalls
- `docs/ai/decision-trees.md` - Add recovery steps
- `REPORTS/AUDIT.md` - If security-related

### 3. Track in Status

Add to `STATUS.md` or create GitHub issue with:
- Priority label (P0, P1, P2)
- Component label (websocket, api, database)
- Chaos label for tracking

## Continuous Improvement

### Evolving Chaos Tests

As the system evolves, chaos tests should too:

**Add new scenarios**:
- New failure modes discovered in production
- Edge cases identified during investigation
- Scenarios from postmortems

**Update expectations**:
- System behavior changes (intentional)
- Performance improvements
- New features that affect recovery

**Remove obsolete tests**:
- Deprecated features
- Replaced implementations
- Fixed bugs with regression tests

### Measuring Resilience

Track these metrics over time:

**Recovery Time**:
- How long does reconnection take?
- How long does reconciliation take?
- How long does startup take?

**Success Rate**:
- What % of chaos tests pass?
- Trend: improving or degrading?
- Categories: which are strongest/weakest?

**Incident Reduction**:
- Has chaos testing prevented incidents?
- Are production issues decreasing?
- Are recovery procedures effective?

### Chaos Testing Schedule

**Development**:
- Run chaos tests before each commit
- Fix failures before PR
- Review results in code review

**CI/CD**:
- Run on every PR (continue-on-error: true initially)
- Track pass rate over time
- Alert on significant regressions

**Production**:
- Run chaos tests against staging environment
- Validate production recovery procedures
- Use chaos engineering tools (Chaos Monkey, Gremlin)

## Example: Responding to WebSocket Failure

**Scenario**: Test "should automatically reconnect after sudden disconnect" is failing

### 1. Identify

```
FAIL  tests/chaos/websocket/disconnects.test.ts
✕ should automatically reconnect after sudden disconnect
  expected connectCount 1 to be greater than or equal to 2
```

**Interpretation**: WebSocket is not reconnecting after disconnect

### 2. Reproduce

```bash
npm run test:chaos -- -t "should automatically reconnect"
```

### 3. Investigate

- Check: Is reconnection scheduled? → Log shows "Scheduling reconnect"
- Check: Is timer firing? → Use real timers instead of fake timers
- Check: Is reconnection attempted? → Connection attempt logged
- Check: Why is it failing? → Server already closed

**Root Cause**: Test server is closed before reconnection attempt

### 4. Fix

Option A: Fix test (keep server open longer)
Option B: Fix code (handle closed server gracefully)
Option C: Accept behavior (document limitation)

Chose Option A: Updated test to wait for reconnection before closing server

### 5. Document

- Added comment explaining test timing
- Updated README with timing considerations
- No issue needed (test issue, not code issue)

## References

- [Chaos Test README](../apps/backend/tests/chaos/README.md)
- [Testing Guide](./testing.md)
- [Decision Trees](./ai/decision-trees.md)
- [Common Pitfalls](./ai/common-pitfalls.md)
- [Troubleshooting](./troubleshooting.md)
