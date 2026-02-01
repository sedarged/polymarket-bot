# Migration Log

This document tracks the migration of documentation files to the new structure. Each move must be completed and verified before the source file can be deleted in PR4.

## Migration Checklist

### Root → docs/ Moves

| Status | Source | Destination | Action | Notes |
|--------|--------|-------------|--------|-------|
| [x] | MASTER_DEVELOPMENT_PLAN.md | docs/master-plan.md | MOVE | Comprehensive development roadmap - COMPLETE |
| [x] | SYSTEM_OVERVIEW.md | docs/architecture-overview.md | MOVE | Plain language system explanation - COMPLETE |
| [x] | EXAMPLES.md | docs/examples.md | MOVE | CLI usage examples - COMPLETE |
| [x] | PODSUMOWANIE.md | docs/summary-pl.md | MOVE | Polish summary document - COMPLETE |

### docs/ Lowercase Normalization

| Status | Source | Destination | Action | Notes |
|--------|--------|-------------|--------|-------|
| [x] | docs/ENVIRONMENT.md | docs/environment.md | RENAME | Environment setup and configuration - COMPLETE |
| [x] | docs/RUNBOOK.md | docs/runbook.md | RENAME | Operational procedures - COMPLETE |
| [x] | docs/PAPER_TRADING.md | docs/paper-trading.md | RENAME | Paper trading guide - COMPLETE |
| [x] | docs/PLAN.md | docs/plan.md | RENAME | PR rollout plan - COMPLETE |
| [x] | docs/IMPLEMENTATION_CHECKLIST.md | docs/implementation-checklist.md | RENAME | Implementation checklist - COMPLETE |
| [x] | docs/OPEN_QUESTIONS.md | docs/open-questions.md | RENAME | Open questions and discussions - COMPLETE |
| [x] | docs/REPORT_DIGEST.md | docs/report-digest.md | RENAME | Report summaries - COMPLETE |

### ADR Structure

| Status | Source | Destination | Action | Notes |
|--------|--------|-------------|--------|-------|
| [x] | docs/ADR-0001.md | docs/adr/0001-initial-architecture.md | MOVE | Architecture Decision Record #1 - COMPLETE |
| [ ] | N/A | docs/adr/README.md | CREATE | ADR index (optional, not created) |

### docs/ARCHITECTURE.md Handling

| Status | Source | Destination | Action | Notes |
|--------|--------|-------------|--------|-------|
| [x] | docs/ARCHITECTURE.md | docs/architecture.md | RENAME | Large technical architecture doc (1266 lines) - COMPLETE |

**Note**: We now have both `docs/architecture-overview.md` (plain language from SYSTEM_OVERVIEW.md) and `docs/architecture.md` (technical details from ARCHITECTURE.md).

## Migration Process

### For Each File:

1. **Plan** (in this log)
   - [ ] Document source and destination
   - [ ] Note any special considerations
   - [ ] Identify files that reference this doc

2. **Execute** (in git)
   - [ ] Use `git mv <source> <destination>` to preserve history
   - [ ] Commit the move immediately
   - [ ] Do NOT delete source yet

3. **Update References** (search and replace)
   - [ ] Find all references: `grep -RIn <filename> .`
   - [ ] Update markdown links
   - [ ] Update documentation cross-references
   - [ ] Update README.md if needed
   - [ ] Commit reference updates

4. **Verify** (testing)
   - [ ] Run `npm run build` (if applicable)
   - [ ] Run `npm test`
   - [ ] Run link checker: `npx markdown-link-check <file>`
   - [ ] Manually verify key docs

5. **Mark Complete** (in this log)
   - [x] Check the box for this file
   - [x] Note completion date
   - [x] Document any issues encountered

## Reference Update Commands

```bash
# Find references to a file (example)
grep -RIn --exclude-dir=node_modules --exclude-dir=.git "MASTER_DEVELOPMENT_PLAN" .

# Update references (example - use with care)
find . -type f -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" \
  -exec sed -i 's|MASTER_DEVELOPMENT_PLAN\.md|docs/master-plan.md|g' {} +

# Verify no orphaned references
grep -RIn --exclude-dir=node_modules --exclude-dir=.git "MASTER_DEVELOPMENT_PLAN" .
# Should return 0 results after update
```

## Link Check Commands

```bash
# Check specific docs
npx --yes markdown-link-check README.md
npx --yes markdown-link-check AGENTS.md
npx --yes markdown-link-check STATUS.md
npx --yes markdown-link-check docs/README.md

# Check all markdown files (careful - can be slow)
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" \
  -exec npx --yes markdown-link-check {} \;
```

## Completion Criteria

Before marking any section complete:
- ✅ File moved with `git mv` (preserves history)
- ✅ All references updated
- ✅ Links verified working
- ✅ No broken links in key docs
- ✅ Migration checkbox marked
- ✅ Committed to git

## Deletion Gate (PR4 Only)

Files can ONLY be deleted in PR4 if:
1. ✅ Migration checkbox in this log is checked
2. ✅ `grep -RIn <filename>` shows 0 references across repo
3. ✅ `npx markdown-link-check` passes for key docs
4. ✅ Content has been migrated to new location

**DO NOT DELETE ANY FILES IN PR3**

## Notes

### Strategy
- Use `git mv` to preserve commit history
- Move files first, update references second
- Test after each group of moves
- Keep this log updated with progress

### Special Considerations
- PODSUMOWANIE.md is in Polish - preserve encoding
- master-plan.md has many cross-references
- architecture-overview.md is heavily linked from other docs
- docs/architecture.md is very large (1266 lines)

### Reference Patterns to Find
```
master-plan.md
architecture-overview.md
examples.md
PODSUMOWANIE.md
docs/environment.md
docs/runbook.md
docs/PAPER_TRADING.md
docs/PLAN.md
docs/implementation-checklist.md
docs/OPEN_QUESTIONS.md
docs/REPORT_DIGEST.md
docs/adr/0001-initial-architecture.md
docs/architecture.md
```

## Progress Summary

**Total Files**: 13  
**Completed**: 13  
**In Progress**: 0  
**Remaining**: 0  

Last Updated: 2026-02-01 (PR3)
