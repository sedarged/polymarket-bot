# PR #440 Description Corrections

## Issue

The PR #440 description contains incorrect environment variable names that don't match the actual implementation.

## Corrections Needed

In the PR #440 description, update the following variable names:

### Changes Section

**Current (Incorrect):**
```
Updated `.env.example` (new `DATA_PIPELINE_BUFFER_INTERVAL_MS`, `DATA_PIPELINE_ORDERBOOK_DEPTH`)
```

**Should Be:**
```
Updated `.env.example` (new `DATA_PIPELINE_FLUSH_INTERVAL_MS`, `DATA_PIPELINE_ORDERBOOK_LEVELS`)
```

### Documentation Updates Section

**Current (Incorrect):**
```
Updated `.env.example` (new `DATA_PIPELINE_BUFFER_INTERVAL_MS`, `DATA_PIPELINE_ORDERBOOK_DEPTH`)
```

**Should Be:**
```
Updated `.env.example` (new `DATA_PIPELINE_FLUSH_INTERVAL_MS`, `DATA_PIPELINE_ORDERBOOK_LEVELS`)
```

## Actual Variable Names in Code

The correct variable names used throughout the codebase are:

1. **`DATA_PIPELINE_FLUSH_INTERVAL_MS`** (not `DATA_PIPELINE_BUFFER_INTERVAL_MS`)
   - Location: `.env.example` line 248
   - Description: "Flush interval (ms) for writing buffered orderbooks to EventStore"

2. **`DATA_PIPELINE_ORDERBOOK_LEVELS`** (not `DATA_PIPELINE_ORDERBOOK_DEPTH`)
   - Location: `.env.example` line 251
   - Description: "Top N levels stored per side for OrderBookUpdateEvent"

## References

- Original review comment: https://github.com/sedarged/polymarket-bot/pull/440#discussion_r[thread_id]
- Actual implementation: `apps/backend/src/config/index.ts`
- Documentation: `.env.example`, `docs/ENV_VARIABLE_REFERENCE.md`

## Action Required

The owner or maintainer of PR #440 should manually update the PR description with the correct variable names.

**Note:** This PR (sub-PR) addresses the code-level fixes from the review. The PR description fix must be done manually on the original PR #440 since GitHub Copilot agents cannot edit PR descriptions via the API.
