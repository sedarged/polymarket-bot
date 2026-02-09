# AI Agent Workflow & Quality Gates

**Purpose:** Define the complete autonomous workflow for AI agents with strict quality gates to ensure high-quality code without "AI lies" or shortcuts.

## Core Principles

1. **Human-like code quality** - No shortcuts, proper patterns, full implementations
2. **Evidence-based** - Every claim must have verifiable proof
3. **Gated progress** - Can't proceed without passing quality checks
4. **Continuous verification** - Test early, test often
5. **No chaos** - Structured, predictable workflow with clear boundaries

---

## Agent Workflow: Research → Plan → Implement → Test → Review → Repeat

### Phase 1: Repository Research & Understanding

**Goal:** Deeply understand the codebase before making any changes.

**Agent Actions:**
1. **Read STATUS.md** - Understand current priorities and context
2. **Read relevant docs** - Find documentation for the area you're working in
3. **Explore code** - Use grep/glob to find relevant files
4. **Understand patterns** - Look at similar existing code
5. **Check tests** - See how the area is currently tested

**Quality Gate:**
- [ ] Can explain the current implementation
- [ ] Can identify where changes need to be made
- [ ] Can describe how similar code works
- [ ] Have found relevant tests

**Tools:**
- `grep` - Search code patterns
- `glob` - Find files by name
- `view` - Read files and directories
- `explore` sub-agent - Answer questions about code

**Output:** Written summary of findings (in memory, not file)

---

### Phase 2: Planning & Design

**Goal:** Create a minimal-change plan with clear acceptance criteria.

**Agent Actions:**
1. **Define scope** - What exactly needs to change?
2. **Identify affected files** - List all files that need modification
3. **Plan minimal changes** - Smallest possible surgical changes
4. **Define success criteria** - How will we know it works?
5. **Identify tests needed** - What tests prove correctness?

**Quality Gate:**
- [ ] Plan is minimal and surgical
- [ ] All affected files identified
- [ ] Success criteria are measurable
- [ ] Test strategy is clear

**Tools:**
- `report_progress` - Document initial plan as checklist

**Output:** Plan checklist in PR description

**Example Plan:**
```markdown
- [ ] Update API endpoint `/health` to include uptime
- [ ] Add uptime field to HealthStatus interface
- [ ] Update health.test.ts to verify uptime field
- [ ] Update documentation to reflect new field
```

---

### Phase 3: Implementation (Small Increments)

**Goal:** Make one small change at a time, verify it works, commit.

**Agent Actions:**
1. **Make ONE small change** (e.g., update one function)
2. **Run targeted tests** immediately
3. **Verify the change** manually if needed
4. **Commit with report_progress** once verified
5. **Repeat** for next small change

**Quality Gate (for EACH increment):**
- [ ] Change compiles/builds successfully
- [ ] Targeted tests pass
- [ ] Manual verification confirms behavior
- [ ] No new linting errors
- [ ] Commit message follows conventional commits

**Tools:**
- `edit` - Make surgical code changes
- `bash` - Run tests, build, lint
- `report_progress` - Commit each verified change
- `scripts/quality-check.sh` - **NEW:** Automated pre-commit quality checks

**Anti-patterns to AVOID:**
- ❌ Making multiple unrelated changes at once
- ❌ Committing without testing
- ❌ Using placeholders like `// TODO: implement`
- ❌ Adding comments instead of code
- ❌ Copying code without understanding it

**Required patterns:**
- ✅ One logical change per commit
- ✅ Test immediately after change
- ✅ Full implementation (no TODOs)
- ✅ Proper error handling
- ✅ Clear variable names

---

### Phase 4: Comprehensive Testing

**Goal:** Prove the changes work end-to-end.

**Agent Actions:**
1. **Run unit tests** for changed areas
2. **Run integration tests** if available
3. **Run full test suite** before finalizing
4. **Manual testing** of changed functionality
5. **Build verification** - ensure no new TypeScript errors

**Quality Gate:**
- [ ] All tests pass (or only pre-existing documented failures)
- [ ] No NEW test failures introduced
- [ ] Build succeeds (or only pre-existing documented errors)
- [ ] No NEW build errors introduced
- [ ] Manual testing confirms expected behavior

**Tools:**
- `bash` - Run npm test, npm run build
- `task` sub-agent - Run comprehensive test suites
- `scripts/quality-check.sh` - **NEW:** Automated quality checks (type check, lint, test, security)

**Evidence Required:**
- Test output showing pass/fail counts
- Build output showing no new errors
- Screenshots of manual testing (for UI changes)

---

### Phase 5: Code Review & Security

**Goal:** Catch issues before they reach production.

**Agent Actions:**
1. **Run code review tool** - Get automated feedback
2. **Address review comments** - Fix legitimate issues
3. **Run security scans** - npm audit, secret scanning
4. **Run CodeQL** - Catch security vulnerabilities
5. **Review audit findings** - Address or document

**Quality Gate:**
- [ ] Code review completed
- [ ] All valid review comments addressed
- [ ] No high/critical npm audit findings
- [ ] No secrets committed
- [ ] CodeQL findings reviewed and addressed/documented

**Tools:**
- `code_review` - Automated code review
- `codeql_checker` - Security vulnerability scanning
- `bash` - npm audit, git diff for secrets
- `scripts/quality-check.sh` - **NEW:** Includes secret detection and security audit

**Output:** Security summary in PR description

---

### Phase 6: Codespaces Verification (MANDATORY)

**Goal:** Prove everything works in a real environment.

**Agent Actions:**
1. **Complete verification checklist** - All applicable sections
2. **Collect proof** - Terminal output, screenshots
3. **Document gaps** - Any issues discovered
4. **Fix gaps immediately** - Update docs/scripts
5. **Add proof to PR** - Include all evidence

**Quality Gate:**
- [ ] All applicable checklist sections completed
- [ ] Proof collected for all verification steps
- [ ] Any gaps discovered were fixed
- [ ] All evidence included in PR description

**Tools:**
- See [CODESPACES_VERIFICATION_CHECKLIST.md](./CODESPACES_VERIFICATION_CHECKLIST.md)
- `scripts/verify-codespaces.sh` - **NEW:** Automated verification helper (runs basic checks)

**Output:** Verification proof in PR description

---

### Phase 7: Documentation & Final Review

**Goal:** Ensure documentation is accurate and complete.

**Agent Actions:**
1. **Update relevant docs** - Keep docs in sync with code
2. **Verify examples work** - Test all documented commands
3. **Check links** - Ensure all docs link correctly
4. **Update .env.example** - If env vars changed
5. **Final self-review** - Read through all changes

**Quality Gate:**
- [ ] All relevant documentation updated
- [ ] All code examples tested and working
- [ ] All links verified
- [ ] .env.example updated if needed
- [ ] Changes are minimal and surgical

**Tools:**
- `edit` - Update documentation files
- `bash` - Test documented commands
- `scripts/check-docs-links.sh` - **NEW:** Validate internal links in markdown files

**Reference:** [DEV_WORKFLOW.md](./DEV_WORKFLOW.md) for doc maintenance rules

---

## Quality Gates Summary

### 🚫 **Cannot Proceed If:**

**Phase 1 (Research):**
- Don't understand the current implementation
- Haven't found relevant tests
- Can't identify where changes go

**Phase 2 (Planning):**
- Plan is not minimal
- Missing affected files
- No clear success criteria

**Phase 3 (Implementation):**
- Tests fail after change
- Build fails with NEW errors
- Manual verification shows incorrect behavior

**Phase 4 (Testing):**
- NEW test failures introduced
- NEW build errors introduced
- Manual testing reveals bugs

**Phase 5 (Review):**
- Code review shows critical issues
- High/critical security vulnerabilities
- Secrets committed

**Phase 6 (Verification):**
- Checklist not completed
- No proof provided
- Gaps not addressed

**Phase 7 (Documentation):**
- Examples don't work
- Documentation out of sync
- Links broken

### ✅ **Can Proceed If:**

- All quality gates for current phase passed
- Evidence collected and documented
- No blockers remain

---

## Anti-Patterns: What NOT to Do

### ❌ AI Lies & Shortcuts

**DON'T:**
- Claim you tested something without actually running it
- Say "tests pass" without showing output
- Use placeholder comments like `// TODO: implement later`
- Copy-paste code without understanding
- Make assumptions about how code works
- Skip error handling "for now"

**DO:**
- Run every test you claim passes
- Show terminal output as proof
- Write full implementations immediately
- Study code before modifying
- Look at actual behavior, not assumptions
- Add comprehensive error handling

### ❌ Chaos-Inducing Behaviors

**DON'T:**
- Make massive changes all at once
- Modify unrelated files
- Delete working code "to refactor it"
- Change implementation without tests
- Ignore existing patterns
- Commit broken code

**DO:**
- Small, incremental changes
- One logical change per commit
- Preserve working code unless broken
- Test before and after changes
- Follow existing code patterns
- Only commit verified working code

### ❌ Low-Quality Code

**DON'T:**
- Use vague variable names (x, data, temp)
- Skip error handling
- Ignore TypeScript errors
- Write 500-line functions
- Copy-paste duplicate code
- Leave console.log statements

**DO:**
- Use descriptive names (userEmail, orderTotal)
- Handle all error cases
- Fix TypeScript errors
- Keep functions small and focused
- Extract common logic to utilities
- Use structured logging

---

## Automation Scripts

### Available Helper Scripts

The repository includes automation scripts to streamline the workflow:

**1. Quality Check Script** (`scripts/quality-check.sh`)
- Runs before every commit
- Checks: TypeScript, linting, tests, secrets, security
- Use: `./scripts/quality-check.sh`

**2. Codespaces Verification** (`scripts/verify-codespaces.sh`)
- Automates basic verification checklist
- Checks: Environment, build, tests, CLI, security
- Use: `./scripts/verify-codespaces.sh`

**3. Documentation Link Checker** (`scripts/check-docs-links.sh`)
- Validates internal markdown links
- Checks: All `.md` files for broken links
- Use: `./scripts/check-docs-links.sh`

**See:** [scripts/README.md](../scripts/README.md) for complete documentation

### When to Use Scripts

**Phase 3 (Implementation) - After each change:**
```bash
./scripts/quality-check.sh
# If pass, commit with report_progress
```

**Phase 4 (Testing) - Before finalizing:**
```bash
./scripts/quality-check.sh
```

**Phase 6 (Verification) - Automated basic checks:**
```bash
./scripts/verify-codespaces.sh
# Then complete manual sections
```

**Phase 7 (Documentation) - After doc updates:**
```bash
./scripts/check-docs-links.sh
```

### Quick Command for Full Verification

```bash
# Run all checks before creating PR
./scripts/quality-check.sh && \
./scripts/verify-codespaces.sh && \
./scripts/check-docs-links.sh
```

---

## Tools & Sub-Agents

### Built-in Tools

**Code Exploration:**
- `grep` - Fast code search
- `glob` - Find files by pattern
- `view` - Read files/directories

**Code Modification:**
- `edit` - Surgical file edits
- `create` - Create new files

**Execution:**
- `bash` - Run commands, tests, builds
- `read_bash` / `write_bash` - Interactive commands

**Quality:**
- `code_review` - Automated review
- `codeql_checker` - Security scanning
- `gh-advisory-database` - Check dependencies

**Progress:**
- `report_progress` - Commit and update PR

### Sub-Agents (via `task` tool)

**explore** - Fast codebase research
- Use for: Finding files, searching code, answering questions
- Tools: grep, glob, view
- Model: Haiku (fast)

**task** - Run commands with minimal output
- Use for: Tests, builds, lints, installs
- Tools: All CLI tools
- Model: Haiku
- Returns: Brief summary on success, full output on failure

**general-purpose** - Complex multi-step tasks
- Use for: Major features, complex refactoring
- Tools: All tools
- Model: Sonnet (high quality)

**code-review** - Review code changes
- Use for: Pre-merge quality check
- Tools: All CLI tools for investigation
- Model: Default

### When to Use Sub-Agents

**Use explore agent:**
- "Where is the authentication logic?"
- "Find all files that use the RiskManager"
- "How does the WebSocket reconnection work?"

**Use task agent:**
- "Run the full test suite"
- "Build the project and report any new errors"
- "Install dependencies"

**Use general-purpose agent:**
- "Implement feature X with tests and docs"
- "Refactor module Y to use pattern Z"
- "Migrate from library A to library B"

**Use code-review agent:**
- "Review my changes before I finalize"

---

## Workflow Example: Adding a New Endpoint

### Phase 1: Research (5 minutes)

```bash
# Find existing endpoint implementations
grep -r "url === '/" apps/backend/src/server/index.ts

# Study health endpoint pattern
view apps/backend/src/server/health.ts

# Find related tests
glob "**/*health*.test.ts"
```

**Gate Check:**
✅ Understand health endpoint pattern
✅ Know where to add new endpoint
✅ Found test pattern to follow

### Phase 2: Plan (2 minutes)

```markdown
- [ ] Add /uptime endpoint to server/index.ts
- [ ] Return JSON with uptime in seconds
- [ ] Add test to server.test.ts
- [ ] Update docs/CODESPACES_VERIFICATION_CHECKLIST.md
```

**Gate Check:**
✅ Minimal changes identified
✅ Test strategy clear

### Phase 3: Implement Incrementally

**Increment 1: Add endpoint**
```typescript
// edit server/index.ts
if (method === 'GET' && url === '/uptime') {
  const uptime = Date.now() - startTime;
  respondJson(res, 200, { uptime }, req);
  return;
}
```

Test immediately:
```bash
npm run dev &
sleep 3
curl http://localhost:3000/uptime
# Verify output: {"uptime":12345}
```

**Gate Check:**
✅ Endpoint returns correct format
✅ Manual test passes

Commit:
```bash
report_progress "feat: add /uptime endpoint"
```

**Increment 2: Add test**
```typescript
// edit server.test.ts
it('returns uptime on /uptime endpoint', async () => {
  const response = await fetch('http://localhost:3000/uptime');
  const data = await response.json();
  expect(data).toHaveProperty('uptime');
  expect(typeof data.uptime).toBe('number');
});
```

Test immediately:
```bash
npm test -- server.test.ts
```

**Gate Check:**
✅ New test passes
✅ Existing tests still pass

Commit:
```bash
report_progress "test: add test for /uptime endpoint"
```

**Increment 3: Update docs**
```markdown
// edit docs/CODESPACES_VERIFICATION_CHECKLIST.md
- ✅ `/uptime` - Returns uptime in milliseconds
```

Test:
```bash
# Verify example works
curl http://localhost:3000/uptime
```

**Gate Check:**
✅ Documentation accurate
✅ Example works

Commit:
```bash
report_progress "docs: add /uptime endpoint to verification checklist"
```

### Phase 4: Comprehensive Testing

```bash
# Run full test suite
npm test

# Build check
npm run build
```

**Gate Check:**
✅ All tests pass
✅ No new build errors

### Phase 5: Code Review

```bash
# Get automated review
code_review "Add /uptime endpoint" "Added simple uptime endpoint for monitoring"
```

**Gate Check:**
✅ Review comments addressed
✅ No security issues

### Phase 6: Codespaces Verification

Complete checklist sections:
- Environment setup ✅
- Build & test ✅
- Backend API ✅
- Security ✅

**Gate Check:**
✅ Checklist completed
✅ Proof collected

### Phase 7: Final Review

- [x] Documentation updated
- [x] Examples tested
- [x] Links checked
- [x] .env.example (no changes needed)

**Gate Check:**
✅ Ready to merge

---

## Continuous Improvement

### Learn from Mistakes

When verification finds a gap:
1. **Document it** in Section 8 of checklist
2. **Fix it immediately**
3. **Create tooling** if needed
4. **Update this guide** if pattern emerges

### Suggest Improvements

When you find a better way:
1. **Document the improvement**
2. **Add to verification checklist suggestions**
3. **Update workflow guides**

### Escalate Blockers

When stuck:
1. **Document what you tried**
2. **Show error messages**
3. **Ask specific questions**
4. **Wait for guidance**

---

## Success Metrics

### High-Quality PR Indicators

✅ Small, focused changes (< 500 lines preferred)
✅ All tests pass
✅ No new TypeScript errors
✅ Comprehensive test coverage
✅ Clear, descriptive commit messages
✅ Complete documentation updates
✅ Verification checklist completed with proof
✅ Security scans passed
✅ Code review feedback addressed

### Red Flags (Fix Before Merge)

❌ Large, unfocused changes (> 1000 lines)
❌ Test failures
❌ New TypeScript errors
❌ Missing tests
❌ Vague commit messages
❌ Out-of-date documentation
❌ No verification proof
❌ Security vulnerabilities
❌ Unaddressed review comments

---

## Related Documentation

- [CODESPACES_VERIFICATION_CHECKLIST.md](./CODESPACES_VERIFICATION_CHECKLIST.md) - Mandatory verification
- [DEV_WORKFLOW.md](./DEV_WORKFLOW.md) - Documentation maintenance
- [AGENTS.md](../AGENTS.md) - Agent guidelines
- [testing.md](./testing.md) - Testing strategy
- [ai/common-pitfalls.md](./ai/common-pitfalls.md) - Trading bot pitfalls
- [ai/decision-trees.md](./ai/decision-trees.md) - Troubleshooting

---

**Last Updated:** 2026-02-09
**Status:** Active
**Audience:** AI Agents, Automated Tools
