# Agent Guidelines

This document provides a contract for AI agents (GitHub Copilot, custom automation agents, etc.) working on this repository.

## Quick Reference - What to Read When

| Situation | Read This |
|-----------|-----------|
| 🆕 **Starting any work** | [STATUS.md](./STATUS.md) → [docs/ai/project-layout.md](./docs/ai/project-layout.md) |
| 🤖 **Understanding agent workflow** | [docs/AI_AGENT_WORKFLOW.md](./docs/AI_AGENT_WORKFLOW.md) |
| 🔍 **Finding code/files** | [docs/ai/project-layout.md](./docs/ai/project-layout.md) |
| 🐛 **Debugging an error** | [docs/ai/decision-trees.md](./docs/ai/decision-trees.md) |
| 💰 **Implementing trading** | [docs/ai/common-pitfalls.md](./docs/ai/common-pitfalls.md) |
| 📝 **Creating a PR** | [docs/DEV_WORKFLOW.md](./docs/DEV_WORKFLOW.md) |
| ✅ **Completing work** | [docs/CODESPACES_VERIFICATION_CHECKLIST.md](./docs/CODESPACES_VERIFICATION_CHECKLIST.md) |
| 📊 **Tracking your work** | [docs/ai/session-state.md](./docs/ai/session-state.md) |
| 📚 **Finding any doc** | [docs/README.md](./docs/README.md) |

## Priority Order

**ALWAYS read [STATUS.md](./STATUS.md) first** to understand the current work state.

Work on tasks in this priority order:
1. **Now (In Progress)**: Complete these first
2. **P0 (Critical)**: Urgent issues requiring immediate attention
3. **P1 (High Priority)**: Important issues for the current milestone
4. **P2 (Normal Priority)**: Standard backlog items

## Starting Work

1. Review [STATUS.md](./STATUS.md) to see what's in progress
2. Choose a task from the highest priority category that's not in progress
3. Add the `in-progress` label to the issue
4. The status automation will move it to "Now (In Progress)" within 6 hours (or trigger the workflow manually)

## Making Changes

### Required Reading

**Start Here:**
- **[STATUS.md](./STATUS.md)**: Current work priorities and active tasks - ALWAYS read this first
- **[docs/README.md](./docs/README.md)**: Documentation index - complete catalog of all project docs

**AI Agent Specific Guides (docs/ai/):**
- **[docs/AI_AGENT_WORKFLOW.md](./docs/AI_AGENT_WORKFLOW.md)**:
  - **When to read**: Before starting any autonomous work
  - **What it contains**: Complete workflow with quality gates, anti-patterns, tool usage, examples
  - **Use it to**: Follow structured Research → Plan → Implement → Test → Review → Repeat workflow with strict quality gates

- **[docs/ai/project-layout.md](./docs/ai/project-layout.md)**: 
  - **When to read**: Before making any code changes
  - **What it contains**: Complete repository structure, directory layout, key files and their purposes
  - **Use it to**: Find where code lives, understand module organization, locate specific functionality

- **[docs/ai/common-pitfalls.md](./docs/ai/common-pitfalls.md)**: 
  - **When to read**: Before implementing trading logic, API calls, or WebSocket handling
  - **What it contains**: Critical mistakes that cause financial loss or bugs, with code examples showing wrong vs. right approaches
  - **Use it to**: Avoid double order submission, rate limiting issues, WebSocket disconnects, missing trading gates, race conditions

- **[docs/ai/decision-trees.md](./docs/ai/decision-trees.md)**: 
  - **When to read**: When debugging issues or errors
  - **What it contains**: Step-by-step troubleshooting guides for common problems
  - **Use it to**: Debug order submission failures, WebSocket issues, balance problems, API errors

- **[docs/ai/session-state.md](./docs/ai/session-state.md)**: 
  - **When to read**: At the start of each work session
  - **What it contains**: Template for tracking your work, decisions, and progress
  - **Use it to**: Document your session, record decisions, track issues, prepare handoffs to other agents

**Process & Workflow:**
- **[docs/DEV_WORKFLOW.md](./docs/DEV_WORKFLOW.md)**: 
  - **When to read**: Before creating any PR
  - **What it contains**: Mandatory documentation update rules, PR requirements, checklists
  - **Use it to**: Ensure you update docs with code changes, follow PR checklist, prevent documentation drift

**Research vs repo:**
- For work tied to the research document or comparison report, read [REPORTS/RESEARCH_VS_REPO_COMPARISON.md](./REPORTS/RESEARCH_VS_REPO_COMPARISON.md) and the current research double-check plan (in `.cursor/plans/`) for implementation status and remaining todos.

### Development Workflow
1. **Read the docs**: Check relevant documentation before coding
2. **Small changes**: Make minimal, surgical modifications
3. **Test early**: Validate changes as soon as possible
4. **Update tests**: Add/modify tests for your changes
5. **Update docs**: Keep documentation in sync with code changes (see DEV_WORKFLOW.md)

### Code Quality Standards
- TypeScript strict mode enabled
- Small, focused modules with clear names
- Structured logging (not console.log)
- Comprehensive error handling
- WebSocket reconnection and state resync
- Idempotent operations where possible

## Completing Work

### Before Marking Complete
1. **All tests pass**: Run `npm test`
2. **Code builds**: Run `npm run dev` and verify no errors
3. **Documentation updated**: Reflect any changes in relevant docs
4. **Security check**: No secrets committed, no new vulnerabilities
5. **Codespaces verification**: Complete mandatory verification checklist (see below)

### Mandatory Codespaces Verification

**REQUIRED FOR ALL PRs AND ISSUE COMPLETIONS**

Before marking any work as complete, you MUST:

1. **Create a Codespace** from your branch/PR
2. **Complete the [Codespaces Verification Checklist](./docs/CODESPACES_VERIFICATION_CHECKLIST.md)**
   - Verify environment setup
   - Verify build & tests pass
   - Verify all CLI commands work
   - Verify backend API endpoints
   - Verify frontend dashboard (if applicable)
   - Verify WebSocket connectivity (if applicable)
   - Verify security (no secrets, npm audit, paper trading mode)
3. **Collect proof** for all verification steps:
   - Terminal output for commands
   - Screenshots for UI changes
   - Test results and coverage
4. **Document any gaps** discovered during verification
5. **Update documentation/scripts** immediately when gaps are found
6. **Create new CLI commands/tests** if needed for verification
7. **Add all proof** to your PR description

**⚠️ PRs and issues CANNOT be completed without:**
- Completed verification checklist
- Proof provided for all applicable sections
- Documentation gaps addressed
- Security verification passed

This ensures:
- No "works on my machine" problems
- All documentation is accurate
- All commands actually work
- Security practices are followed
- Continuous improvement of tooling and docs

**Full checklist:** [docs/CODESPACES_VERIFICATION_CHECKLIST.md](./docs/CODESPACES_VERIFICATION_CHECKLIST.md)

### Finishing the Task
1. **Update the issue**: Add completion notes and evidence
2. **Update STATUS.md**: The automation will update within 6 hours, or trigger manually
3. **Close the issue**: Clearly state what was accomplished
4. **PR description**: Include commands run, test results, and key evidence

### Evidence Required in PRs
- Commands executed (with key outputs)
- Test results showing success
- Link check results for doc changes
- Before/after behavior for features
- **Codespaces verification proof** (MANDATORY)

## Hard Rules (Non-Negotiable)

### Compliance & Safety
- **NO VPN/proxy/geo-bypass implementation**: Respect geoblocking and ToS
- **Paper trading by default**: Live trading requires LIVE_TRADING=true AND COMPLIANCE_ACCEPTED=true
- **Fail closed**: If env vars not set, refuse order placement
- **No secrets in code**: Use .env files, never commit secrets
- **Frontend stays secret-free**: Never pass secrets to frontend

### Reliability Requirements
- WebSocket reconnect with state resync
- Idempotency for critical operations
- Startup reconciliation of state
- Circuit breakers for external services
- Kill switch capability

### Testing Requirements
- PR is only complete when `npm test` passes
- Add tests for new functionality
- Update tests for changed behavior
- Run targeted tests during development
- Run full suite before completion

## Repository Commands

Must always work:
```bash
npm install          # Install dependencies
npm run dev         # Run backend in development mode
npm run markets     # Fetch and display markets
npm run book        # Display order book
npm test            # Run all tests
```

## Project Structure

```
polymarket-bot/
├── apps/
│   ├── backend/     # Node 20 + TypeScript, tsx, vitest
│   └── frontend/    # Minimal TS (upgradable to Vite+React)
├── packages/
│   └── shared/      # Shared code between apps
├── docs/            # All documentation
│   ├── ai/          # AI agent guides
│   └── adr/         # Architecture Decision Records
├── .github/
│   └── workflows/   # GitHub Actions automation
└── [root docs]      # STATUS.md, AGENTS.md, CHANGELOG.md, README.md
```

## Automated Workflows & Release Management

### Conventional Commits (REQUIRED)

All commits MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

**Format:** `<type>: <description>`

**Types:**
- `feat:` - New feature (bumps minor version: 1.0.0 → 1.1.0)
- `fix:` - Bug fix (bumps patch version: 1.0.0 → 1.0.1)
- `security:` - Security fix (bumps patch, HIGH PRIORITY)
- `perf:` - Performance improvement
- `refactor:` - Code refactoring (no behavior change)
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `chore:` - Maintenance (dependencies, build, etc.)
- `ci:` - CI/CD changes

**Breaking changes:** Use `feat!:` or add `BREAKING CHANGE:` in footer (bumps major version: 1.0.0 → 2.0.0)

**Examples:**
```bash
feat: add kill switch for emergency trading halt
fix: prevent double order submission on retry
security: add input validation for order parameters (A-015)
docs: update troubleshooting guide
test: add integration tests for order placement
```

**Audit References:**
For security fixes, ALWAYS reference the audit finding:
```bash
security: sanitize user inputs (A-015)

Addresses audit finding A-015 by implementing Zod schema
validation for all order parameters. Added comprehensive tests.
```

### Never Edit CHANGELOG.md Manually

**CRITICAL:** The CHANGELOG.md file is **auto-generated** by Release Please based on conventional commits.

- Manual edits will be **overwritten**
- Instead, write descriptive conventional commit messages
- Include details in commit body (not just title)
- Reference issue numbers and audit findings

### CI/CD Pipeline

**Runs automatically on every push and PR:**

1. **Test & Build:**
   - Type checking (`npm run build`)
   - Unit tests (`npm test`)
   - Test coverage report

2. **Security Checks:**
   - Dependency audit (`npm audit`)
   - Secret scanning (TruffleHog)

**Local testing before push:**
```bash
npm ci              # Install dependencies
npm run build       # Type check
npm test            # Run tests
npm audit --audit-level=high  # Security check
```

**If CI fails:**
1. Check the Actions tab for details
2. Run the failing command locally
3. Fix the issue and push again

### Dependabot Security Updates

**Daily scans for vulnerabilities** in trading packages:
- Root + Backend: Daily (CRITICAL - trading code)
- Frontend: Weekly
- GitHub Actions: Monthly

**Action required:**
1. Review Dependabot PRs weekly
2. **Merge security updates immediately** - real money at risk
3. Test backend changes carefully before merging
4. Close outdated PRs (Dependabot will recreate)

### PR Automation

**Automatic enhancements on every PR:**

1. **Auto-labeling** by component:
   - `backend`, `frontend`, `api-client`
   - `websocket`, `trading`, `documentation`
   - `testing`, `ci/cd`, `security`

2. **Security review flags** for sensitive files:
   - Trading logic, order management
   - API clients (CLOB, Gamma)
   - Credentials (.env, private-key, wallet)
   - Safety features (kill-switch)

3. **Size labeling:**
   - `size/xs` (<10), `size/s` (10-99), `size/m` (100-499)
   - `size/l` (500-999), `size/xl` (1000+)
   - Warning comment for PRs >500 lines

4. **Quality checks:**
   - Minimum 30 character description
   - Issue linking (e.g., "Closes #123")
   - Test mentions
   - Audit references for security fixes

### Hard Rules

1. **No hardcoded secrets** - Use environment variables only
2. **No manual CHANGELOG edits** - Use conventional commits
3. **Always use conventional commits** - Required for releases
4. **Test trading logic thoroughly** - Add tests for all changes
5. **Reference audit findings** - Use A-XXX format in security commits
6. **Keep PRs under 500 lines** - Easier to review for trading bot
7. **Merge security updates immediately** - Dependabot PRs with `security` label

### Release Process

1. Merge commits to `main` using conventional format
2. Release Please creates/updates a release PR with changelog
3. Maintainer reviews and merges release PR
4. Release Please creates GitHub release with version tag
5. Artifacts are built and uploaded automatically

For complete documentation, see [docs/automation.md](./docs/automation.md).

## When to Update Status

The status automation runs:
- Automatically every 6 hours
- On any issue: opened, edited, labeled, unlabeled, closed, reopened
- On manual workflow dispatch

You can trigger a manual sync from the Actions tab if needed.

## Getting Help

If stuck or unsure:
1. Check [docs/ai/decision-trees.md](./docs/ai/) for common scenarios
2. Review [docs/ai/common-pitfalls.md](./docs/ai/) for known issues
3. Look at [docs/README.md](./docs/README.md) for relevant documentation
4. For research-alignment work: [REPORTS/RESEARCH_VS_REPO_COMPARISON.md](./REPORTS/RESEARCH_VS_REPO_COMPARISON.md) and the research double-check plan in `.cursor/plans/`
5. Ask in the issue comments with specific questions

## Links

- [Project Status](./STATUS.md) - Current work state
- [Documentation](./docs/README.md) - All project docs
- [Changelog](./CHANGELOG.md) - Release history
- [README](./README.md) - Project overview and setup
