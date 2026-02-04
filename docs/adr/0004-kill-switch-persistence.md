# ADR-0004: Kill Switch State Persistence

**Status:** Accepted  
**Date:** 2026-02-04  
**Relates to:** Audit Finding A-002 (CRITICAL)

## Context

The kill switch is a critical safety feature that prevents the bot from placing new orders in emergency situations. Previously, the kill switch state was stored only in memory, which meant:

1. **Risk of Auto-Resume:** If the process crashed or restarted, the kill switch would be reset, potentially resuming trading in unsafe conditions
2. **Compliance Risk:** For a production trading bot, persistent safety controls are essential for regulatory compliance
3. **Audit Finding A-002:** This was identified as a CRITICAL security issue in the audit

## Decision

We will persist the kill switch state to disk using a file-based approach:

1. **Storage Location:** `apps/backend/.state/kill-switch.json`
2. **State Format:** JSON with fields:
   - `killed: boolean` - Whether kill switch is active
   - `timestamp: number` - When the state was set (epoch milliseconds)
   - `reason?: string` - Optional reason for activation
3. **Persistence Strategy:**
   - Save state asynchronously when kill switch is activated
   - Save state asynchronously when kill switch is reset
   - Load state synchronously during RiskManager initialization
   - Delete state file when kill switch is reset

4. **Startup Behavior:**
   - Load kill switch state from disk before enabling trading
   - If state file indicates kill switch is active, restore the killed state
   - If state file doesn't exist or indicates not killed, allow trading
   - Log restoration clearly for operator awareness

## Alternatives Considered

### 1. Database Storage
- **Pros:** More robust, better for distributed systems, queryable
- **Cons:** Requires database setup, overkill for single state value, adds operational complexity
- **Decision:** Rejected - file-based is simpler and sufficient for current needs

### 2. Environment Variable
- **Pros:** Simple, no file I/O
- **Cons:** Requires editing .env and restarting, doesn't persist across unexpected restarts, not suitable for runtime state
- **Decision:** Rejected - doesn't meet requirement for automatic persistence

### 3. In-Memory with Periodic Checkpoints
- **Pros:** Good performance, reduced I/O
- **Cons:** Still vulnerable to crash between checkpoints, complex to implement correctly
- **Decision:** Rejected - file I/O is fast enough and simpler

### 4. SQLite Local Database
- **Pros:** More structured than JSON, supports multiple state values
- **Cons:** Requires SQLite dependency, heavier than needed for single value
- **Decision:** Rejected - JSON file is sufficient for current needs, can migrate later if needed

## Consequences

### Positive

1. **Safety:** Kill switch survives process restarts, preventing unsafe auto-resume
2. **Compliance:** Meets audit requirement for persistent safety controls
3. **Simplicity:** File-based approach is easy to understand and debug
4. **No Dependencies:** Uses only Node.js built-in `fs` module
5. **Inspectable:** Operators can view/edit state file manually if needed

### Negative

1. **Manual Recovery Required:** Operators must manually clear state file to resume after kill switch
2. **File I/O Risk:** Disk full or permissions issues could cause failures (mitigated with error handling)
3. **Single Process Only:** File-based approach doesn't support distributed systems (acceptable for current architecture)
4. **No History:** Only stores current state, not history of activations (can add logging if needed)

### Neutral

1. **State Directory:** Creates `.state/` directory in backend app folder (excluded from git)
2. **Async Persistence:** State save is async (fire-and-forget), but load is synchronous on startup
3. **Error Handling:** Failures to persist are logged but don't block operations (fail-safe behavior)

## Implementation Notes

### Files Modified
- `apps/backend/src/utils/statePersistence.ts` - New persistence utility
- `apps/backend/src/trading/riskManager.ts` - Modified to use persistence
- `apps/backend/src/server/index.ts` - Call restoreState() on startup
- `apps/backend/tests/statePersistence.test.ts` - Comprehensive tests
- `apps/backend/tests/riskManager.test.ts` - Added persistence tests
- `.gitignore` - Exclude `.state/` directory
- `docs/runbook.md` - Updated kill switch documentation

### Testing
- Unit tests verify save/load/clear operations
- Integration tests verify persistence across RiskManager instances
- Manual testing confirms behavior with real server restarts

### Recovery Procedure
To resume trading after kill switch activation:
```bash
# 1. Investigate and fix the issue that triggered kill switch
# 2. Clear the state file
rm apps/backend/.state/kill-switch.json
# 3. Restart the server
npm run dev
```

## Future Considerations

1. **Reset Endpoint:** Add authenticated API endpoint to reset kill switch without manual file deletion
2. **State History:** Consider logging kill switch activation history for audit trail
3. **Database Migration:** If scaling to multiple instances, migrate to database-backed state
4. **State Versioning:** Add version field to state file for future compatibility
5. **Additional State:** Use same pattern for other persistent state (circuit breaker, etc.)

## References

- [Audit Report - Finding A-002](../../REPORTS/AUDIT.md)
- [PR Implementation Plan - PR-001](../small-pr-plan.md#pr-001-critical-security-fixes-must-do-first)
- [RiskManager Implementation](../../apps/backend/src/trading/riskManager.ts)
- [State Persistence Utility](../../apps/backend/src/utils/statePersistence.ts)

## Approval

**Approved by:** Development Team  
**Review Date:** 2026-02-04  
**Security Review:** ✅ Addresses CRITICAL audit finding A-002
