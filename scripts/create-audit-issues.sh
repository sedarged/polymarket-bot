#!/bin/bash
# Batch create all audit finding issues using GitHub CLI
#
# Prerequisites:
#   - GitHub CLI installed (gh)
#   - Authenticated (gh auth login)
#   - In the polymarket-bot repository

set -e

REPO="sedarged/polymarket-bot"
PARENT_ISSUE="23"

echo "Creating 27 audit finding issues..."
echo ""

# Issue 1: A-001
echo "Creating issue 1/27: A-001..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Plaintext Private Key Storage - Audit Finding A-001" \
  --body "Addresses audit finding **A-001** (CRITICAL severity).

**File:** \`apps/backend/src/config/index.ts:56\`

**Issue:**
Private key stored in plaintext environment variable with no encryption

**Technical Approach:**
Integrate with secret management service (AWS Secrets Manager, HashiCorp Vault, or Azure Key Vault). Add key rotation capability and access audit logging.

---

## Why is this needed?

**Audit Severity:** CRITICAL

**Impact:**
- Complete wallet compromise if environment is accessed
- Attacker can drain all funds from wallet
- No audit trail of key usage
- Key may be logged or exposed in error messages

**Production Risk:**
This is a CRITICAL severity finding that BLOCKS live trading.

**Reference:** REPORTS/AUDIT.md finding A-001

---

## Acceptance Criteria

- [ ] Audit finding A-001 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-001: Critical Security Fixes

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-001)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-001: Critical Security Fixes

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security" \
  --label "P0,backend,security" \
  --assignee "@me"

# Issue 2: A-002
echo "Creating issue 2/27: A-002..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Kill Switch State Not Persisted - Audit Finding A-002" \
  --body "Addresses audit finding **A-002** (CRITICAL severity).

**File:** \`apps/backend/src/trading/riskManager.ts:27,187-189\`

**Issue:**
Kill switch state stored in memory only, lost on process restart

**Technical Approach:**
Persist kill switch state to disk (JSON file or database). Check state on startup. Add recovery procedures to runbook.

---

## Why is this needed?

**Audit Severity:** CRITICAL

**Impact:**
- Kill switch state lost on process restart/crash
- Bot resumes trading after unexpected restart
- No protection from automated recovery tools (PM2, Kubernetes)
- Violates safety requirements

**Production Risk:**
This is a CRITICAL severity finding that BLOCKS live trading.

**Reference:** REPORTS/AUDIT.md finding A-002

---

## Acceptance Criteria

- [ ] Audit finding A-002 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-001: Critical Security Fixes

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-002)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-001: Critical Security Fixes

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security, trading, safety" \
  --label "P0,trading logic,security" \
  --assignee "@me"

# Issue 3: A-003
echo "Creating issue 3/27: A-003..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Wildcard CORS Configuration - Audit Finding A-003" \
  --body "Addresses audit finding **A-003** (CRITICAL severity).

**File:** \`apps/backend/src/server/index.ts:22\`

**Issue:**
CORS set to wildcard \"*\" allowing any origin

**Technical Approach:**
Replace wildcard with environment-based allowed origins list. Add ALLOWED_ORIGINS environment variable. Default to localhost only.

---

## Why is this needed?

**Audit Severity:** CRITICAL

**Impact:**
- XSS attacks from malicious websites
- Unauthorized frontend can access trading APIs
- Session hijacking risk
- CSRF attacks possible

**Production Risk:**
This is a CRITICAL severity finding that BLOCKS live trading.

**Reference:** REPORTS/AUDIT.md finding A-003

---

## Acceptance Criteria

- [ ] Audit finding A-003 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-001: Critical Security Fixes

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-003)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-001: Critical Security Fixes

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security" \
  --label "P0,backend,security" \
  --assignee "@me"

# Issue 4: A-004
echo "Creating issue 4/27: A-004..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Admin Authentication Not Required - Audit Finding A-004" \
  --body "Addresses audit finding **A-004** (HIGH severity).

**File:** \`apps/backend/src/server/index.ts:33-35\`

**Issue:**
ADMIN_TOKEN is optional; sensitive endpoints unprotected when not configured

**Technical Approach:**
Make ADMIN_TOKEN required in production mode. Fail startup if missing when LIVE_TRADING=true. Add token validation middleware.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- Unauthorized kill switch activation possible
- Order cancellation endpoints unprotected
- No access control in development/testing
- Production security gap

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-004

---

## Acceptance Criteria

- [ ] Audit finding A-004 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-002: Authentication & Rate Limiting

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-004)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-002: Authentication & Rate Limiting

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security, security" \
  --label "P1,backend,security" \
  --assignee "@me"

# Issue 5: A-005
echo "Creating issue 5/27: A-005..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Unsafe Type Coercion and Casting - Audit Finding A-005" \
  --body "Addresses audit finding **A-005** (HIGH severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:95-96\`

**Issue:**
@ts-ignore used for balance fetch with no runtime validation

**Technical Approach:**
Add Zod schemas for API responses. Remove @ts-ignore. Add proper type guards and runtime validation.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- Runtime errors if API changes
- Type safety bypassed
- Undefined method calls
- No compile-time validation

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-005

---

## Acceptance Criteria

- [ ] Audit finding A-005 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-004: Type Safety & Validation

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-005)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-004: Type Safety & Validation

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security, trading" \
  --label "P1,trading logic,security" \
  --assignee "@me"

# Issue 6: A-006
echo "Creating issue 6/27: A-006..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Missing Idempotency in Order Submission - Audit Finding A-006" \
  --body "Addresses audit finding **A-006** (HIGH severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:143\`

**Issue:**
ClientOrderId generation uses timestamp+PID, lacks cryptographic randomness

**Technical Approach:**
Replace timestamp-based IDs with UUID v4. Add in-memory tracking of submitted orders. Implement deduplication logic.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- Order duplication across instances with same PID/timestamp
- Race conditions in distributed deployments
- No protection against retry logic duplicates
- Compliance issues with duplicate trades

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-006

---

## Acceptance Criteria

- [ ] Audit finding A-006 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-003: Data Integrity & Idempotency

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-006)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-003: Data Integrity & Idempotency

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security, trading" \
  --label "P1,trading logic,security" \
  --assignee "@me"

# Issue 7: A-007
echo "Creating issue 7/27: A-007..."
gh issue create \
  --repo "$REPO" \
  --title "[WebSocket/API] Race Condition in WebSocket Resync - Audit Finding A-007" \
  --body "Addresses audit finding **A-007** (HIGH severity).

**File:** \`apps/backend/src/clients/marketFeed.ts:94-98\`

**Issue:**
Concurrent resync not prevented per token; early return but no await

**Technical Approach:**
Add per-token lock using promise tracking. Ensure only one resync per token at a time. Add proper await for concurrent calls.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- Multiple concurrent REST API calls for same token
- Race condition in cache updates
- Inconsistent orderbook state
- Increased API rate limit consumption

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-007

---

## Acceptance Criteria

- [ ] Audit finding A-007 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-003: Data Integrity & Idempotency

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-007)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-003: Data Integrity & Idempotency

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security, websocket" \
  --label "P1,websocket-api,security" \
  --assignee "@me"

# Issue 8: A-008
echo "Creating issue 8/27: A-008..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] No Rate Limiting on API Endpoints - Audit Finding A-008" \
  --body "Addresses audit finding **A-008** (HIGH severity).

**File:** \`apps/backend/src/server/index.ts\`

**Issue:**
No rate limiting middleware present on any HTTP endpoint

**Technical Approach:**
Add rate limiting middleware (rate-limiter-flexible). Implement per-IP rate limits. Add configurable rate limit settings.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- DoS attacks can overwhelm server
- API abuse from malicious clients
- Resource exhaustion
- Cost implications for cloud deployments

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-008

---

## Acceptance Criteria

- [ ] Audit finding A-008 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-002: Authentication & Rate Limiting

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-008)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-002: Authentication & Rate Limiting

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security" \
  --label "P1,backend,security" \
  --assignee "@me"

# Issue 9: A-009
echo "Creating issue 9/27: A-009..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Retry Logic Missing Timeout - Audit Finding A-009" \
  --body "Addresses audit finding **A-009** (HIGH severity).

**File:** \`apps/backend/src/utils/retry.ts:9-41\`

**Issue:**
Retry function has no overall timeout cap, only per-attempt backoff

**Technical Approach:**
Add maxDuration parameter to retry options. Default to 5 minutes total timeout. Track elapsed time and abort if exceeded.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- Operations can retry indefinitely with high backoff
- Thread/connection pool exhaustion
- Startup delays
- Cascading failures

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-009

---

## Acceptance Criteria

- [ ] Audit finding A-009 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-002: Authentication & Rate Limiting

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-009)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-002: Authentication & Rate Limiting

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security" \
  --label "P1,backend,security" \
  --assignee "@me"

# Issue 10: A-010
echo "Creating issue 10/27: A-010..."
gh issue create \
  --repo "$REPO" \
  --title "[WebSocket/API] No WebSocket Message Deduplication - Audit Finding A-010" \
  --body "Addresses audit finding **A-010** (HIGH severity).

**File:** \`apps/backend/src/clients/websocket.ts, apps/backend/src/clients/marketFeed.ts\`

**Issue:**
No sequence numbers or message IDs tracked for deduplication

**Technical Approach:**
Implement message ID tracking. Add sequence numbers per market. Use circular buffer for dedup (size: 1000). Log and drop duplicates.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- Duplicate messages processed on reconnect
- Incorrect orderbook state
- Phantom fills or orders
- Data integrity issues

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-010

---

## Acceptance Criteria

- [ ] Audit finding A-010 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-003: Data Integrity & Idempotency

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-010)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-003: Data Integrity & Idempotency

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security, websocket" \
  --label "P1,websocket-api,security" \
  --assignee "@me"

# Issue 11: A-011
echo "Creating issue 11/27: A-011..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Error Swallowing in Balance Fetch - Audit Finding A-011" \
  --body "Addresses audit finding **A-011** (HIGH severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:93-108\`

**Issue:**
Balance fetch failure only logs warning, continues without balance data

**Technical Approach:**
Throw error on balance fetch failure in live trading mode. Implement retry logic. Add balance staleness check.

---

## Why is this needed?

**Audit Severity:** HIGH

**Impact:**
- Trading proceeds without knowing available funds
- Risk of insufficient balance errors
- No validation of buying power
- Partial startup state

**Production Risk:**
This is a HIGH severity finding that must be resolved before production.

**Reference:** REPORTS/AUDIT.md finding A-011

---

## Acceptance Criteria

- [ ] Audit finding A-011 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-002: Authentication & Rate Limiting

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-011)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-002: Authentication & Rate Limiting

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** security, trading" \
  --label "P1,trading logic,security" \
  --assignee "@me"

# Issue 12: A-012
echo "Creating issue 12/27: A-012..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Error Swallowing in Strategy Execution - Audit Finding A-012" \
  --body "Addresses audit finding **A-012** (MEDIUM severity).

**File:** \`apps/backend/src/server/index.ts:286-291\`

**Issue:**
Trading client initialization failure only logs warning

**Technical Approach:**
Fail startup on trading client init failure. Or enter explicit degraded mode with clear status indicators.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Server runs without trading capability
- Silent failure mode
- No clear status indicator
- Operations continues in degraded state

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-012

---

## Acceptance Criteria

- [ ] Audit finding A-012 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-008: Circuit Breaker & Resilience

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-012)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-008: Circuit Breaker & Resilience

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** " \
  --label "P1,backend" \
  --assignee "@me"

# Issue 13: A-013
echo "Creating issue 13/27: A-013..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Undefined Order ID in Reconciliation - Audit Finding A-013" \
  --body "Addresses audit finding **A-013** (MEDIUM severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:279-284\`

**Issue:**
Order mapping allows missing orderID, falls back to empty string

**Technical Approach:**
Require valid orderId for all orders. Reject orders without ID. Add validation in order mapping.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Orders tracked with empty IDs
- Cannot cancel orders without IDs
- Reconciliation breaks
- State corruption

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-013

---

## Acceptance Criteria

- [ ] Audit finding A-013 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-004: Type Safety & Validation

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-013)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-004: Type Safety & Validation

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P1,trading logic" \
  --assignee "@me"

# Issue 14: A-014
echo "Creating issue 14/27: A-014..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Improper Position Calculation - Audit Finding A-014" \
  --body "Addresses audit finding **A-014** (MEDIUM severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:313-315\`

**Issue:**
Position calculation only uses MATCHED status, ignores partial fills in OPEN orders

**Technical Approach:**
Include OPEN orders with filledSize > 0 in position calculation. Test with partial fills.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Partially filled OPEN orders ignored
- Position size incorrect
- Risk calculations wrong
- Exposure limits ineffective

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-014

---

## Acceptance Criteria

- [ ] Audit finding A-014 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-005: State Reconciliation

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-014)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-005: State Reconciliation

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P1,trading logic" \
  --assignee "@me"

# Issue 15: A-015
echo "Creating issue 15/27: A-015..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] No Input Validation for Orders - Audit Finding A-015" \
  --body "Addresses audit finding **A-015** (MEDIUM severity).

**File:** \`apps/backend/src/clients/tradingClient.ts\`

**Issue:**
Order parameters not validated before submission

**Technical Approach:**
Add Zod schema validation for order parameters (size, price, side). Validate before submission.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Invalid orders submitted to API
- API rejections
- State inconsistency
- Poor error messages

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-015

---

## Acceptance Criteria

- [ ] Audit finding A-015 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-004: Type Safety & Validation

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-015)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-004: Type Safety & Validation

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P1,trading logic" \
  --assignee "@me"

# Issue 16: A-016
echo "Creating issue 16/27: A-016..."
gh issue create \
  --repo "$REPO" \
  --title "[WebSocket/API] Cache Timer Resource Leak - Audit Finding A-016" \
  --body "Addresses audit finding **A-016** (MEDIUM severity).

**File:** \`apps/backend/src/clients/orderbookCache.ts\`

**Issue:**
No TTL enforcement on cached orderbooks, lastUpdate stored but never checked

**Technical Approach:**
Add TTL check (default 60 seconds). Invalidate/refresh old data. Add cache hit/miss metrics.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Stale orderbook data used for trading
- Incorrect price discovery
- Bad fills in paper trading
- Misleading market data

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-016

---

## Acceptance Criteria

- [ ] Audit finding A-016 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-006: WebSocket Reliability

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-016)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-006: WebSocket Reliability

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** websocket" \
  --label "P1,websocket-api" \
  --assignee "@me"

# Issue 17: A-017
echo "Creating issue 17/27: A-017..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Graceful Shutdown Race Conditions - Audit Finding A-017" \
  --body "Addresses audit finding **A-017** (MEDIUM severity).

**File:** \`apps/backend/src/server/index.ts:301\`

**Issue:**
Graceful shutdown does not await market feed stop completion

**Technical Approach:**
Await marketFeedService.stop() completion. Add shutdown timeout. Ensure all resources cleaned up.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- WebSocket not properly closed
- Lingering connections
- Resource leaks
- Incomplete cleanup

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-017

---

## Acceptance Criteria

- [ ] Audit finding A-017 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-006: WebSocket Reliability

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-017)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-006: WebSocket Reliability

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** " \
  --label "P1,backend" \
  --assignee "@me"

# Issue 18: A-018
echo "Creating issue 18/27: A-018..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Circuit Breaker Does Not Auto-Reset - Audit Finding A-018" \
  --body "Addresses audit finding **A-018** (MEDIUM severity).

**File:** \`apps/backend/src/trading/riskManager.ts:157-182\`

**Issue:**
Circuit breaker has no time-based reset mechanism

**Technical Approach:**
Add time-based circuit breaker reset. Implement half-open state to test recovery. Add configurable recovery timeout.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Manual intervention required after service recovery
- No self-healing capability
- Extended downtime
- Operations burden

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-018

---

## Acceptance Criteria

- [ ] Audit finding A-018 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-008: Circuit Breaker & Resilience

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-018)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-008: Circuit Breaker & Resilience

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P1,trading logic" \
  --assignee "@me"

# Issue 19: A-019
echo "Creating issue 19/27: A-019..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Paper Trading Partial Fill Simulation Missing - Audit Finding A-019" \
  --body "Addresses audit finding **A-019** (MEDIUM severity).

**File:** \`apps/backend/src/trading/paperTradingEngine.ts:115\`

**Issue:**
Partial fills always fill remaining amount completely

**Technical Approach:**
Support configurable partial fill amounts. Simulate realistic fill rates. Add fill probability based on liquidity.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Unrealistic paper trading simulation
- Strategies not properly tested
- False confidence in execution
- Production surprises

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-019

---

## Acceptance Criteria

- [ ] Audit finding A-019 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-007: Paper Trading Enhancements

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-019)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-007: Paper Trading Enhancements

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P1,trading logic" \
  --assignee "@me"

# Issue 20: A-020
echo "Creating issue 20/27: A-020..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Slippage Calculation Incorrect - Audit Finding A-020" \
  --body "Addresses audit finding **A-020** (MEDIUM severity).

**File:** \`apps/backend/src/trading/paperTradingEngine.ts:99,105\`

**Issue:**
Slippage applied uniformly regardless of order size

**Technical Approach:**
Scale slippage with order size vs available liquidity. Use orderbook depth. Add market impact model.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Unrealistic slippage for large orders
- Poor simulation of market impact
- Strategy performance misleading
- Incorrect PnL estimates

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-020

---

## Acceptance Criteria

- [ ] Audit finding A-020 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-007: Paper Trading Enhancements

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-020)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-007: Paper Trading Enhancements

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P1,trading logic" \
  --assignee "@me"

# Issue 21: A-021
echo "Creating issue 21/27: A-021..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Potential Integer Overflow - Audit Finding A-021" \
  --body "Addresses audit finding **A-021** (MEDIUM severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:40,143\`

**Issue:**
orderIdCounter can overflow after 2^53 orders

**Technical Approach:**
Use UUID v4 instead of counter (addressed in A-006). Or use BigInt with timestamp boundary reset.

---

## Why is this needed?

**Audit Severity:** MEDIUM

**Impact:**
- Duplicate order IDs after overflow
- State corruption
- Long-running bot issues
- Unlikely but possible

**Production Risk:**
This is a MEDIUM severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-021

---

## Acceptance Criteria

- [ ] Audit finding A-021 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-004: Type Safety & Validation

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-021)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-004: Type Safety & Validation

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P2,trading logic" \
  --assignee "@me"

# Issue 22: A-022
echo "Creating issue 22/27: A-022..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Potential Logging Information Exposure - Audit Finding A-022" \
  --body "Addresses audit finding **A-022** (LOW severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:62-65\`

**Issue:**
Wallet address logged at startup

**Technical Approach:**
Mask wallet addresses in logs. Show only first 6 and last 4 characters. Audit logs for sensitive data.

---

## Why is this needed?

**Audit Severity:** LOW

**Impact:**
- Privacy leak in shared logs
- Address correlation possible
- Sensitive data exposure
- Minor security concern

**Production Risk:**
This is a LOW severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-022

---

## Acceptance Criteria

- [ ] Audit finding A-022 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-010: Logging & Privacy

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-022)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-010: Logging & Privacy

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P2,trading logic" \
  --assignee "@me"

# Issue 23: A-023
echo "Creating issue 23/27: A-023..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Missing Jitter in Backoff Calculation - Audit Finding A-023" \
  --body "Addresses audit finding **A-023** (LOW severity).

**File:** \`apps/backend/src/utils/retry.ts:33\`

**Issue:**
Retry backoff has no random jitter

**Technical Approach:**
Add random jitter to retry delays (±10-25%). Prevent synchronized retry storms.

---

## Why is this needed?

**Audit Severity:** LOW

**Impact:**
- Thundering herd on service recovery
- Synchronized retries
- Service overload
- Poor retry distribution

**Production Risk:**
This is a LOW severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-023

---

## Acceptance Criteria

- [ ] Audit finding A-023 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-008: Circuit Breaker & Resilience

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-023)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-008: Circuit Breaker & Resilience

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** " \
  --label "P2,backend" \
  --assignee "@me"

# Issue 24: A-024
echo "Creating issue 24/27: A-024..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Missing Private Key Format Validation - Audit Finding A-024" \
  --body "Addresses audit finding **A-024** (LOW severity).

**File:** \`apps/backend/src/config/index.ts:56\`

**Issue:**
No validation that PRIVATE_KEY is valid hex string

**Technical Approach:**
Add regex validation for private key format (64 hex characters). Fail fast on invalid format.

---

## Why is this needed?

**Audit Severity:** LOW

**Impact:**
- Invalid keys cause runtime errors
- Poor error messages
- Delayed failure detection
- Configuration issues

**Production Risk:**
This is a LOW severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-024

---

## Acceptance Criteria

- [ ] Audit finding A-024 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-004: Type Safety & Validation

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-024)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-004: Type Safety & Validation

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** " \
  --label "P2,backend" \
  --assignee "@me"

# Issue 25: A-025
echo "Creating issue 25/27: A-025..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Insufficient Test Coverage - Audit Finding A-025" \
  --body "Addresses audit finding **A-025** (LOW severity).

**File:** \`All components\`

**Issue:**
No tests for critical paths (kill switch, reconciliation, WebSocket reconnect)

**Technical Approach:**
Add comprehensive test suite. Achieve >80% code coverage. Test all critical paths.

---

## Why is this needed?

**Audit Severity:** LOW

**Impact:**
- Bugs in production
- Hard to refactor safely
- Low confidence in changes
- Regression risk

**Production Risk:**
This is a LOW severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-025

---

## Acceptance Criteria

- [ ] Audit finding A-025 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-011: Test Coverage Expansion

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-025)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-011: Test Coverage Expansion

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** testing" \
  --label "P1,backend" \
  --assignee "@me"

# Issue 26: A-026
echo "Creating issue 26/27: A-026..."
gh issue create \
  --repo "$REPO" \
  --title "[Trading Logic] Dead Code with @ts-ignore - Audit Finding A-026" \
  --body "Addresses audit finding **A-026** (LOW severity).

**File:** \`apps/backend/src/clients/tradingClient.ts:95,154\`

**Issue:**
@ts-ignore comments indicate API uncertainty

**Technical Approach:**
Confirm API contracts. Remove @ts-ignore comments. Add proper types.

---

## Why is this needed?

**Audit Severity:** LOW

**Impact:**
- Technical debt
- Fragile code
- Type safety compromised
- Maintainability issues

**Production Risk:**
This is a LOW severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-026

---

## Acceptance Criteria

- [ ] Audit finding A-026 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-004: Type Safety & Validation

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-026)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-004: Type Safety & Validation

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** trading" \
  --label "P2,trading logic" \
  --assignee "@me"

# Issue 27: A-027
echo "Creating issue 27/27: A-027..."
gh issue create \
  --repo "$REPO" \
  --title "[Backend] Missing Metrics for Observability - Audit Finding A-027" \
  --body "Addresses audit finding **A-027** (LOW severity).

**File:** \`All components\`

**Issue:**
No metrics/monitoring instrumentation

**Technical Approach:**
Add Prometheus client library. Implement key metrics (latency, errors, orders). Create /metrics endpoint.

---

## Why is this needed?

**Audit Severity:** LOW

**Impact:**
- Cannot observe system health
- No alerting capability
- Blind operations
- Slow incident response

**Production Risk:**
This is a LOW severity finding that should be addressed for production readiness.

**Reference:** REPORTS/AUDIT.md finding A-027

---

## Acceptance Criteria

- [ ] Audit finding A-027 fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
- [ ] Follows PR plan: PR-009: Observability & Metrics

---

## Additional Context

**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#a-027)
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
**PR Plan:** PR-009: Observability & Metrics

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** " \
  --label "P1,backend" \
  --assignee "@me"


echo ""
echo "✨ All 27 issues created successfully!"
echo ""
echo "Next steps:"
echo "  1. Review all issues in the repository"
echo "  2. Link issues to parent #${PARENT_ISSUE}"
echo "  3. Update STATUS.md with issue count"
