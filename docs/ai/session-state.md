# Session State Template

Use this template to track your work during a session. Copy and update as you progress.

## Session Information

**Date**: [YYYY-MM-DD]  
**Agent**: [Your identifier]  
**Task**: [Brief description or issue number]  
**Priority**: [P0/P1/P2]

## Current Status

**Phase**: [Discovery / Implementation / Testing / Review / Complete]  
**Last Updated**: [Timestamp]

## Objective

[What are you trying to accomplish? Reference issue or STATUS.md entry]

## Progress

### Completed
- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

### In Progress
- [ ] Current task
  - Details or blockers

### Next Steps
- [ ] Upcoming task 1
- [ ] Upcoming task 2

## Key Findings

### Code Locations
- File: `path/to/file.ts` - Purpose/notes
- File: `path/to/another.ts` - Purpose/notes

### Important Context
- Fact 1
- Fact 2
- Decision rationale

### Dependencies
- External: [Libraries, APIs]
- Internal: [Other modules, services]

## Issues Encountered

### Issue 1: [Description]
**Status**: [Open / Blocked / Resolved]  
**Impact**: [Low / Medium / High]  
**Notes**: [What you tried, what worked/didn't work]  
**Resolution**: [How it was fixed, or plan to fix]

### Issue 2: [Description]
**Status**: [Open / Blocked / Resolved]  
**Impact**: [Low / Medium / High]  
**Notes**: [What you tried, what worked/didn't work]  
**Resolution**: [How it was fixed, or plan to fix]

## Testing

### Tests Added
- Test: `path/to/test.test.ts` - What it validates
- Test: `path/to/another.test.ts` - What it validates

### Tests Run
```bash
# Commands and results
npm test -- specific.test.ts
✓ All tests passed

npm run build
✓ Build successful
```

### Manual Verification
- [ ] Ran `npm run dev` - verified [behavior]
- [ ] Tested [scenario] - result: [outcome]
- [ ] Checked logs for errors - [result]

## Changes Made

### Files Modified
1. `path/to/file1.ts`
   - Change: [What was changed]
   - Reason: [Why it was necessary]

2. `path/to/file2.ts`
   - Change: [What was changed]
   - Reason: [Why it was necessary]

### Files Created
1. `path/to/newfile.ts`
   - Purpose: [What it does]

### Files Deleted
1. `path/to/oldfile.ts`
   - Reason: [Why it was removed]
   - Migration: [Where functionality moved to]

## Documentation Updates

- [ ] Updated `docs/README.md` if structure changed
- [ ] Updated relevant .md files for code changes
- [ ] Added comments where necessary
- [ ] Updated CHANGELOG.md if significant change

## Decisions Made

### Decision 1: [Topic]
**Options Considered**: [A, B, C]  
**Chosen**: [Option]  
**Rationale**: [Why this option was selected]  
**Trade-offs**: [What we're giving up]

### Decision 2: [Topic]
**Options Considered**: [A, B, C]  
**Chosen**: [Option]  
**Rationale**: [Why this option was selected]  
**Trade-offs**: [What we're giving up]

## Open Questions

1. [Question that needs answering]
   - Context: [Why this matters]
   - Blocker: [Yes/No]

2. [Another question]
   - Context: [Why this matters]
   - Blocker: [Yes/No]

## References

### Documentation Read
- [System Overview](../../architecture-overview.md) - [Key takeaways]
- [Architecture](../ARCHITECTURE.md) - [Relevant sections]
- [Runbook](../RUNBOOK.md) - [Operational context]

### External Resources
- URL: [Link] - [What you learned]
- URL: [Link] - [What you learned]

## Notes for Next Session

[Things to remember, handoff notes, context for future work]

### Quick Start for Next Session
1. [First thing to do]
2. [Second thing to do]
3. [Reference to check]

### Watch Out For
- [Potential issue or gotcha]
- [Something that needs attention]

---

## Template Usage Guide

### When to Update This
- **Start of session**: Fill in Session Information and Objective
- **After each meaningful step**: Update Progress and Testing
- **When blocked**: Document in Issues Encountered
- **When making decisions**: Record in Decisions Made
- **End of session**: Complete Notes for Next Session

### Tips
- Update frequently (every 15-30 minutes)
- Be specific with file paths
- Include timestamps for time-sensitive info
- Link to issues and PRs
- Note both successes and failures
- Keep it concise but informative

### Integration with STATUS.md
- When you start work, add `in-progress` label to issue
- STATUS.md will automatically update (within 6 hours)
- Your session state provides detailed context that STATUS.md doesn't

### Integration with AGENTS.md
- Follow the priority order defined in AGENTS.md
- Reference acceptance criteria from the issue
- Ensure all hard rules are followed
- Check "Before Marking Complete" section before finishing

### Sharing Context
If you need to hand off to another agent or person:
1. Complete all sections above
2. Commit your changes
3. Update the issue with your progress
4. Reference this session state in your handoff notes
