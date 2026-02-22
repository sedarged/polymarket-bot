# Contributing to Polymarket Trading Bot

Thank you for your interest in contributing! This document provides guidelines for creating pull requests and contributing code to the project.

## Quick Start for Contributors

**Before You Start:**
1. Read the [Compliance Guide](./docs/compliance.md) - ⚠️ Legal requirements and restrictions
2. Review [AGENTS.md](./AGENTS.md) - Complete guidelines for contributors (AI and human)
3. Check [STATUS.md](./STATUS.md) - Current work priorities and active tasks

**Essential Documentation:**
- [Development Workflow](./docs/DEV_WORKFLOW.md) - Documentation maintenance requirements
- [Codespaces Setup](./docs/CODESPACES_SETUP.md) - Quick setup guide
- [Architecture Overview](./docs/architecture-overview.md) - How the system works

---

## Pull Request Guidelines

### PR Size & Scope

**Keep PRs Small and Focused:**
- **Target:** Under 500 lines of changes
- **Ideal:** Focus on a single feature, fix, or refactoring
- **Rationale:** Smaller PRs are easier to review, test, and merge safely for trading bot code

**Size Labels (automatically applied):**
- `size/xs` - Under 10 lines
- `size/s` - 10-99 lines  
- `size/m` - 100-499 lines
- `size/l` - 500-999 lines (⚠️ warning comment added)
- `size/xl` - 1000+ lines (⚠️ requires justification)

**When Large PRs Are Necessary:**
If your PR exceeds 500 lines:
1. Explain why it cannot be split in the PR description
2. Consider breaking into multiple sequential PRs
3. Be prepared for longer review times

### PR Requirements

**All PRs Must Include:**

1. **Clear Description** (minimum 30 characters)
   - What problem does this solve?
   - What changes were made?
   - How was it tested?

2. **Issue Link**
   - Use `Closes #123` or `Fixes #456` format
   - Links the PR to the tracked issue

3. **Tests**
   - Add tests for new functionality
   - Update tests for changed behavior
   - Ensure `npm test` passes

4. **Documentation Updates**
   - Update relevant docs when code changes
   - See [DEV_WORKFLOW.md](./docs/DEV_WORKFLOW.md) for requirements
   - Update `.env.example` if adding environment variables

5. **Codespaces Verification** (MANDATORY)
   - Complete the [Codespaces Verification Checklist](./docs/CODESPACES_VERIFICATION_CHECKLIST.md)
   - Add proof/evidence to PR description
   - Ensures changes work in clean environment

6. **Conventional Commits** (REQUIRED)
   - Format: `<type>: <description>`
   - Examples: `feat:`, `fix:`, `docs:`, `test:`, `security:`
   - See [Commit Message Format](#commit-message-format) below

### Pre-Submission Checklist

Before creating a PR:

- [ ] Code builds successfully (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] No TypeScript errors
- [ ] Documentation updated (if applicable)
- [ ] `.env.example` updated (if env vars added)
- [ ] Conventional commit format used
- [ ] Issue linked in PR description
- [ ] Codespaces verification completed

---

## Commit Message Format

**All commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/) format:**

```
<type>: <short description>

[optional body with details]

[optional footer with issue refs]
```

### Commit Types

| Type | When to Use | Version Bump |
|------|-------------|--------------|
| `feat:` | New feature | Minor (1.0.0 → 1.1.0) |
| `fix:` | Bug fix | Patch (1.0.0 → 1.0.1) |
| `security:` | Security fix | Patch (HIGH PRIORITY) |
| `perf:` | Performance improvement | Patch |
| `refactor:` | Code refactoring | Patch |
| `docs:` | Documentation only | Patch |
| `test:` | Test changes | Patch |
| `chore:` | Maintenance tasks | Patch |
| `ci:` | CI/CD changes | Patch |

### Breaking Changes

For breaking changes that require major version bump (1.0.0 → 2.0.0):
- Use `feat!:` or `fix!:`
- Or add `BREAKING CHANGE:` in the footer

### Examples

**Good commit messages:**

```bash
feat: add kill switch for emergency trading halt

Implements emergency stop functionality that cancels all open
orders and halts new order placement until manually re-enabled.

Closes #42
```

```bash
fix: prevent double order submission on retry

Uses client-generated UUIDs to ensure idempotency. Orders are
tracked in memory to prevent duplicate submissions on retry.

Closes #38
```

```bash
security: add input validation for order parameters (A-015)

Implements Zod schema validation for order size, price, and side.
Rejects invalid orders before submission to prevent exploits.

Addresses audit finding A-015 in REPORTS/AUDIT.md.
Added comprehensive tests for edge cases.

Closes #45
```

```bash
docs: update PR guidelines in CONTRIBUTING.md

Clarifies PR size expectations and links to detailed workflow docs.

Closes #123
```

### Security Fixes

**Always reference audit findings in security commits:**
- Use format: `security: <description> (A-XXX)`
- Reference the audit finding number from [AUDIT.md](./REPORTS/AUDIT.md)
- Include details about the fix and testing in the body

---

## Development Workflow

### 1. Pick a Task

1. Check [STATUS.md](./STATUS.md) for current priorities
2. Choose from highest priority unassigned issues
3. Comment on the issue to claim it
4. Add `in-progress` label when starting work

### 2. Set Up Development Environment

**GitHub Codespaces (Recommended):**
```bash
# Open this repo in Codespaces
# Environment is pre-configured
npm install
npm run dev
```

**Local Development:**
```bash
# Clone the repository
git clone https://github.com/sedarged/polymarket-bot.git
cd polymarket-bot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# See docs/environment.md for details

# Verify setup
npm run build
npm test
```

### 3. Make Changes

**Development Commands:**
```bash
npm run dev         # Run backend in development mode
npm run markets     # Fetch and display markets
npm run book        # Display order book
npm test            # Run all tests
npm run build       # Type check entire codebase
npm audit --audit-level=high  # Check for vulnerabilities
```

**Key Principles:**
- Make small, focused changes
- Test as you develop
- Update documentation alongside code
- Follow TypeScript strict mode
- Use structured logging (not console.log)

### 4. Test Your Changes

```bash
# Run targeted tests during development
npm test -- path/to/test.spec.ts

# Run full suite before PR
npm test

# Check test coverage
npm run test:coverage
```

### 5. Complete Codespaces Verification

**MANDATORY for all PRs:**

1. Create a Codespace from your branch
2. Complete the [Codespaces Verification Checklist](./docs/CODESPACES_VERIFICATION_CHECKLIST.md)
3. Collect proof:
   - Terminal output for commands
   - Screenshots for UI changes
   - Test results
4. Add proof to your PR description

This ensures your changes work in a clean environment (no "works on my machine" issues).

### 6. Create Pull Request

**PR Title:** Use conventional commit format
```
feat: add new trading strategy
fix: resolve WebSocket reconnection issue
docs: improve API documentation
```

**PR Description Template:**
```markdown
## Description
Brief description of changes

## Issue
Closes #[issue-number]

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Codespaces verification completed

## Codespaces Verification
[Paste checklist results with proof]

## Documentation
- [ ] Code comments added
- [ ] README.md updated (if needed)
- [ ] docs/ updated (if needed)
- [ ] .env.example updated (if env vars added)
```

---

## Automated PR Checks

**Every PR automatically receives:**

1. **Component Labels:**
   - `backend`, `frontend`, `api-client`
   - `websocket`, `trading`, `documentation`
   - `testing`, `ci/cd`, `security`

2. **Size Label:**
   - Automatically calculated from changes
   - Warning comment if >500 lines

3. **Security Review Flag:**
   - Triggered by changes to sensitive files
   - Trading logic, API clients, credentials
   - Kill switch, wallet code

4. **Quality Checks:**
   - Description length (min 30 chars)
   - Issue linking required
   - Test mentions encouraged

5. **CI/CD Pipeline:**
   - Type checking (`npm run build`)
   - Test suite (`npm test`)
   - Security audit (`npm audit`)
   - Secret scanning (TruffleHog)

---

## Code Quality Standards

### TypeScript

```typescript
// ✅ Good: Type-safe with proper error handling
async function getMarket(id: string): Promise<Market> {
  try {
    const market = await fetchMarket(id);
    if (!market) {
      throw new Error(`Market ${id} not found`);
    }
    return market;
  } catch (error) {
    logger.error('Failed to fetch market', { id, error });
    throw error;
  }
}

// ❌ Bad: Loose typing, poor error handling
async function getMarket(id: any) {
  const market = await fetchMarket(id);
  return market;
}
```

### Logging

```typescript
// ✅ Good: Structured logging with context
logger.info('Order placed', {
  orderId,
  marketId,
  side: 'BUY',
  size: 100
});

// ❌ Bad: Console logging
console.log('Order placed:', orderId);
```

### Error Handling

```typescript
// ✅ Good: Specific error handling
try {
  await placeOrder(order);
} catch (error) {
  if (error instanceof InsufficientBalanceError) {
    logger.warn('Insufficient balance', { required, available });
    return;
  }
  throw error; // Re-throw unexpected errors
}

// ❌ Bad: Swallowing errors
try {
  await placeOrder(order);
} catch (error) {
  // Silent failure
}
```

---

## Security Requirements

**Hard Rules (Non-Negotiable):**

1. **No Secrets in Code**
   - Use environment variables only
   - Never commit API keys, private keys, or credentials
   - Update `.env.example` (without real values)

2. **Trading Gates**
   - Paper trading by default
   - Live trading requires: `LIVE_TRADING=true` AND `COMPLIANCE_ACCEPTED=true`
   - Fail closed if env vars not set

3. **Compliance**
   - NO VPN/proxy/geo-bypass implementation
   - Respect Polymarket ToS and geographic restrictions
   - See [Compliance Guide](./docs/compliance.md)

4. **Input Validation**
   - Validate all external inputs (API, user, WebSocket)
   - Use Zod schemas for validation
   - Sanitize before logging

5. **Audit References**
   - Reference audit findings in security fixes
   - Format: `(A-XXX)` in commit message
   - Link to [AUDIT.md](./REPORTS/AUDIT.md)

---

## Testing Requirements

### Test Coverage

- **Unit Tests:** Core logic, utilities, pure functions
- **Integration Tests:** API clients, WebSocket, database
- **Backtest Tests:** Strategy validation and metrics

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- path/to/test.spec.ts

# Watch mode
npm test -- --watch

# Coverage report
npm run test:coverage
```

### Writing Tests

```typescript
// ✅ Good: Clear, focused test
describe('OrderManager', () => {
  it('should reject orders exceeding position limit', async () => {
    const order = createOrder({ size: 1000 });
    const result = await orderManager.validateOrder(order);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('POSITION_LIMIT_EXCEEDED');
  });
});

// ❌ Bad: Vague, untestable
it('should work', () => {
  const result = doSomething();
  expect(result).toBeTruthy();
});
```

---

## Getting Help

**Resources:**
- [Documentation Index](./docs/README.md) - Complete docs catalog
- [Architecture Overview](./docs/architecture-overview.md) - How the system works
- [Common Pitfalls](./docs/ai/common-pitfalls.md) - Known issues and solutions
- [Decision Trees](./docs/ai/decision-trees.md) - Troubleshooting guides

**Asking Questions:**
1. Check existing documentation first
2. Search closed issues for similar problems
3. Ask in issue comments with specific details
4. Include error messages, logs, and reproduction steps

---

## Release Process

**Automated via Release Please:**

1. Merge PR with conventional commits to `main`
2. Release Please creates/updates release PR with CHANGELOG
3. Maintainer reviews and merges release PR
4. GitHub release created with version tag
5. Artifacts built and uploaded

**Version Bumps:**
- Major (2.0.0): Breaking changes (`feat!:` or `BREAKING CHANGE:`)
- Minor (1.1.0): New features (`feat:`)
- Patch (1.0.1): Fixes, security, performance (`fix:`, `security:`, etc.)

**⚠️ Never edit CHANGELOG.md manually** - It's auto-generated from commits

---

## Additional Resources

- [AGENTS.md](./AGENTS.md) - Complete contributor guidelines
- [DEV_WORKFLOW.md](./docs/DEV_WORKFLOW.md) - Documentation maintenance
- [Codespaces Verification](./docs/CODESPACES_VERIFICATION_CHECKLIST.md) - Mandatory PR checklist
- [Architecture](./docs/architecture.md) - Technical architecture
- [Runbook](./docs/runbook.md) - Operational procedures
- [Security Audit](./REPORTS/AUDIT.md) - Known issues and findings

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

