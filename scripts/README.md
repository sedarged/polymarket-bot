# Automation Scripts Guide

**Purpose:** Helper scripts to automate verification, quality checks, and documentation validation for AI agents and contributors.

## Overview

This repository includes several automation scripts to streamline the development workflow and ensure code quality:

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `verify-codespaces.sh` | Automated Codespaces verification | Before creating/updating PRs |
| `quality-check.sh` | Pre-commit quality checks | Before committing code |
| `check-docs-links.sh` | Validate documentation links | After updating docs |
| `verify-deployment.sh` | Deployment verification | After deploying to staging/production |

---

## Script 1: Codespaces Verification Helper

**Location:** `scripts/verify-codespaces.sh`

**Purpose:** Automates the verification checklist for Codespaces testing.

### What It Checks

- ✅ Environment setup (Node.js, npm, .env file)
- ✅ Dependencies installation
- ✅ Build success
- ✅ Test execution
- ✅ CLI commands (markets, book)
- ✅ Security (secret scanning, npm audit, paper trading mode)

### Usage

```bash
# Run from repository root
./scripts/verify-codespaces.sh
```

### Output

- Colored output showing pass/fail for each check
- Summary at the end with action items
- Detailed logs saved to `/tmp/` for review:
  - `/tmp/build-output.txt`
  - `/tmp/test-output.txt`
  - `/tmp/markets-output.txt`
  - `/tmp/audit-output.txt`

### Example Output

```
╔══════════════════════════════════════════════════════════╗
║  Polymarket Bot - Codespaces Verification Helper        ║
╚══════════════════════════════════════════════════════════╝

=== Section 1: Environment Setup Verification ===

✓ Node.js version: v20.11.0
✓ npm version: 10.2.4
✓ .env file exists
✓ LIVE_TRADING=false (paper trading mode)
✓ Dependencies installed (150 packages)

=== Section 2: Build & Test Verification ===

✓ Build completed successfully
✓ All tests passed

[... more output ...]

═══════════════════════════════════════════════════════════
✓ Basic verification passed!

Next steps:
  1. Review full output above
  2. Complete manual sections (Backend API, Frontend, WebSocket)
  3. See docs/CODESPACES_VERIFICATION_CHECKLIST.md for complete checklist
  4. Add all proof to your PR description
```

### When to Use

- **Before creating a PR** - Verify all basic checks pass
- **After making changes** - Ensure changes don't break verification
- **In Codespaces** - Quick automated verification of environment

### What It Doesn't Check

This script automates basic checks only. You still need to manually verify:
- Backend API endpoints (requires server running)
- Frontend dashboard (requires UI testing)
- WebSocket connectivity (requires server running)

See [CODESPACES_VERIFICATION_CHECKLIST.md](../docs/CODESPACES_VERIFICATION_CHECKLIST.md) for the complete checklist.

---

## Script 2: Pre-Commit Quality Check

**Location:** `scripts/quality-check.sh`

**Purpose:** Runs comprehensive quality checks before committing code.

### What It Checks

- ✅ TypeScript type checking (`npm run build`)
- ✅ ESLint linting (`npm run lint`)
- ✅ Unit tests (`npm test`)
- ✅ Secret detection (hardcoded passwords, keys, tokens)
- ✅ Dependency security audit (`npm audit`)
- ✅ `.env` file not staged

### Usage

```bash
# Run from repository root
./scripts/quality-check.sh

# Exit codes:
# 0 = All checks passed
# 1 = One or more checks failed
```

### Example Usage in Workflow

```bash
# Before committing
./scripts/quality-check.sh

# If checks pass, commit
git add .
git commit -m "feat: add new feature"

# If checks fail, fix issues first
# Review /tmp/*-output.txt for details
```

### Output

```
╔══════════════════════════════════════════════════════════╗
║  Code Quality Check                                      ║
╚══════════════════════════════════════════════════════════╝

=== TypeScript Type Check ===
✓ Type check passed

=== ESLint Check ===
✓ Linting passed

=== Unit Tests ===
✓ All tests passed
  Test Files  41 passed (41)
  Tests  704 passed (704)

=== Secret Detection ===
✓ No obvious secrets detected

=== Dependency Security Audit ===
✓ No high/critical vulnerabilities

═══════════════════════════════════════════════════════════
✓ All quality checks passed!

Ready to commit. Remember to:
  - Use conventional commit format (feat:, fix:, docs:, etc.)
  - Keep commits small and focused
  - Run 'scripts/verify-codespaces.sh' before creating PR
```

### When to Use

- **Before every commit** - Catch issues early
- **After code changes** - Verify changes don't break anything
- **Before pushing** - Final check before sharing code

### Integration with Git Hooks (Optional)

You can set up as a pre-commit hook:

```bash
# Create .git/hooks/pre-commit
#!/bin/bash
./scripts/quality-check.sh
```

---

## Script 3: Documentation Link Checker

**Location:** `scripts/check-docs-links.sh`

**Purpose:** Validates internal links in markdown documentation.

### What It Checks

- ✅ All internal links in `.md` files
- ✅ Link targets exist
- ✅ Relative paths are correct

### Usage

```bash
# Check all documentation
./scripts/check-docs-links.sh

# Exit codes:
# 0 = All links valid
# 1 = Broken links found
```

### Example Output

```
╔══════════════════════════════════════════════════════════╗
║  Documentation Link Checker                             ║
╚══════════════════════════════════════════════════════════╝

Checking markdown files for broken internal links...

✗ Broken link in ./docs/README.md
  Link: ./missing-file.md
  Target: /path/to/docs/missing-file.md

═══════════════════════════════════════════════════════════
Checked 127 internal links

✗ Found 1 broken link(s)

Fix broken links before committing documentation changes.
```

### When to Use

- **After updating documentation** - Verify all links work
- **After renaming/moving files** - Check for broken references
- **Before creating PR** - Ensure documentation quality

### Skipped Links

The script automatically skips:
- External links (`http://`, `https://`)
- Anchor links within the same file (`#section`)
- Node modules and git directories

---

## Script 4: Deployment Verification

**Location:** `scripts/verify-deployment.sh`

**Purpose:** Verifies that a deployment to staging or production is healthy and functioning correctly.

### What It Checks

- ✅ Health endpoint returns 200 OK
- ✅ Metrics endpoint returns Prometheus format
- ✅ API endpoints are accessible
- ✅ Configuration is correct for environment
- ✅ Data persistence is working
- ✅ Logging is accessible
- ✅ No secrets exposed
- ✅ HTTPS in production
- ✅ Monitoring and alerting configured
- ✅ Response times are acceptable

### Usage

```bash
# Verify local deployment
./scripts/verify-deployment.sh staging

# Verify remote deployment
./scripts/verify-deployment.sh production https://prod.example.com

# With SSH access for detailed checks
SSH_HOST=user@prod.example.com ./scripts/verify-deployment.sh production https://prod.example.com
```

### Arguments

1. **Environment** (required): `staging` or `production`
2. **Base URL** (optional): Defaults to `http://localhost:3000`

### Environment Variables

- `SSH_HOST` - SSH host for detailed checks (e.g., `user@server.example.com`)
- `TIMEOUT` - Request timeout in seconds (default: 10)

### Example Output

```
================================================
Deployment Verification Script
================================================

Environment: production
Base URL: https://prod.example.com
Timeout: 10s

━━━ Prerequisites ━━━
✓ curl is installed
✓ jq is installed

━━━ Health Check ━━━
✓ Health endpoint returns 200 OK
✓ Health response has valid JSON with status: ok

━━━ Metrics Endpoint ━━━
✓ Metrics endpoint returns 200 OK
✓ Metrics endpoint returns Prometheus format
✓ HTTP request metrics present

━━━ API Endpoints ━━━
✓ Markets API endpoint accessible
✓ Status API endpoint exists

━━━ Configuration ━━━
✓ LIVE_TRADING is enabled (production)

━━━ Data Persistence ━━━
✓ Data directory exists on deployment server
✓ Database files found in data directory

━━━ Logging ━━━
✓ Can access application logs
✓ No critical errors in recent logs

━━━ Security Checks ━━━
✓ No obvious secrets in health endpoint
✓ Using HTTPS in production

━━━ Monitoring ━━━
⊘ Alert testing requires authentication

━━━ Performance ━━━
✓ Health endpoint response time: 127ms (good)

━━━ Summary ━━━

Total checks: 20
Passed: 17
Failed: 0
Skipped: 3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Deployment verification PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### When to Use

- **After deployment to staging** - Verify deployment succeeded
- **After deployment to production** - Critical verification before considering deployment complete
- **After rollback** - Verify rollback restored functionality
- **During incident response** - Quick health check
- **Regular monitoring** - Scheduled verification checks

### Integration with CI/CD

The deployment workflow automatically runs this script:

```yaml
- name: Verify deployment
  run: |
    ./scripts/verify-deployment.sh production ${{ vars.PRODUCTION_URL }}
```

Manual verification after CI/CD deployment:

```bash
# After automated deployment completes
./scripts/verify-deployment.sh production https://prod.example.com

# With SSH for comprehensive checks
SSH_HOST=deploy@prod.example.com \
  ./scripts/verify-deployment.sh production https://prod.example.com
```

### Exit Codes

- `0` - All critical checks passed
- `1` - One or more critical checks failed

### Troubleshooting

**Issue:** Health endpoint check fails

```bash
# Check if service is running
ssh server.example.com "docker ps | grep polymarket-bot"

# Check container logs
ssh server.example.com "docker logs --tail 50 polymarket-bot"

# Verify port is accessible
curl -v https://prod.example.com/health
```

**Issue:** Database files not found

```bash
# Check data directory
ssh server.example.com "ls -la /app/data"

# Verify volume mount
ssh server.example.com "docker inspect polymarket-bot | jq '.[0].Mounts'"
```

**Issue:** Response time too slow

```bash
# Check resource usage
ssh server.example.com "docker stats polymarket-bot --no-stream"

# Check for errors
ssh server.example.com "docker logs polymarket-bot | grep -i error | tail -20"
```

### Related Documentation

- [Deployment Guide](../docs/deployment-guide.md) - Complete deployment procedures
- [Runbook](../docs/runbook.md) - Operational procedures
- [Troubleshooting](../docs/troubleshooting.md) - Problem resolution

---

## Workflow Integration

### For AI Agents

**Recommended workflow:**

```bash
# Phase 1: Research (no scripts needed)
# ... explore code, understand patterns ...

# Phase 2: Planning (no scripts needed)
# ... create plan, identify changes ...

# Phase 3: Implementation
# After each small change:
./scripts/quality-check.sh
# If pass, commit with report_progress

# Phase 4: Comprehensive Testing
# Full verification before finalizing:
./scripts/verify-codespaces.sh

# Phase 5: Documentation Updates
# After updating docs:
./scripts/check-docs-links.sh

# Phase 6: Final PR Preparation
# Run all checks:
./scripts/quality-check.sh && \
./scripts/verify-codespaces.sh && \
./scripts/check-docs-links.sh
```

### For Human Contributors

**Quick pre-commit flow:**

```bash
# 1. Make changes
# 2. Quick quality check
./scripts/quality-check.sh

# 3. If passed, commit
git add .
git commit -m "feat: your change"

# 4. Before creating PR
./scripts/verify-codespaces.sh
```

---

## Script Configuration

### Environment Variables

Scripts respect these environment variables:

- `CI=true` - Adjusts output for CI environments
- `NO_COLOR=1` - Disables colored output
- `SKIP_TESTS=1` - Skip test execution (quality-check only)

### Customization

Scripts can be customized by editing them directly. Common customizations:

**Add custom checks:**
```bash
# In quality-check.sh, add new section:
log_section "Custom Check"
if your-command; then
    log_success "Custom check passed"
else
    log_error "Custom check failed"
    FAILURES=$((FAILURES + 1))
fi
```

**Adjust timeouts:**
```bash
# In verify-codespaces.sh
timeout 30 npm run markets  # Increase from 10 to 30 seconds
```

---

## Troubleshooting

### Script Won't Run

**Issue:** `Permission denied`

**Solution:**
```bash
chmod +x scripts/*.sh
```

### Build/Test Failures

**Issue:** Scripts fail but CI passes

**Solution:**
1. Check for pre-existing documented failures in `docs/environment.md` and `docs/testing.md`
2. Compare your failures to documented ones
3. Only NEW failures should block commits

### Secret Detection False Positives

**Issue:** Script detects "secrets" that aren't real

**Solution:**
1. Review the flagged lines
2. If legitimate, ensure they're test data or examples
3. Consider adding exceptions to the script if needed

### Links Check Failures

**Issue:** Valid links reported as broken

**Solution:**
1. Check if path is correct relative to the markdown file
2. Verify file exists at the target location
3. Check for typos in filename

---

## CI/CD Integration

These scripts are designed to work in CI environments:

### GitHub Actions

```yaml
- name: Run quality checks
  run: ./scripts/quality-check.sh

- name: Verify Codespaces setup
  run: ./scripts/verify-codespaces.sh

- name: Check documentation links
  run: ./scripts/check-docs-links.sh
```

### Exit Codes

All scripts use standard exit codes:
- `0` - Success, all checks passed
- `1` - Failure, one or more checks failed
- `>1` - Script error

---

## Maintenance

### Updating Scripts

When updating scripts:
1. Test changes locally first
2. Update this documentation
3. Test in Codespaces
4. Commit with conventional commit message:
   ```bash
   git commit -m "chore: improve verification script output"
   ```

### Adding New Checks

To add new checks to scripts:
1. Add to appropriate section
2. Update this documentation
3. Test thoroughly
4. Consider performance impact

---

## Related Documentation

- [CODESPACES_VERIFICATION_CHECKLIST.md](../docs/CODESPACES_VERIFICATION_CHECKLIST.md) - Complete verification checklist
- [AI_AGENT_WORKFLOW.md](../docs/AI_AGENT_WORKFLOW.md) - AI agent workflow guide
- [DEV_WORKFLOW.md](../docs/DEV_WORKFLOW.md) - Development workflow and doc maintenance
- [testing.md](../docs/testing.md) - Testing strategy and guidelines

---

## Quick Reference

```bash
# Pre-commit
./scripts/quality-check.sh

# Pre-PR
./scripts/verify-codespaces.sh

# After doc changes
./scripts/check-docs-links.sh

# After deployment
./scripts/verify-deployment.sh production https://prod.example.com

# Full verification (before PR)
./scripts/quality-check.sh && \
./scripts/verify-codespaces.sh && \
./scripts/check-docs-links.sh

# Full deployment verification (after deploy)
./scripts/verify-deployment.sh production https://prod.example.com
```

---

**Last Updated:** 2026-02-09  
**Scripts Version:** 1.0  
**Maintained By:** Repository contributors
