# PR Execution Guide

This guide provides practical instructions for implementing the [Small PR Implementation Plan](./small-pr-plan.md).

## Quick Start

### For AI Agents

1. **Read the full plan:** [Small PR Implementation Plan](./small-pr-plan.md)
2. **Check current status:** [STATUS.md](../STATUS.md)
3. **Pick the next PR:** Follow the dependency graph
4. **Execute the PR:** Follow the template below
5. **Collect evidence:** Use the evidence template
6. **Update status:** Add issue labels so STATUS automation can track progress

### For Human Developers

1. Review the [Small PR Plan](./small-pr-plan.md)
2. Create a branch: `git checkout -b pr-NNN-description`
3. Implement changes following acceptance criteria
4. Run tests: `npm test`
5. Collect evidence (see below)
6. Create PR with evidence
7. Request review

---

## PR Execution Template

### Step 1: Preparation

```bash
# Ensure you're on the latest main branch
git checkout main
git pull origin main

# Create a new branch for the PR
git checkout -b pr-001-critical-security-fixes

# Verify baseline tests pass
npm install
npm test

# Review the PR plan
cat docs/small-pr-plan.md | grep -A 50 "PR-001"
```

### Step 2: Implementation

Follow the **Changes** section for your PR from the plan:

1. **Read** all linked documentation
2. **Understand** the acceptance criteria
3. **Implement** minimal changes
4. **Test** as you go (don't wait until the end)
5. **Document** as you implement

**Key Principles:**
- Make the smallest changes that satisfy acceptance criteria
- Don't fix unrelated issues
- Write tests for new behavior
- Update documentation inline with code changes

### Step 3: Testing

```bash
# Run tests frequently during development
npm test

# Run specific test file
npm test -- tests/unit/specific.test.ts
# Or: tests/integration/... or tests/backtest/...

# Run with coverage
npm test -- --coverage

# Run linter
npm run lint

# Run type checker
npm run build
```

### Step 4: Evidence Collection

Create a file `PR-001-EVIDENCE.md` with this content:

```markdown
# PR-001: Critical Security Fixes - Evidence

## Test Results

\`\`\`bash
$ npm test
[paste full output showing all tests passing]

Test Files  13 passed (13)
     Tests  116 passed (116)
   Duration  2.75s
\`\`\`

## Build Verification

\`\`\`bash
$ npm run build
[paste output showing successful build]
\`\`\`

## Lint Check

\`\`\`bash
$ npm run lint
[paste output - should be clean]
\`\`\`

## Functional Validation

### Kill Switch Persistence Test

\`\`\`bash
# Start bot
$ npm run dev &
[1] 12345

# Activate kill switch (requires admin token)
$ curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/kill-switch
{"success": true, "message": "Kill switch activated"}

# Verify kill switch state file created
$ cat data/kill-switch-state.json
{"active": true, "timestamp": "2026-02-01T12:00:00Z"}

# Stop bot
$ kill "$PID"

# Restart bot
$ npm run dev &
PID=$!

# Verify kill switch still active (check logs or status endpoint)
$ curl http://localhost:3000/status
{"killSwitch": "active", "trading": "disabled"}
\`\`\`

### CORS Configuration Test

\`\`\`bash
# Verify CORS restricted
$ curl -H "Origin: https://evil.com" \
  -I http://localhost:3000/health

# Should NOT include Access-Control-Allow-Origin: *
# Should include specific origin or no CORS header
\`\`\`

### Secrets Management Test

\`\`\`bash
# Verify private key not in plaintext logs
$ grep -r "PRIVATE_KEY" logs/
# Should show no matches or only encrypted references

# Verify secret manager integration (check config source, not the key itself)
$ node -e "const { parseConfig } = require('./apps/backend/dist/config'); const cfg = parseConfig(); console.log('Private key source:', cfg.privateKey ? 'configured' : 'missing')"
# Should confirm key is configured without revealing the value
\`\`\`

## Security Checklist

- [x] No secrets committed to git
- [x] Private key encrypted or in vault
- [x] Kill switch persists across restarts
- [x] CORS restricted to allowed origins
- [x] No new vulnerabilities introduced
- [x] Audit findings A-001, A-002, A-003 resolved

## Acceptance Criteria

- [x] Private keys encrypted at rest or in secure vault
- [x] Kill switch survives process restart
- [x] CORS restricted to specific origins
- [x] All related tests pass
- [x] Security documentation updated
- [x] ADR created for secrets management approach

## Files Modified

- apps/backend/src/config/index.ts
- apps/backend/src/trading/riskManager.ts
- apps/backend/src/server/index.ts
- docs/adr/0004-secrets-management.md (new)
- docs/runbook.md
- .env.example

## New Dependencies

\`\`\`json
{
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.x.x"
  }
}
\`\`\`

## Documentation Updates

- Added ADR-0004 for secrets management strategy
- Updated runbook with kill switch recovery procedures
- Updated .env.example with new CORS configuration
- Added secrets management section to security docs

## Performance Impact

- Kill switch check: <1ms overhead per order
- Secrets fetch (cached): <5ms on startup
- CORS check: Negligible (<1ms per request)

## Breaking Changes

- **Behavior change:** `ALLOWED_ORIGINS` environment variable is now supported; if unset, CORS defaults to `http://localhost:3000`
- **BREAKING:** Kill switch state file required in `data/` directory
- **Migration:** See docs/migration-log.md for upgrade guidance

## Screenshots

[If applicable, attach screenshots of UI changes, dashboards, etc.]

## Additional Notes

- Kill switch state file location: `data/kill-switch-state.json`
- Ensure `data/` directory exists and is writable
- For production, configure AWS Secrets Manager credentials
- CORS defaults to `localhost:3000` if not configured
```

### Step 5: Create Pull Request

```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "PR-001: Critical security fixes

- Implement secrets manager integration for private keys
- Add kill switch persistence to disk
- Restrict CORS to configured origins

Resolves audit findings A-001, A-002, A-003
Addresses issue #32"

# Push to GitHub
git push origin pr-001-critical-security-fixes
```

Create PR on GitHub with:
- **Title:** `PR-001: Critical Security Fixes`
- **Description:** Paste your evidence file
- **Labels:** `P0`, `security`, `audit-fix`
- **Reviewers:** Assign maintainers
- **Linked Issues:** #32

### Step 6: Address Review Feedback

```bash
# Make requested changes
# Test again
npm test

# Commit additional changes
git add .
git commit -m "Address review feedback: Add validation for secrets path"

# Push update
git push origin pr-001-critical-security-fixes
```

### Step 7: Merge

Once approved:
1. **Squash and merge** on GitHub
2. Delete branch
3. Update STATUS.md (via issue labels)
4. Move to next PR

---

## Evidence Collection Checklist

For every PR, collect and include:

### Required Evidence

- [ ] **Full test output** showing all tests passing
- [ ] **Build output** showing successful compilation
- [ ] **Lint output** showing no warnings or errors
- [ ] **Functional validation** with commands and output
- [ ] **Security checklist** completed
- [ ] **Acceptance criteria** all checked off
- [ ] **Files modified** list
- [ ] **Documentation updates** summary

### Optional Evidence

- [ ] **Screenshots** (for UI changes)
- [ ] **Performance metrics** (for performance-sensitive changes)
- [ ] **Before/after comparisons** (for fixes)
- [ ] **Load test results** (for scalability changes)
- [ ] **Security scan results** (for security PRs)

### Evidence Storage

- Create a local `PR-NNN-EVIDENCE.md` file using the template above
- Use it as a working scratchpad while implementing the PR
- When opening or updating the PR, paste the contents into the PR description
- Do **not** commit the evidence file to the repo (evidence lives in the PR description)

---

## Common Issues & Solutions

### Issue: Tests failing

**Symptom:** `npm test` fails

**Solutions:**
1. Run `npm install` to ensure dependencies are up to date
2. Check if tests were already failing in main branch
3. Review test output for specific failures
4. Run individual test files to isolate issue
5. Check if new code breaks existing tests

### Issue: Build errors

**Symptom:** TypeScript compilation fails

**Solutions:**
1. Run `npm run build` to see full error output
2. Check for type mismatches
3. Ensure all imports are correct
4. Verify new types are properly defined
5. Check `tsconfig.json` configuration

### Issue: Lint warnings

**Symptom:** `npm run lint` reports issues

**Solutions:**
1. Auto-fix: `npm run lint -- --fix`
2. Review unfixed warnings
3. Update code to match style guide
4. Add `eslint-disable` comments only if necessary
5. Document reasons for exceptions

### Issue: Evidence incomplete

**Symptom:** Reviewer requests more evidence

**Solutions:**
1. Review evidence checklist
2. Re-run validation steps
3. Capture missing output
4. Add screenshots if applicable
5. Update PR description

### Issue: Acceptance criteria unclear

**Symptom:** Unsure if criteria met

**Solutions:**
1. Review PR plan section carefully
2. Check linked documentation
3. Ask for clarification in PR comments
4. Consult audit findings for context
5. Review similar past PRs

---

## PR Review Process

### For Reviewers

When reviewing a PR, check:

1. **Evidence provided:**
   - All required evidence present
   - Tests passing
   - Functional validation complete

2. **Acceptance criteria:**
   - All criteria met
   - Behavior matches specification

3. **Code quality:**
   - Minimal changes (surgical edits)
   - No unrelated changes
   - Clear, readable code
   - Proper error handling

4. **Tests:**
   - New behavior tested
   - Edge cases covered
   - Tests are meaningful

5. **Documentation:**
   - Code comments where needed
   - README/docs updated
   - CHANGELOG updated
   - ADR if architectural

6. **Security:**
   - No secrets committed
   - No new vulnerabilities
   - Audit findings addressed

### Review Checklist

Use this in PR review comments:

```markdown
## Review Checklist

- [ ] Evidence complete and convincing
- [ ] All acceptance criteria met
- [ ] Tests comprehensive and passing
- [ ] Code quality high (minimal, clear changes)
- [ ] Documentation updated
- [ ] No security issues
- [ ] CHANGELOG updated
- [ ] Follows coding standards
- [ ] No unrelated changes
- [ ] Ready to merge

## Comments

[Add specific feedback here]

## Verdict

- [ ] Approved
- [ ] Approved with minor suggestions
- [ ] Changes requested
- [ ] Blocked (explain why)
```

---

## Automation Support

### GitHub Actions

The following checks run automatically:

1. **Tests:** Runs `npm test` on every push
2. **Lint:** Runs `npm run lint`
3. **Build:** Verifies `npm run build` succeeds
4. **Coverage:** Reports test coverage
5. **Security:** Scans for vulnerabilities

### Local Pre-Commit Hooks

Set up pre-commit hooks:

```bash
# Create .git/hooks/pre-commit
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
set -e

echo "Running pre-commit checks..."

# Run tests
npm test

# Run lint
npm run lint

# Run build
npm run build

echo "All pre-commit checks passed!"
EOF

chmod +x .git/hooks/pre-commit
```

---

## Progress Tracking

### For AI Agents

Update issue/PR labels so STATUS automation can track progress:

1. Add `in-progress` label when starting work
2. Remove `in-progress` and add completion notes when done
3. STATUS.md updates automatically via GitHub Actions (every 6 hours or on issue changes)

### For Humans

Update STATUS.md by:
1. Adding `in-progress` label to issue
2. Waiting for automation (6 hours)
3. Or triggering workflow manually

---

## Success Criteria

### Per-PR Success

✅ PR is successful when:
- All acceptance criteria met
- All tests passing
- Evidence provided
- Reviewed and approved
- Merged to main
- Referenced in CHANGELOG

### Overall Success

✅ Implementation is complete when:
- All 13 PRs merged
- All audit findings resolved
- Test coverage >80%
- Documentation complete
- Production readiness checklist passed

---

## Resources

### Documentation
- [Small PR Plan](./small-pr-plan.md) - The master plan
- [Implementation Checklist](./implementation-checklist.md) - Detailed tasks
- [Security Audit](../REPORTS/AUDIT.md) - Findings to address
- [AGENTS.md](../AGENTS.md) - Guidelines and standards

### Templates
- [Evidence Template](#step-4-evidence-collection) - This document
- [Review Checklist](#review-checklist) - This document
- [ADR Examples](./adr/) - For architectural decisions

### Tools
- `npm test` - Run tests
- `npm run lint` - Run linter
- `npm run build` - Build TypeScript
- `npm run dev` - Start development server

---

## Questions?

- **Unclear acceptance criteria?** Check the [Small PR Plan](./small-pr-plan.md) or ask in issue comments
- **Technical issues?** Review [Common Pitfalls](./ai/common-pitfalls.md)
- **Architecture questions?** Check [Architecture Docs](./architecture.md) or create an ADR
- **Process questions?** Refer to [AGENTS.md](../AGENTS.md)

---

**Last Updated:** 2026-02-01  
**Maintained By:** Development Team  
**Version:** 1.0
