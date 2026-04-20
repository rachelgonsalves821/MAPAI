---
name: writing-plans
description: Create detailed, zero-context implementation plans with bite-sized TDD steps.
---

# Writing Plans

**Core principle: Write plans assuming the engineer has zero context for the codebase.**

## Plan Structure

### Header (Required)
- **Goal**: What are we building/fixing and why?
- **Architecture**: How does this fit into the existing system?
- **Tech Stack**: Relevant technologies and versions

### File Structure Map
Before tasks, list every file that will be created or modified:
```
src/services/foo.ts    (new)
src/routes/bar.ts      (modify)
tests/foo.test.ts      (new)
```

### Tasks (Bite-Sized Steps)
Each task should take 2-5 minutes and follow TDD:
1. Write the failing test
2. Run it — verify it fails for the right reason
3. Implement the minimum code to pass
4. Run it — verify it passes
5. Commit

Each step must include:
- **Exact file paths** (no ambiguity)
- **Complete code snippets** (not pseudocode)
- **Specific commands** with expected outputs
- **What success looks like**

## Quality Checklist
- [ ] Every task is independently testable
- [ ] No task depends on uncommitted work from a later task
- [ ] File paths are real and verified
- [ ] Code snippets are complete (not "// ... rest of implementation")
- [ ] TDD cycle is explicit in every task

## Design Principles
- DRY — Don't repeat yourself
- YAGNI — Don't build what you don't need yet
- Frequent commits — One per GREEN phase
- Files organized by responsibility, not technical layer
