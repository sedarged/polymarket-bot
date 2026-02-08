# Development Workflow - Documentation Maintenance

This document defines mandatory documentation update procedures to prevent drift between code and documentation.

## Core Principle

**Every code change must be accompanied by corresponding documentation updates.** Documentation is not optional—it's part of the deliverable.

## Pre-Commit Checklist

Before committing any code change, verify:

- [ ] Updated `.env.example` if new environment variables added
- [ ] Updated README.md if commands/features changed
- [ ] Updated relevant docs/ files if architecture/behavior changed
- [ ] Added/updated code examples that work with current code
- [ ] Verified all links in updated documentation still work
- [ ] Ran `npm test` to ensure tests pass
- [ ] Ran `npm run build` to check for TypeScript errors

## When to Update Documentation

### 1. Environment Variables

**When:** Adding, removing, or changing any environment variable

**Required Updates:**
- `.env.example` - Add/update variable with description and default
- `docs/environment.md` - Add to environment variables section
- `README.md` - Update configuration section if critical variable

**Example:**
```bash
# Code change: Add new env var in config/index.ts
NEW_FEATURE_ENABLED: booleanFromEnv.default(false),

# Required doc updates:
# 1. .env.example
NEW_FEATURE_ENABLED=false  # Enable new feature (default: false)

# 2. docs/environment.md
NEW_FEATURE_ENABLED=false    # Enable new feature
```

### 2. API Endpoints

**When:** Adding, removing, or modifying HTTP endpoints

**Required Updates:**
- `README.md` - Update endpoint list under "Real-Time Market Feed Server"
- `docs/runbook.md` - Update API reference section
- `docs/architecture.md` - Update if significant architectural change

**Example:**
```bash
# Code change: Add new endpoint in server/index.ts
if (url === '/api/new-feature') { ... }

# Required doc updates:
# 1. README.md
**Admin Endpoints (require ADMIN_TOKEN):**
...
- `GET /api/new-feature` - Description of new feature
```

### 3. CLI Commands

**When:** Adding, removing, or modifying CLI commands

**Required Updates:**
- `README.md` - Update "Usage" section
- `docs/environment.md` - Update "Command Reference" section
- `package.json` scripts (if adding new script)

**Example:**
```bash
# Code change: Add new CLI command in cli/index.ts
case 'validate':
  await validateOrders();
  break;

# Required doc updates:
# 1. package.json (if exposing as npm script)
"validate": "tsx src/index.ts validate"

# 2. README.md
npm run validate  # Validate order configuration
```

### 4. Configuration Options

**When:** Adding or changing configuration schemas, defaults, or validation

**Required Updates:**
- `.env.example` - Update relevant variables
- `docs/environment.md` - Update configuration section
- Code comments in `config/index.ts` - Inline documentation

### 5. Architecture Changes

**When:** Modifying project structure, adding modules, changing data flow

**Required Updates:**
- `docs/architecture.md` - Update architecture diagrams and descriptions
- `docs/ai/project-layout.md` - Update directory structure
- `README.md` - Update "Project Structure" section if user-facing

### 6. Dependencies

**When:** Adding, removing, or updating npm packages

**Required Updates:**
- `docs/environment.md` - Update "Core Dependencies" section
- Security advisory check: Run `npm audit` and address issues
- Verify README examples still work with new versions

## Pull Request Requirements

Every PR that includes code changes must include:

1. **Code changes** ✅
2. **Test updates** ✅ (if modifying behavior)
3. **Documentation updates** ✅ (if user-facing changes)
4. **PR description** explaining what docs were updated and why

**Documentation-only PRs** do not require code or test changes.

### PR Description Template

```markdown
## Changes

- Brief description of code changes

## Documentation Updates

- [ ] Updated .env.example (if env vars changed)
- [ ] Updated README.md (if commands/features changed)
- [ ] Updated docs/environment.md (if config changed)
- [ ] Updated docs/architecture.md (if structure changed)
- [ ] Verified all examples work
- [ ] Ran npm test (all tests pass)
- [ ] No new TypeScript errors

## Testing

- Commands run: `npm test`, `npm run dev`
- Examples verified: [list examples tested]
```

## Documentation Review Process

### Self-Review

Before requesting PR review:

1. **Read your documentation changes** as if you're a new user
2. **Test all code examples** you've added or modified
3. **Check all links** in updated documentation
4. **Verify consistency** across all updated files
5. **Run spell check** on markdown files

### Peer Review

Reviewers must verify:

- [ ] Documentation matches code changes
- [ ] Examples are correct and tested
- [ ] No broken links
- [ ] Consistent terminology
- [ ] Clear and concise explanations

## Common Documentation Debt Issues

### Symptoms of Documentation Drift

❌ **Bad:**
- "This command doesn't work"
- "Environment variable not in .env.example"
- "Documentation says X but code does Y"
- "Example throws an error"

✅ **Good:**
- All commands work as documented
- All env vars in .env.example
- Documentation accurately describes behavior
- Examples run without errors

### Prevention

1. **Treat docs as code** - review, test, maintain
2. **Update docs in same PR** - don't defer to "later"
3. **Test examples** - actually run the code snippets
4. **Use automation** - validation scripts (see below)

## Automation

### Validation Scripts (Planned)

The following validation scripts are planned for future implementation:

```bash
# Check for missing env vars (not yet implemented)
npm run check:env

# Validate markdown links (not yet implemented)
npm run check:links

# Test all documented examples (not yet implemented)
npm run check:examples
```

Until these scripts are available, manually verify documentation changes.

### CI/CD Integration (Future)

GitHub Actions will eventually:
- ✅ Check .env.example matches code
- ✅ Validate markdown links
- ✅ Test code examples
- ✅ Verify PR has documentation updates

## Quick Reference

| Change Type | Required Doc Updates |
|------------|---------------------|
| **New env var** | .env.example, docs/environment.md |
| **New endpoint** | README.md, docs/runbook.md |
| **New CLI command** | README.md, docs/environment.md, package.json |
| **Config change** | .env.example, docs/environment.md |
| **Architecture change** | docs/architecture.md, docs/ai/project-layout.md |
| **New dependency** | docs/environment.md |

## Questions?

If unsure what documentation to update:

1. Check this guide's "When to Update Documentation" section
2. Review similar past PRs for examples
3. Ask in PR comments before finalizing
4. Better to over-document than under-document

## Related Documents

- [Environment Setup](./environment.md) - Complete environment configuration
- [Architecture](./architecture.md) - System architecture documentation
- [AI Agent Guidelines](../AGENTS.md) - Guidelines for AI agents
- [Project Layout](./ai/project-layout.md) - Repository structure

---

**Remember:** Documentation is not a burden—it's a feature. Good documentation prevents bugs, saves time, and makes the project maintainable.
