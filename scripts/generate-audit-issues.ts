#!/usr/bin/env tsx

/**
 * Generate GitHub issues for all audit findings
 * 
 * This script parses REPORTS/AUDIT.md and generates issue content files
 * that can be batch-created using GitHub CLI.
 */

import fs from 'fs/promises';
import path from 'path';

interface AuditFinding {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  file: string;
  evidence: string;
  impact: string[];
  fix: string;
  priority: 'P0' | 'P1' | 'P2';
  area: string;
  linkedPR?: string;
}

interface IssueTemplate {
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  area: string;
  what: string;
  why: string;
  acceptance: string;
  context: string;
}

// Map audit findings to appropriate areas
function mapArea(finding: AuditFinding): string {
  const file = finding.file.toLowerCase();
  
  if (file.includes('config')) return 'Backend';
  if (file.includes('server')) return 'Backend';
  if (file.includes('websocket')) return 'WebSocket/API';
  if (file.includes('marketfeed')) return 'WebSocket/API';
  if (file.includes('tradingclient')) return 'Trading Logic';
  if (file.includes('riskmanager')) return 'Trading Logic';
  if (file.includes('papertrading')) return 'Trading Logic';
  if (file.includes('orderbookcache')) return 'WebSocket/API';
  if (file.includes('retry')) return 'Backend';
  
  return 'Backend';
}

// Generate issue content for an audit finding
function generateIssue(finding: AuditFinding): IssueTemplate {
  const area = mapArea(finding);
  
  const title = `[${area}] ${finding.title} - Audit Finding ${finding.id}`;
  
  const what = `Addresses audit finding **${finding.id}** (${finding.severity} severity).

**File:** \`${finding.file}\`

**Issue:**
${finding.evidence}

**Technical Approach:**
${finding.fix}`;

  const why = `**Audit Severity:** ${finding.severity}

**Impact:**
${finding.impact.map(i => `- ${i}`).join('\n')}

**Production Risk:**
This is a ${finding.severity} severity finding that ${finding.severity === 'CRITICAL' ? 'BLOCKS live trading' : finding.severity === 'HIGH' ? 'must be resolved before production' : 'should be addressed for production readiness'}.

**Reference:** REPORTS/AUDIT.md finding ${finding.id}`;

  const acceptance = `- [ ] Audit finding ${finding.id} fully addressed
- [ ] Implementation matches audit recommendations
- [ ] Tests added for the fix (or updated if exists)
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
- [ ] Documentation updated (if applicable)
- [ ] Hard rules respected (no secrets, proper gating)
- [ ] PR links to this issue and parent #23
${finding.linkedPR ? `- [ ] Follows PR plan: ${finding.linkedPR}` : ''}`;

  const context = `**Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md#${finding.id.toLowerCase()})
**Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
${finding.linkedPR ? `**PR Plan:** ${finding.linkedPR}` : ''}

**Related Findings:** See REPORTS/AUDIT.md for related issues in same category.

**Keywords for auto-labeling:** ${getKeywords(area, finding)}`;

  return {
    title,
    priority: finding.priority,
    area,
    what,
    why,
    acceptance,
    context
  };
}

// Generate keywords for GitHub automation
function getKeywords(area: string, finding: AuditFinding): string {
  const keywords: string[] = [];
  
  if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
    keywords.push('security');
  }
  
  if (area === 'WebSocket/API') {
    keywords.push('websocket');
  }
  
  if (area === 'Trading Logic') {
    keywords.push('trading');
  }
  
  if (finding.title.toLowerCase().includes('test')) {
    keywords.push('testing');
  }
  
  if (finding.title.toLowerCase().includes('auth')) {
    keywords.push('security');
  }
  
  if (finding.title.toLowerCase().includes('kill switch')) {
    keywords.push('safety');
  }
  
  return keywords.join(', ');
}

// All audit findings from REPORTS/AUDIT.md
const auditFindings: AuditFinding[] = [
  // CRITICAL
  {
    id: 'A-001',
    severity: 'CRITICAL',
    title: 'Plaintext Private Key Storage',
    file: 'apps/backend/src/config/index.ts:56',
    evidence: 'Private key stored in plaintext environment variable with no encryption',
    impact: [
      'Complete wallet compromise if environment is accessed',
      'Attacker can drain all funds from wallet',
      'No audit trail of key usage',
      'Key may be logged or exposed in error messages'
    ],
    fix: 'Integrate with secret management service (AWS Secrets Manager, HashiCorp Vault, or Azure Key Vault). Add key rotation capability and access audit logging.',
    priority: 'P0',
    area: 'Security',
    linkedPR: 'PR-001: Critical Security Fixes'
  },
  {
    id: 'A-002',
    severity: 'CRITICAL',
    title: 'Kill Switch State Not Persisted',
    file: 'apps/backend/src/trading/riskManager.ts:27,187-189',
    evidence: 'Kill switch state stored in memory only, lost on process restart',
    impact: [
      'Kill switch state lost on process restart/crash',
      'Bot resumes trading after unexpected restart',
      'No protection from automated recovery tools (PM2, Kubernetes)',
      'Violates safety requirements'
    ],
    fix: 'Persist kill switch state to disk (JSON file or database). Check state on startup. Add recovery procedures to runbook.',
    priority: 'P0',
    area: 'Trading Logic',
    linkedPR: 'PR-001: Critical Security Fixes'
  },
  {
    id: 'A-003',
    severity: 'CRITICAL',
    title: 'Wildcard CORS Configuration',
    file: 'apps/backend/src/server/index.ts:22',
    evidence: 'CORS set to wildcard "*" allowing any origin',
    impact: [
      'XSS attacks from malicious websites',
      'Unauthorized frontend can access trading APIs',
      'Session hijacking risk',
      'CSRF attacks possible'
    ],
    fix: 'Replace wildcard with environment-based allowed origins list. Add ALLOWED_ORIGINS environment variable. Default to localhost only.',
    priority: 'P0',
    area: 'Backend',
    linkedPR: 'PR-001: Critical Security Fixes'
  },
  
  // HIGH
  {
    id: 'A-004',
    severity: 'HIGH',
    title: 'Admin Authentication Not Required',
    file: 'apps/backend/src/server/index.ts:33-35',
    evidence: 'ADMIN_TOKEN is optional; sensitive endpoints unprotected when not configured',
    impact: [
      'Unauthorized kill switch activation possible',
      'Order cancellation endpoints unprotected',
      'No access control in development/testing',
      'Production security gap'
    ],
    fix: 'Make ADMIN_TOKEN required in production mode. Fail startup if missing when LIVE_TRADING=true. Add token validation middleware.',
    priority: 'P1',
    area: 'Backend',
    linkedPR: 'PR-002: Authentication & Rate Limiting'
  },
  {
    id: 'A-005',
    severity: 'HIGH',
    title: 'Unsafe Type Coercion and Casting',
    file: 'apps/backend/src/clients/tradingClient.ts:95-96',
    evidence: '@ts-ignore used for balance fetch with no runtime validation',
    impact: [
      'Runtime errors if API changes',
      'Type safety bypassed',
      'Undefined method calls',
      'No compile-time validation'
    ],
    fix: 'Add Zod schemas for API responses. Remove @ts-ignore. Add proper type guards and runtime validation.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-004: Type Safety & Validation'
  },
  {
    id: 'A-006',
    severity: 'HIGH',
    title: 'Missing Idempotency in Order Submission',
    file: 'apps/backend/src/clients/tradingClient.ts:143',
    evidence: 'ClientOrderId generation uses timestamp+PID, lacks cryptographic randomness',
    impact: [
      'Order duplication across instances with same PID/timestamp',
      'Race conditions in distributed deployments',
      'No protection against retry logic duplicates',
      'Compliance issues with duplicate trades'
    ],
    fix: 'Replace timestamp-based IDs with UUID v4. Add in-memory tracking of submitted orders. Implement deduplication logic.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-003: Data Integrity & Idempotency'
  },
  {
    id: 'A-007',
    severity: 'HIGH',
    title: 'Race Condition in WebSocket Resync',
    file: 'apps/backend/src/clients/marketFeed.ts:94-98',
    evidence: 'Concurrent resync not prevented per token; early return but no await',
    impact: [
      'Multiple concurrent REST API calls for same token',
      'Race condition in cache updates',
      'Inconsistent orderbook state',
      'Increased API rate limit consumption'
    ],
    fix: 'Add per-token lock using promise tracking. Ensure only one resync per token at a time. Add proper await for concurrent calls.',
    priority: 'P1',
    area: 'WebSocket/API',
    linkedPR: 'PR-003: Data Integrity & Idempotency'
  },
  {
    id: 'A-008',
    severity: 'HIGH',
    title: 'No Rate Limiting on API Endpoints',
    file: 'apps/backend/src/server/index.ts',
    evidence: 'No rate limiting middleware present on any HTTP endpoint',
    impact: [
      'DoS attacks can overwhelm server',
      'API abuse from malicious clients',
      'Resource exhaustion',
      'Cost implications for cloud deployments'
    ],
    fix: 'Add rate limiting middleware (rate-limiter-flexible). Implement per-IP rate limits. Add configurable rate limit settings.',
    priority: 'P1',
    area: 'Backend',
    linkedPR: 'PR-002: Authentication & Rate Limiting'
  },
  {
    id: 'A-009',
    severity: 'HIGH',
    title: 'Retry Logic Missing Timeout',
    file: 'apps/backend/src/utils/retry.ts:9-41',
    evidence: 'Retry function has no overall timeout cap, only per-attempt backoff',
    impact: [
      'Operations can retry indefinitely with high backoff',
      'Thread/connection pool exhaustion',
      'Startup delays',
      'Cascading failures'
    ],
    fix: 'Add maxDuration parameter to retry options. Default to 5 minutes total timeout. Track elapsed time and abort if exceeded.',
    priority: 'P1',
    area: 'Backend',
    linkedPR: 'PR-002: Authentication & Rate Limiting'
  },
  {
    id: 'A-010',
    severity: 'HIGH',
    title: 'No WebSocket Message Deduplication',
    file: 'apps/backend/src/clients/websocket.ts, apps/backend/src/clients/marketFeed.ts',
    evidence: 'No sequence numbers or message IDs tracked for deduplication',
    impact: [
      'Duplicate messages processed on reconnect',
      'Incorrect orderbook state',
      'Phantom fills or orders',
      'Data integrity issues'
    ],
    fix: 'Implement message ID tracking. Add sequence numbers per market. Use circular buffer for dedup (size: 1000). Log and drop duplicates.',
    priority: 'P1',
    area: 'WebSocket/API',
    linkedPR: 'PR-003: Data Integrity & Idempotency'
  },
  {
    id: 'A-011',
    severity: 'HIGH',
    title: 'Error Swallowing in Balance Fetch',
    file: 'apps/backend/src/clients/tradingClient.ts:93-108',
    evidence: 'Balance fetch failure only logs warning, continues without balance data',
    impact: [
      'Trading proceeds without knowing available funds',
      'Risk of insufficient balance errors',
      'No validation of buying power',
      'Partial startup state'
    ],
    fix: 'Throw error on balance fetch failure in live trading mode. Implement retry logic. Add balance staleness check.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-002: Authentication & Rate Limiting'
  },
  
  // MEDIUM
  {
    id: 'A-012',
    severity: 'MEDIUM',
    title: 'Error Swallowing in Strategy Execution',
    file: 'apps/backend/src/server/index.ts:286-291',
    evidence: 'Trading client initialization failure only logs warning',
    impact: [
      'Server runs without trading capability',
      'Silent failure mode',
      'No clear status indicator',
      'Operations continues in degraded state'
    ],
    fix: 'Fail startup on trading client init failure. Or enter explicit degraded mode with clear status indicators.',
    priority: 'P1',
    area: 'Backend',
    linkedPR: 'PR-008: Circuit Breaker & Resilience'
  },
  {
    id: 'A-013',
    severity: 'MEDIUM',
    title: 'Undefined Order ID in Reconciliation',
    file: 'apps/backend/src/clients/tradingClient.ts:279-284',
    evidence: 'Order mapping allows missing orderID, falls back to empty string',
    impact: [
      'Orders tracked with empty IDs',
      'Cannot cancel orders without IDs',
      'Reconciliation breaks',
      'State corruption'
    ],
    fix: 'Require valid orderId for all orders. Reject orders without ID. Add validation in order mapping.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-004: Type Safety & Validation'
  },
  {
    id: 'A-014',
    severity: 'MEDIUM',
    title: 'Improper Position Calculation',
    file: 'apps/backend/src/clients/tradingClient.ts:313-315',
    evidence: 'Position calculation only uses MATCHED status, ignores partial fills in OPEN orders',
    impact: [
      'Partially filled OPEN orders ignored',
      'Position size incorrect',
      'Risk calculations wrong',
      'Exposure limits ineffective'
    ],
    fix: 'Include OPEN orders with filledSize > 0 in position calculation. Test with partial fills.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-005: State Reconciliation'
  },
  {
    id: 'A-015',
    severity: 'MEDIUM',
    title: 'No Input Validation for Orders',
    file: 'apps/backend/src/clients/tradingClient.ts',
    evidence: 'Order parameters not validated before submission',
    impact: [
      'Invalid orders submitted to API',
      'API rejections',
      'State inconsistency',
      'Poor error messages'
    ],
    fix: 'Add Zod schema validation for order parameters (size, price, side). Validate before submission.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-004: Type Safety & Validation'
  },
  {
    id: 'A-016',
    severity: 'MEDIUM',
    title: 'Cache Timer Resource Leak',
    file: 'apps/backend/src/clients/orderbookCache.ts',
    evidence: 'No TTL enforcement on cached orderbooks, lastUpdate stored but never checked',
    impact: [
      'Stale orderbook data used for trading',
      'Incorrect price discovery',
      'Bad fills in paper trading',
      'Misleading market data'
    ],
    fix: 'Add TTL check (default 60 seconds). Invalidate/refresh old data. Add cache hit/miss metrics.',
    priority: 'P1',
    area: 'WebSocket/API',
    linkedPR: 'PR-006: WebSocket Reliability'
  },
  {
    id: 'A-017',
    severity: 'MEDIUM',
    title: 'Graceful Shutdown Race Conditions',
    file: 'apps/backend/src/server/index.ts:301',
    evidence: 'Graceful shutdown does not await market feed stop completion',
    impact: [
      'WebSocket not properly closed',
      'Lingering connections',
      'Resource leaks',
      'Incomplete cleanup'
    ],
    fix: 'Await marketFeedService.stop() completion. Add shutdown timeout. Ensure all resources cleaned up.',
    priority: 'P1',
    area: 'Backend',
    linkedPR: 'PR-006: WebSocket Reliability'
  },
  {
    id: 'A-018',
    severity: 'MEDIUM',
    title: 'Circuit Breaker Does Not Auto-Reset',
    file: 'apps/backend/src/trading/riskManager.ts:157-182',
    evidence: 'Circuit breaker has no time-based reset mechanism',
    impact: [
      'Manual intervention required after service recovery',
      'No self-healing capability',
      'Extended downtime',
      'Operations burden'
    ],
    fix: 'Add time-based circuit breaker reset. Implement half-open state to test recovery. Add configurable recovery timeout.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-008: Circuit Breaker & Resilience'
  },
  {
    id: 'A-019',
    severity: 'MEDIUM',
    title: 'Paper Trading Partial Fill Simulation Missing',
    file: 'apps/backend/src/trading/paperTradingEngine.ts:115',
    evidence: 'Partial fills always fill remaining amount completely',
    impact: [
      'Unrealistic paper trading simulation',
      'Strategies not properly tested',
      'False confidence in execution',
      'Production surprises'
    ],
    fix: 'Support configurable partial fill amounts. Simulate realistic fill rates. Add fill probability based on liquidity.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-007: Paper Trading Enhancements'
  },
  {
    id: 'A-020',
    severity: 'MEDIUM',
    title: 'Slippage Calculation Incorrect',
    file: 'apps/backend/src/trading/paperTradingEngine.ts:99,105',
    evidence: 'Slippage applied uniformly regardless of order size',
    impact: [
      'Unrealistic slippage for large orders',
      'Poor simulation of market impact',
      'Strategy performance misleading',
      'Incorrect PnL estimates'
    ],
    fix: 'Scale slippage with order size vs available liquidity. Use orderbook depth. Add market impact model.',
    priority: 'P1',
    area: 'Trading Logic',
    linkedPR: 'PR-007: Paper Trading Enhancements'
  },
  {
    id: 'A-021',
    severity: 'MEDIUM',
    title: 'Potential Integer Overflow',
    file: 'apps/backend/src/clients/tradingClient.ts:40,143',
    evidence: 'orderIdCounter can overflow after 2^53 orders',
    impact: [
      'Duplicate order IDs after overflow',
      'State corruption',
      'Long-running bot issues',
      'Unlikely but possible'
    ],
    fix: 'Use UUID v4 instead of counter (addressed in A-006). Or use BigInt with timestamp boundary reset.',
    priority: 'P2',
    area: 'Trading Logic',
    linkedPR: 'PR-004: Type Safety & Validation'
  },
  
  // LOW
  {
    id: 'A-022',
    severity: 'LOW',
    title: 'Potential Logging Information Exposure',
    file: 'apps/backend/src/clients/tradingClient.ts:62-65',
    evidence: 'Wallet address logged at startup',
    impact: [
      'Privacy leak in shared logs',
      'Address correlation possible',
      'Sensitive data exposure',
      'Minor security concern'
    ],
    fix: 'Mask wallet addresses in logs. Show only first 6 and last 4 characters. Audit logs for sensitive data.',
    priority: 'P2',
    area: 'Backend',
    linkedPR: 'PR-010: Logging & Privacy'
  },
  {
    id: 'A-023',
    severity: 'LOW',
    title: 'Missing Jitter in Backoff Calculation',
    file: 'apps/backend/src/utils/retry.ts:33',
    evidence: 'Retry backoff has no random jitter',
    impact: [
      'Thundering herd on service recovery',
      'Synchronized retries',
      'Service overload',
      'Poor retry distribution'
    ],
    fix: 'Add random jitter to retry delays (±10-25%). Prevent synchronized retry storms.',
    priority: 'P2',
    area: 'Backend',
    linkedPR: 'PR-008: Circuit Breaker & Resilience'
  },
  {
    id: 'A-024',
    severity: 'LOW',
    title: 'Missing Private Key Format Validation',
    file: 'apps/backend/src/config/index.ts:56',
    evidence: 'No validation that PRIVATE_KEY is valid hex string',
    impact: [
      'Invalid keys cause runtime errors',
      'Poor error messages',
      'Delayed failure detection',
      'Configuration issues'
    ],
    fix: 'Add regex validation for private key format (64 hex characters). Fail fast on invalid format.',
    priority: 'P2',
    area: 'Backend',
    linkedPR: 'PR-004: Type Safety & Validation'
  },
  {
    id: 'A-025',
    severity: 'LOW',
    title: 'Insufficient Test Coverage',
    file: 'All components',
    evidence: 'No tests for critical paths (kill switch, reconciliation, WebSocket reconnect)',
    impact: [
      'Bugs in production',
      'Hard to refactor safely',
      'Low confidence in changes',
      'Regression risk'
    ],
    fix: 'Add comprehensive test suite. Achieve >80% code coverage. Test all critical paths.',
    priority: 'P1',
    area: 'Testing',
    linkedPR: 'PR-011: Test Coverage Expansion'
  },
  {
    id: 'A-026',
    severity: 'LOW',
    title: 'Dead Code with @ts-ignore',
    file: 'apps/backend/src/clients/tradingClient.ts:95,154',
    evidence: '@ts-ignore comments indicate API uncertainty',
    impact: [
      'Technical debt',
      'Fragile code',
      'Type safety compromised',
      'Maintainability issues'
    ],
    fix: 'Confirm API contracts. Remove @ts-ignore comments. Add proper types.',
    priority: 'P2',
    area: 'Trading Logic',
    linkedPR: 'PR-004: Type Safety & Validation'
  },
  {
    id: 'A-027',
    severity: 'LOW',
    title: 'Missing Metrics for Observability',
    file: 'All components',
    evidence: 'No metrics/monitoring instrumentation',
    impact: [
      'Cannot observe system health',
      'No alerting capability',
      'Blind operations',
      'Slow incident response'
    ],
    fix: 'Add Prometheus client library. Implement key metrics (latency, errors, orders). Create /metrics endpoint.',
    priority: 'P1',
    area: 'Backend',
    linkedPR: 'PR-009: Observability & Metrics'
  }
];

// Generate issue file content in GitHub CLI format
function generateIssueFile(template: IssueTemplate, index: number): string {
  return `# Issue ${index}: ${template.title}

## Metadata
- **Priority:** ${template.priority}
- **Area:** ${template.area}

## What needs to be done?

${template.what}

## Why is this needed?

${template.why}

## Acceptance Criteria

${template.acceptance}

## Additional Context

${template.context}
`;
}

// Main execution
async function main() {
  const issuesDir = path.join(process.cwd(), 'issues', 'audit-implementation');
  await fs.mkdir(issuesDir, { recursive: true });
  
  console.log(`Generating ${auditFindings.length} audit finding issues...`);
  
  const issues: IssueTemplate[] = [];
  
  for (const finding of auditFindings) {
    const issue = generateIssue(finding);
    issues.push(issue);
  }
  
  // Write individual issue files
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const filename = `${String(i + 1).padStart(3, '0')}-${auditFindings[i].id.toLowerCase()}.md`;
    const filepath = path.join(issuesDir, filename);
    const content = generateIssueFile(issue, i + 1);
    
    await fs.writeFile(filepath, content, 'utf-8');
    console.log(`✓ Created ${filename}`);
  }
  
  // Generate batch creation script
  const scriptPath = path.join(process.cwd(), 'scripts', 'create-audit-issues.sh');
  const script = generateBatchScript(issues, auditFindings);
  await fs.writeFile(scriptPath, script, 'utf-8');
  await fs.chmod(scriptPath, 0o755);
  console.log(`✓ Created batch creation script: ${scriptPath}`);
  
  // Generate issue index
  const indexPath = path.join(issuesDir, 'INDEX.md');
  const index = generateIndex(issues, auditFindings);
  await fs.writeFile(indexPath, index, 'utf-8');
  console.log(`✓ Created issue index: ${indexPath}`);
  
  console.log(`\n✨ Generated ${issues.length} issues successfully!`);
  console.log(`\nTo create all issues on GitHub, run:`);
  console.log(`  ./scripts/create-audit-issues.sh`);
}

function generateBatchScript(issues: IssueTemplate[], findings: AuditFinding[]): string {
  let script = `#!/bin/bash
# Batch create all audit finding issues using GitHub CLI
#
# Prerequisites:
#   - GitHub CLI installed (gh)
#   - Authenticated (gh auth login)
#   - In the polymarket-bot repository

set -e

REPO="sedarged/polymarket-bot"
PARENT_ISSUE="23"

echo "Creating ${issues.length} audit finding issues..."
echo ""

`;

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const finding = findings[i];
    
    // Escape quotes and backticks for shell
    const title = issue.title.replace(/"/g, '\\"').replace(/`/g, '\\`');
    const body = `${issue.what}

---

## Why is this needed?

${issue.why}

---

## Acceptance Criteria

${issue.acceptance}

---

## Additional Context

${issue.context}`.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const labels = [];
    labels.push(issue.priority);
    labels.push(issue.area.toLowerCase().replace(/\//g, '-'));
    if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
      labels.push('security');
    }
    
    script += `# Issue ${i + 1}: ${finding.id}
echo "Creating issue ${i + 1}/${issues.length}: ${finding.id}..."
gh issue create \\
  --repo "$REPO" \\
  --title "${title}" \\
  --body "${body}" \\
  --label "${labels.join(',')}" \\
  --assignee "@me"

`;
  }

  script += `
echo ""
echo "✨ All ${issues.length} issues created successfully!"
echo ""
echo "Next steps:"
echo "  1. Review all issues in the repository"
echo "  2. Link issues to parent #\${PARENT_ISSUE}"
echo "  3. Update STATUS.md with issue count"
`;

  return script;
}

function generateIndex(issues: IssueTemplate[], findings: AuditFinding[]): string {
  let index = `# Audit Finding Implementation Issues - Index

**Generated:** ${new Date().toISOString()}
**Total Issues:** ${issues.length}

## Summary by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | ${issues.filter(i => i.priority === 'P0').length} | Critical - Blocks live trading |
| P1 | ${issues.filter(i => i.priority === 'P1').length} | High - Important for production |
| P2 | ${issues.filter(i => i.priority === 'P2').length} | Normal - Standard improvements |

## Summary by Severity

| Severity | Count | Priority |
|----------|-------|----------|
| CRITICAL | ${findings.filter(f => f.severity === 'CRITICAL').length} | P0 |
| HIGH | ${findings.filter(f => f.severity === 'HIGH').length} | P1 |
| MEDIUM | ${findings.filter(f => f.severity === 'MEDIUM').length} | P1/P2 |
| LOW | ${findings.filter(f => f.severity === 'LOW').length} | P2 |

## All Issues

| # | ID | Severity | Title | Priority | Area | PR Plan |
|---|----|----------|-------|----------|------|---------|
`;

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const finding = findings[i];
    const prLink = finding.linkedPR || 'N/A';
    
    index += `| ${i + 1} | ${finding.id} | ${finding.severity} | ${finding.title} | ${issue.priority} | ${issue.area} | ${prLink} |\n`;
  }

  index += `
## PR Plan Mapping

Issues are organized by the 13 PR plan in docs/small-pr-plan.md:

### PR-001: Critical Security Fixes (P0)
- A-001: Plaintext Private Key Storage
- A-002: Kill Switch State Not Persisted
- A-003: Wildcard CORS Configuration

### PR-002: Authentication & Rate Limiting (P1)
- A-004: Admin Authentication Not Required
- A-008: No Rate Limiting on API Endpoints
- A-009: Retry Logic Missing Timeout
- A-011: Error Swallowing in Balance Fetch

### PR-003: Data Integrity & Idempotency (P1)
- A-006: Missing Idempotency in Order Submission
- A-007: Race Condition in WebSocket Resync
- A-010: No WebSocket Message Deduplication
- A-021: Potential Integer Overflow

### PR-004: Type Safety & Validation (P1)
- A-005: Unsafe Type Coercion and Casting
- A-013: Undefined Order ID in Reconciliation
- A-015: No Input Validation for Orders
- A-024: Missing Private Key Format Validation
- A-026: Dead Code with @ts-ignore

### PR-005: State Reconciliation (P1)
- A-014: Improper Position Calculation

### PR-006: WebSocket Reliability (P1)
- A-016: Cache Timer Resource Leak
- A-017: Graceful Shutdown Race Conditions

### PR-007: Paper Trading Enhancements (P1)
- A-019: Paper Trading Partial Fill Simulation Missing
- A-020: Slippage Calculation Incorrect

### PR-008: Circuit Breaker & Resilience (P1)
- A-012: Error Swallowing in Strategy Execution
- A-018: Circuit Breaker Does Not Auto-Reset
- A-023: Missing Jitter in Backoff Calculation

### PR-009: Observability & Metrics (P1)
- A-027: Missing Metrics for Observability

### PR-010: Logging & Privacy (P2)
- A-022: Potential Logging Information Exposure

### PR-011: Test Coverage Expansion (P1)
- A-025: Insufficient Test Coverage

## References

- **Audit Report:** [REPORTS/AUDIT.md](../../REPORTS/AUDIT.md)
- **Gap Analysis:** [REPORTS/GAP_ANALYSIS.md](../../REPORTS/GAP_ANALYSIS.md)
- **PR Plan:** [docs/small-pr-plan.md](../../docs/small-pr-plan.md)
- **Parent Issue:** #23 (🚀 Polymarket Bot - Complete Production Audit & Learning System)
`;

  return index;
}

main().catch(console.error);
