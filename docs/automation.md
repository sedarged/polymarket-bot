# Automation Guide

This guide explains all GitHub automations for the Polymarket Trading Bot. These automations ensure code quality, security, and streamlined development for a production trading bot handling real money.

## Table of Contents

- [CI/CD Pipeline](#cicd-pipeline)
- [Deployment Workflow](#deployment-workflow)
- [Bug Report Template](#bug-report-template)
- [Release Please](#release-please)
- [Dependabot Security Monitoring](#dependabot-security-monitoring)
- [PR Automation](#pr-automation)
- [Stale Issue Management](#stale-issue-management)
- [Conventional Commits](#conventional-commits)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

---

## CI/CD Pipeline

**Workflow:** `.github/workflows/ci.yml`

### What It Does

Runs automatically on **every push** and **every pull request** to ensure code quality and security:

1. **Test & Build Job:**
   - Installs dependencies (`npm ci`)
   - Type checks the entire codebase (`npm run build`)
   - Runs backend tests by category: unit, integration, backtest (`npm run test:unit`, `test:integration`, `test:backtest`)
   - Generates test coverage report (optional)

2. **Security Check Job:**
   - Runs `npm audit` to check for dependency vulnerabilities
   - Scans code for hardcoded secrets using TruffleHog

### Why It's Critical

This is the **first-ever CI/CD pipeline** for this trading bot. Previously, there was **no automated testing** on PRs or pushes. With 27 security audit findings (3 CRITICAL, 8 HIGH), automated testing is essential to prevent bugs from reaching production.

### How to Fix Failures

**Type Check Failures:**
```bash
# Run locally to see errors
npm run build

# Fix TypeScript errors in the reported files
# Common issues: missing types, type mismatches, unused variables
```

**Test Failures:**
```bash
# Run tests locally
npm test

# Run specific test file
npm test -- orderbook.test.ts

# Run with watch mode for iterative fixes
npm run test:watch
```

**Security Audit Failures:**
```bash
# Check locally
npm audit --audit-level=high

# Fix vulnerabilities
npm audit fix

# Update specific package
npm update <package-name>

# Check Dependabot PRs - they often fix these automatically
```

**Secret Detection Failures:**
- Remove any hardcoded API keys, private keys, or wallet addresses
- Use environment variables instead (see `.env.example`)
- Never commit `.env` files
- If secrets were committed, rotate them immediately

### Local Testing Before Push

**Always run these commands before pushing:**

```bash
# Install dependencies
npm ci

# Type check
npm run build

# Run tests
npm test

# Security audit
npm audit --audit-level=high
```

---

## Deployment Workflow

**Workflow:** `.github/workflows/deploy.yml`

### What It Does

Automated deployment pipeline for staging and production environments:

1. **Pre-deployment Validation:**
   - Type checking (`npm run build`)
   - Unit and integration tests
   - Security audit (`npm audit`)
   - Secret scanning (TruffleHog)

2. **Docker Image Build:**
   - Multi-arch build (amd64, arm64)
   - Push to GitHub Container Registry (GHCR)
   - Optional: Docker Hub, AWS ECR
   - Security scanning with Trivy
   - Upload scan results to GitHub Security

3. **Staging Deployment:**
   - Automatically deploys on push to `main`
   - Supports SSH, Kubernetes, ECS, Docker Compose
   - Health check verification
   - Smoke tests

4. **Production Deployment:**
   - Manual trigger only
   - Requires approval from designated reviewers
   - Zero-downtime deployment
   - Comprehensive verification
   - Read-only smoke tests

5. **Rollback Capability:**
   - Rollback to any previous version
   - Automated or manual rollback
   - Verification after rollback

### Deployment Triggers

| Trigger | Environment | Approval | Notes |
|---------|-------------|----------|-------|
| Push to `main` | Staging | None | Automatic |
| Manual dispatch | Staging | None | On-demand |
| Manual dispatch | Production | Required | Minimum 2 reviewers |
| Rollback | Any | Required (prod only) | Specify version tag |

### How to Deploy

**To Staging (Automatic):**
```bash
# Simply merge your PR to main
git checkout main
git pull
# Staging deployment triggers automatically
```

**To Production (Manual):**
1. Go to **Actions → Deploy**
2. Click **Run workflow**
3. Select:
   - Branch: `main`
   - Environment: `production`
   - Skip tests: `false`
4. Wait for approval request
5. Review and approve deployment
6. Monitor deployment progress

**To Rollback:**
1. Go to **Actions → Deploy**
2. Click **Run workflow**
3. Select:
   - Branch: `main`
   - Environment: `production`
   - Rollback: `v1.2.3` (specify version)
4. Approve rollback (if production)

### Required Secrets

Configure in GitHub Settings → Secrets and variables → Actions:

**Core Secrets:**
- `SSH_PRIVATE_KEY` - For SSH deployments
- `STAGING_HOST` - Staging server address
- `PRODUCTION_HOST` - Production server address
- `STAGING_PRIVATE_KEY` - Trading wallet for staging
- `PRODUCTION_PRIVATE_KEY` - Trading wallet for production

**Optional:**
- `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` - Docker Hub
- `AWS_ROLE_ARN`, `AWS_REGION` - AWS ECR/ECS
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` - Notifications

### Environment Protection

**CRITICAL:** Configure environment protection in GitHub Settings → Environments:

**Staging:**
- Required reviewers: None
- Wait timer: 0 minutes
- Deployment branches: `main` only

**Production:**
- Required reviewers: Minimum 2 (repository maintainers)
- Wait timer: 5 minutes
- Deployment branches: `main` only

### Verification

After deployment, the workflow automatically:
- Verifies health endpoint
- Checks metrics endpoint
- Runs smoke tests
- Validates configuration

Manual verification:
```bash
# Verify deployment
./scripts/verify-deployment.sh production https://prod.example.com

# Check logs
ssh production.example.com "docker logs --tail 100 polymarket-bot"

# Test endpoints
curl https://prod.example.com/health
curl https://prod.example.com/metrics
```

### Deployment Methods

The workflow supports multiple deployment methods:

1. **SSH Deployment** - SSH to server and update Docker container
2. **Kubernetes** - kubectl set image or helm upgrade
3. **AWS ECS** - Update ECS service with new task definition
4. **Docker Compose** - SSH and docker-compose up with new image

Configure by uncommenting the appropriate section in `deploy.yml`.

### Complete Documentation

For complete deployment procedures, see:
- **[Deployment Guide](./deployment-guide.md)** - Step-by-step instructions
- **[Docker Guide](./docker.md)** - Container deployment
- **[Runbook](./runbook.md)** - Operational procedures

### Security

**Deployment Security Features:**
- Secret scanning before deployment
- Security scanning of Docker images
- SARIF upload to GitHub Security
- Environment-based secret management
- Required approvals for production
- Audit trail of all deployments

**Best Practices:**
1. **Never skip tests** for production deployments
2. **Always require approval** for production
3. **Test in staging first** before production
4. **Use HTTPS** for production deployments
5. **Rotate secrets regularly** (every 30-90 days)
6. **Monitor deployments** for 30+ minutes after production deploy
7. **Have rollback plan ready** before deploying

---

## Bug Report Template

**Template:** `.github/ISSUE_TEMPLATE/bug.yml`

### What It Provides

A structured bug report form with trading-specific fields:

- **Severity**: Critical, High, Medium, Low
- **Area**: Trading Logic, WebSocket, Order Management, etc.
- **Trading Mode**: Paper Trading vs Live Trading (important for severity assessment)
- **Reproduction Steps**: Clear steps to reproduce the bug
- **Logs**: Space for error messages (with reminder to redact sensitive data)
- **Environment**: Node version, OS, deployment method
- **Audit Reference**: Link to known audit findings if applicable

### How to Use

1. Go to **Issues → New Issue**
2. Select **Bug Report**
3. Fill in all required fields
4. **IMPORTANT:** Redact any private keys, API keys, or wallet addresses from logs
5. For security bugs, consider private disclosure instead

### Example

```yaml
Severity: High (major feature broken, money at risk)
Area: Trading Logic
Trading Mode: Paper Trading (default)

Bug Description:
Order placement fails with "Insufficient balance" even when balance is adequate.

Steps to Reproduce:
1. Start bot: `npm run dev`
2. Set TOKEN_IDS=0x123abc in .env
3. Attempt to place buy order for $100
4. Expected: Order placed. Got: "Insufficient balance" error.

Audit Reference:
May be related to A-012 (improper balance calculation)
```

---

## Release Please

**Workflow:** `.github/workflows/release-please.yml`

### What It Does

Automatically manages releases and changelogs based on **conventional commits**:

1. **On every push to `main`:**
   - Analyzes commit messages since the last release
   - Creates or updates a "release PR" with auto-generated CHANGELOG
   - Determines version bump (major/minor/patch) based on commit types

2. **When release PR is merged:**
   - Creates a GitHub release
   - Tags the release (e.g., `v1.2.3`)
   - Builds the project
   - Creates and uploads a release tarball

### How It Works

Release Please uses **conventional commits** to determine what goes in the changelog and how to bump the version:

| Commit Type | Version Bump | In Changelog? | Section |
|-------------|--------------|---------------|---------|
| `feat:` | Minor (1.0.0 → 1.1.0) | Yes | Features |
| `fix:` | Patch (1.0.0 → 1.0.1) | Yes | Bug Fixes |
| `security:` | Patch | Yes | Security |
| `perf:` | Patch | Yes | Performance |
| `refactor:` | Patch | Yes | Code Refactoring |
| `docs:` | Patch | Yes | Documentation |
| `test:` | Patch | Yes | Tests |
| `chore:` | Patch | Yes | Miscellaneous |
| `ci:` | Patch | Yes | CI/CD |
| `feat!:` or `BREAKING CHANGE:` | Major (1.0.0 → 2.0.0) | Yes | Features |

### Example Workflow

1. Developer makes commits:
   ```
   feat: add order cancellation support
   fix: resolve WebSocket reconnection bug
   security: sanitize user inputs (A-015)
   ```

2. Commits are pushed to `main`

3. Release Please creates a PR titled "chore(main): release 1.1.0" with:
   - Auto-generated CHANGELOG.md
   - Version bump in package.json

4. Maintainer reviews and merges the release PR

5. Release Please creates GitHub release v1.1.0 with artifacts

### CRITICAL RULE

**NEVER edit CHANGELOG.md manually!**

Release Please owns this file. Manual edits will be overwritten. Instead:
- Use descriptive conventional commit messages
- Include details in commit body (not just title)
- Reference issue numbers and audit findings

---

## Conventional Commits

**Format:** `<type>: <description>`

### Required Format

```
<type>: <short description>

[optional body]

[optional footer]
```

### Types

- **feat:** New feature (bumps minor version)
- **fix:** Bug fix (bumps patch version)
- **security:** Security fix (bumps patch version, high priority)
- **perf:** Performance improvement
- **refactor:** Code refactoring (no behavior change)
- **docs:** Documentation changes
- **test:** Adding or updating tests
- **chore:** Maintenance (dependencies, build, etc.)
- **ci:** CI/CD changes

### Breaking Changes

For breaking changes (bump major version):

```
feat!: remove deprecated API endpoints

BREAKING CHANGE: The /legacy/api endpoint has been removed. Use /api/v2 instead.
```

### Examples for Trading Bot

**Features:**
```
feat: add kill switch for emergency trading halt
feat: implement order size limits for risk management
```

**Bug Fixes:**
```
fix: prevent double order submission on retry
fix: correct balance calculation in position tracker
```

**Security Fixes:**
```
security: add input validation for order parameters (A-015)
security: remove plaintext private key storage (A-001)
security: implement rate limiting on API endpoints (A-008)
```

**Audit References:**
```
security: fix SQL injection in market query (A-023)

Addresses audit finding A-023 by using parameterized queries
instead of string concatenation. Added tests to verify fix.

See REPORTS/AUDIT.md for details.
```

**Performance:**
```
perf: optimize orderbook update processing
perf: batch WebSocket messages to reduce overhead
```

**Documentation:**
```
docs: add troubleshooting guide for common errors
docs: update API client examples
```

**Tests:**
```
test: add integration tests for order placement
test: increase coverage for wallet module to 95%
```

### Bad Examples (Don't Do This)

```
❌ "updated code"
❌ "fix"
❌ "WIP"
❌ "changes"
❌ "asdf"
```

These don't follow the convention and won't trigger releases or appear in the changelog properly.

---

## Dependabot Security Monitoring

**Config:** `.github/dependabot.yml`

### What It Does

Automatically checks for dependency updates and security vulnerabilities:

1. **Root dependencies:** Daily security scans
2. **Backend workspace:** Daily scans (CRITICAL - handles trading)
3. **Frontend workspace:** Weekly scans
4. **Shared package:** Weekly scans
5. **GitHub Actions:** Monthly scans

### Scan Schedule

| Component | Frequency | Priority | Reason |
|-----------|-----------|----------|--------|
| Root + Backend | Daily | CRITICAL | Trading code, security vulnerabilities |
| Frontend | Weekly | Medium | User interface, less critical |
| Shared | Weekly | Medium | Common utilities |
| GitHub Actions | Monthly | Low | Infrastructure |

### How to Handle Dependabot PRs

**Security Updates (HIGH PRIORITY):**

1. Dependabot creates PR titled: "Bump axios from 1.2.0 to 1.2.1 in /apps/backend"
2. Review the PR description for CVE details
3. Check if it's a security update (labeled `security`)
4. **Merge immediately** if:
   - It's a patch or minor version bump
   - CI passes
   - No breaking changes mentioned

**Non-Security Updates:**

1. Review changelog for breaking changes
2. Check if tests pass
3. Test locally if it affects trading logic:
   ```bash
   npm ci
   npm test
   npm run dev
   ```
4. Merge if safe

**Grouped Updates:**

Dependabot groups related updates (e.g., all security patches). Review and merge as a batch.

### Weekly Review

Set a weekly reminder to:
1. Check open Dependabot PRs
2. Merge security updates immediately
3. Review and merge non-security updates
4. Close outdated PRs (Dependabot will recreate)

---

## PR Automation

**Workflow:** `.github/workflows/pr-automation.yml`

### What It Does

Automatically enhances PRs with:

1. **Auto-labeling** based on changed files:
   - `backend`, `frontend`, `api-client`
   - `websocket`, `trading`, `documentation`
   - `testing`, `ci/cd`, `security`

2. **Security review flags** for sensitive files:
   - Trading logic (`trading`, `order`)
   - API clients (`clob`)
   - Credentials (`.env`, `private-key`, `wallet`)
   - Safety features (`kill-switch`)

3. **Size labeling:**
   - `size/xs` (<10 changes)
   - `size/s` (10-99 changes)
   - `size/m` (100-499 changes)
   - `size/l` (500-999 changes)
   - `size/xl` (1000+ changes)

4. **Quality checks:**
   - PR description length (minimum 30 characters)
   - Issue linking (e.g., "Closes #123")
   - Test mentions
   - Audit references for security fixes
   - Code changes with test changes

### Security Review Comment

If a PR modifies security-sensitive files, automation adds a comment:

```markdown
🔒 **Security Review Required**

This PR modifies security-sensitive files:
- `apps/backend/src/trading/order-manager.ts`
- `apps/backend/src/clients/clob-client.ts`

**Required checks:**
- [ ] No hardcoded secrets or private keys
- [ ] Proper input validation (Zod schemas)
- [ ] Error handling in place
- [ ] Tests cover security scenarios
- [ ] Review against audit findings (REPORTS/AUDIT.md)
- [ ] Trading logic properly gated (LIVE_TRADING + COMPLIANCE_ACCEPTED)

**Audit References:**
See REPORTS/AUDIT.md for known security findings.
```

### Large PR Warning

For PRs with >500 changes:

```markdown
⚠️ **Large PR Warning**

This PR has **847 changes**. For a trading bot, smaller PRs are safer and easier to review.

**Recommendations:**
- Break into smaller, focused PRs
- Separate refactoring from features
- Keep PRs under 500 lines when possible
- Consider security implications of large changes
```

### Quality Check Example

```markdown
## 📋 PR Quality Check

❌ PR description is too short (minimum 30 characters)
💡 Consider linking to an issue using "Closes #123"
🧪 No mention of tests. Did you add/update tests?
🧪 Code changes without test changes. Trading bot requires high test coverage.

**Note:** These are suggestions to improve PR quality for a production trading bot.
```

---

## Stale Issue Management

**Workflow:** `.github/workflows/stale.yml`

### What It Does

Automatically manages inactive issues and PRs:

**Issues:**
- After 60 days of inactivity: Marked as `stale` with a comment
- After 7 more days: Closed automatically
- Exempt labels: `P0`, `P1`, `in-progress`, `security`, `blocked`

**Pull Requests:**
- After 21 days of inactivity: Marked as `stale`
- After 7 more days: Closed automatically
- Exempt labels: `in-progress`, `security`, `blocked`

### Exemptions

These issues/PRs are **never marked stale:**
- **P0** (critical priority)
- **P1** (high priority)
- **in-progress** (actively being worked on)
- **security** (security issues stay open)
- **blocked** (waiting on external dependency)

### Manual Control

To prevent an issue from going stale:
1. Comment on it (resets the timer)
2. Add an exempt label (`P0`, `P1`, `security`, etc.)
3. Change the label to `in-progress` if you're working on it

To force close a stale issue:
- Just let it time out, or close manually

---

## Security Considerations

### Trading Bot Specific Risks

1. **Order Placement Code:**
   - Double-submission without idempotency
   - Missing live trading gates
   - Incorrect position sizing
   - Race conditions in order management

2. **Credential Handling:**
   - Hardcoded private keys
   - Exposed API keys in logs
   - `.env` files committed to git
   - Secrets in error messages

3. **Input Validation:**
   - Unvalidated order parameters
   - SQL injection in market queries
   - XSS in frontend displays
   - Integer overflow in calculations

4. **WebSocket Security:**
   - Unvalidated market feed data
   - Man-in-the-middle attacks
   - Denial of service via message floods
   - State corruption on reconnect

### Automation Protections

| Risk | Protection | Workflow |
|------|------------|----------|
| Hardcoded secrets | TruffleHog scan | CI |
| Dependency vulnerabilities | npm audit | CI + Dependabot |
| Missing tests | Quality check | PR Automation |
| Large risky changes | Size warning | PR Automation |
| Security-sensitive changes | Review flag | PR Automation |
| Audit finding regressions | Audit reference check | PR Automation |

### Best Practices

1. **Always use environment variables** for secrets
2. **Reference audit findings** in security fixes (e.g., "A-001")
3. **Add tests for security scenarios** (e.g., SQL injection attempts)
4. **Keep PRs small** for easier security review
5. **Review Dependabot PRs immediately** for security updates
6. **Never commit `.env` files** (already in `.gitignore`)

---

## Troubleshooting

### CI Failing on My PR

**Problem:** CI job fails after pushing.

**Solution:**
1. Check the Actions tab to see the error
2. Run the same commands locally:
   ```bash
   npm ci
   npm run build
   npm test
   npm audit --audit-level=high
   ```
3. Fix the errors and push again

### Release Please Not Creating PR

**Problem:** Commits were merged to `main` but no release PR appeared.

**Solution:**
1. Check if commits use conventional format (`feat:`, `fix:`, etc.)
2. Non-conventional commits won't trigger releases
3. Manual fix: Push a properly formatted commit
4. Check the Actions tab for errors

### Dependabot PR Has Conflicts

**Problem:** Dependabot PR shows merge conflicts.

**Solution:**
1. Close the PR (Dependabot will recreate it automatically)
2. Or manually resolve:
   ```bash
   git checkout main
   git pull
   git checkout dependabot/npm_and_yarn/...
   git merge main
   # Resolve conflicts
   git push
   ```

### PR Automation Didn't Add Labels

**Problem:** PR was created but no labels were added.

**Solution:**
1. Check the Actions tab for the PR automation workflow
2. If it failed, check permissions (needs `pull-requests: write`)
3. Manually add labels if needed
4. Re-run the workflow from the Actions tab

### Stale Bot Closed My Active Issue

**Problem:** Issue was closed as stale even though it's still relevant.

**Solution:**
1. Reopen the issue
2. Add a comment to reset the timer
3. Add an exempt label (`P1`, `in-progress`, etc.)
4. Comment periodically to keep it active

### Commit Doesn't Match Convention

**Problem:** Commit message doesn't follow conventional format.

**Solution:**
1. Amend the commit:
   ```bash
   git commit --amend -m "feat: add new feature"
   git push --force
   ```
2. Or create a new commit with the correct format
3. Use `git rebase -i` to edit commit history if needed

### Security Scan False Positive

**Problem:** TruffleHog flags a test fixture as a secret.

**Solution:**
1. Add the file or pattern to `.trufflehogignore`:
   ```
   # Test fixtures
   **/fixtures/**
   **/*.test.ts
   ```
2. Or use the TruffleHog exclusion syntax in the workflow

---

## Examples & Best Practices

### Example: Security Fix PR

**Title:** `security: add input validation for order size (A-015)`

**Body:**
```markdown
Addresses audit finding A-015 (insufficient input validation).

**Changes:**
- Added Zod schema for order parameters
- Validate order size, price, and side
- Reject orders exceeding position limits
- Added comprehensive tests

**Testing:**
- Unit tests for validation logic
- Integration tests with invalid inputs
- Verified rejection of malicious orders

**Audit Reference:** A-015 in REPORTS/AUDIT.md

Closes #45
```

**Commits:**
```
security: add input validation for order size (A-015)

Implements Zod schema validation for all order parameters.
Orders are validated before submission to prevent:
- Invalid order sizes (negative, zero, exceeding limits)
- Invalid prices (negative, zero, unrealistic)
- Missing required fields

Added tests covering edge cases and attack scenarios.
```

### Example: Feature PR

**Title:** `feat: add WebSocket auto-reconnection with exponential backoff`

**Body:**
```markdown
Implements automatic WebSocket reconnection with:
- Exponential backoff (1s → 2s → 4s → 8s → max 60s)
- Jitter to prevent thundering herd
- State resync after reconnection
- Connection health monitoring

**Testing:**
- Simulated network failures
- Verified reconnection logic
- State resync validated
- All tests pass

Closes #32
```

**Commits:**
```
feat: add WebSocket auto-reconnection with exponential backoff

Implements robust reconnection strategy:
- Exponential backoff with jitter
- Automatic state resync on reconnect
- Connection health monitoring
- Graceful degradation on repeated failures

test: add WebSocket reconnection tests

Simulates network failures and verifies:
- Reconnection attempts follow backoff schedule
- State is properly resynced
- No duplicate subscriptions
- Handles edge cases (immediate disconnect, etc.)
```

### Example: Documentation PR

**Title:** `docs: add troubleshooting guide for WebSocket issues`

**Body:**
```markdown
Adds comprehensive troubleshooting guide for common WebSocket issues:
- Connection failures
- Unexpected disconnects
- Missing market data
- State desync

No code changes, documentation only.
```

**Commits:**
```
docs: add troubleshooting guide for WebSocket issues

Covers common issues:
- Firewall/proxy blocking WebSocket connections
- Rate limiting causing disconnects
- Token ID configuration errors
- State synchronization problems

Includes diagnostic commands and solutions.
```

---

## Summary

This automation suite provides:

✅ **CI/CD pipeline** - Automated testing and security checks (CRITICAL - was missing)  
✅ **Bug report template** - Trading-specific structured bug reports  
✅ **Release Please** - Automated changelog and release management  
✅ **Dependabot** - Daily security vulnerability scanning for trading packages  
✅ **PR automation** - Quality checks, labeling, security review flags  
✅ **Stale issue management** - Automated cleanup of inactive issues  

### Key Takeaways

1. **Use conventional commits** - Required for automated releases
2. **Never edit CHANGELOG.md** - It's auto-generated
3. **Merge Dependabot security PRs immediately** - Real money at risk
4. **Reference audit findings** - Use A-XXX format in security commits
5. **Keep PRs small** - Under 500 lines when possible
6. **Add tests with code changes** - Trading bot requires high coverage
7. **Run CI checks locally before pushing** - Faster feedback loop

For more details, see:
- [AGENTS.md](../AGENTS.md) - Full agent guidelines
- [docs/ai/common-pitfalls.md](./ai/common-pitfalls.md) - Common mistakes
- [REPORTS/AUDIT.md](../REPORTS/AUDIT.md) - Security audit findings
