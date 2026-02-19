# Manual Verification Guide - Strategy Hot-Reload

This guide walks through manual testing of the strategy hot-reload feature.

## Prerequisites

```bash
cd apps/backend
npm install
```

## Test 1: Run Demo Script

**Objective**: Verify the interactive demo works

```bash
npm run example:hotreload
```

**Expected Output**:
- ✅ "Loading strategies..."
- ✅ "Loaded 3 strategies"
- ✅ List of strategies displayed
- ✅ "File watching active..."
- ✅ Command prompt

**Interactive Commands**:
- Press `r` - Should reload arbitrage-1
- Press `l` - Should list all strategies
- Press `s` - Should show strategy details
- Press `q` - Should exit cleanly

**Screenshot Required**: Terminal showing demo running

## Test 2: Unit Tests

**Objective**: Verify all unit tests pass

```bash
npm test -- strategyManager.test.ts
```

**Expected Output**:
- ✅ 31 tests passed
- ❌ 0 tests failed

**Screenshot Required**: Test results

## Test 3: Integration Tests

**Objective**: Verify integration tests pass

```bash
npm test -- strategyManagerIntegration.test.ts
```

**Expected Output**:
- ✅ 10 tests passed
- ❌ 0 tests failed

**Screenshot Required**: Test results

## Test 4: API Endpoints (Optional - requires server)

**Objective**: Verify REST API endpoints work

### Start Server
```bash
npm run dev
```

### Test Endpoints

**List Strategies** (GET /api/strategies):
```bash
curl http://localhost:3000/api/strategies
```

Expected: JSON with empty array (no strategies loaded yet)

**Get Watching Status** (GET /api/strategies/watching):
```bash
curl http://localhost:3000/api/strategies/watching
```

Expected: `{"success": true, "watching": false}`

**Screenshot Required**: API response (at least one endpoint)

## Test 5: File Watching (Integration Test)

**Already covered by integration tests**, but can be manually verified:

1. Create test directory: `mkdir -p tmp/test-watch`
2. Run demo with custom directory
3. Edit a .ts file in the directory
4. Verify file change event is emitted

**Screenshot Required**: File change detection (if tested manually)

## Test 6: Build Verification

**Objective**: Ensure TypeScript compiles without errors

```bash
npm run build
```

**Expected Output**:
- ✅ No TypeScript errors
- ✅ Compilation successful

**Screenshot Required**: Build output

## Verification Checklist

Copy this to PR description:

```markdown
## Manual Testing Completed

- [ ] Demo script runs successfully
  - [ ] Strategies load correctly
  - [ ] File watching starts
  - [ ] Interactive commands work (r, l, s, q)
  - Screenshot: [link]

- [ ] All unit tests pass (31/31)
  - Screenshot: [link]

- [ ] All integration tests pass (10/10)
  - Screenshot: [link]

- [ ] Build completes without errors
  - Screenshot: [link]

- [ ] API endpoints tested (optional)
  - [ ] GET /api/strategies
  - [ ] GET /api/strategies/watching
  - Screenshot: [link]

- [ ] Documentation reviewed
  - [ ] README updated
  - [ ] STRATEGY_HOT_RELOAD.md complete
  - [ ] Examples clear and runnable

- [ ] Code quality
  - [ ] Code review passed
  - [ ] CodeQL security scan passed (0 alerts)
  - [ ] No hardcoded secrets
```

## Expected Test Execution Time

- Demo: 30 seconds to 2 minutes (depending on interaction)
- Unit tests: ~10 seconds
- Integration tests: ~3 seconds
- Build: ~15 seconds
- API tests (optional): ~1 minute

**Total**: ~5 minutes

## Common Issues & Solutions

### Demo doesn't start
**Solution**: Ensure dependencies installed: `npm install`

### Tests fail with "vitest not found"
**Solution**: Install from root: `cd ../.. && npm install`

### API endpoints return 404
**Solution**: Endpoints not integrated into server yet (OK for this PR)

### File watching doesn't detect changes
**Solution**: This is expected - dynamic module reloading not implemented (documented limitation)

## Success Criteria

✅ All automated tests pass
✅ Demo runs without errors
✅ Build completes successfully
✅ Documentation is clear and accurate
✅ No security vulnerabilities detected

## Notes

- One pre-existing flaky test in executionService (timing-related, not related to this PR)
- API endpoints created but not yet integrated into main server (separate task)
- Dynamic code hot-reload is a known limitation (documented)
