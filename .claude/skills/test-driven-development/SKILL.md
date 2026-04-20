---
name: test-driven-development
description: Strict RED-GREEN-REFACTOR TDD cycle. NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
---

# Test-Driven Development

**Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

## The Cycle: RED → GREEN → REFACTOR

### RED — Write ONE Failing Test
- Clear, descriptive test name
- Tests ONE behavior
- Uses real code, not mocks (unless absolutely unavoidable)
- **VERIFY RED**: Watch it fail. Confirm it fails for the RIGHT reason (missing feature, not a typo).

### GREEN — Write the Simplest Code to Pass
- Minimum code to make the test pass
- No extra features. No "while I'm here" improvements.
- No premature abstractions.
- **VERIFY GREEN**: Confirm this test passes AND no other tests broke.

### REFACTOR — Clean Up (Tests Stay Green)
- Remove duplication
- Improve names
- Simplify structure
- **Do not add behavior during refactor**
- Run tests after every change

## Critical Rules
- Wrote code before the test? **Delete it. Start over.** No keeping as "reference."
- One test at a time. Don't batch.
- Each cycle should take 2-10 minutes. If longer, the step is too big.
- Commit after each GREEN phase.

## Anti-Patterns to Avoid
- Writing tests after code (test-last is not TDD)
- Mocking everything (test behavior, not implementation)
- Testing private methods (test public API)
- Skipping the RED verification (you must see it fail first)
- Gold-plating during GREEN (just make it pass)
