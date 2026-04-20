---
name: systematic-debugging
description: Four-phase root cause debugging methodology. NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
---

# Systematic Debugging

**Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

## Phase 1: Root Cause Investigation
- Read error messages carefully and completely
- Reproduce the issue consistently
- Check recent changes (git log, git diff)
- Gather evidence at component boundaries
- Trace data flow backward from the error

## Phase 2: Pattern Analysis
- Find working examples of similar code in the codebase
- Compare working code against the broken code
- Identify specific differences that could cause the failure
- Check if the pattern works elsewhere but fails here

## Phase 3: Hypothesis and Testing
- Form a single, specific hypothesis about the root cause
- Test minimally — change ONE variable at a time
- Verify the hypothesis before implementing a fix
- If disproven, return to Phase 1 with new information

## Phase 4: Implementation
- Create a failing test case that demonstrates the bug
- Implement a single, focused fix
- Verify the fix resolves the original issue
- Verify no other tests are broken
- If 3+ fix attempts fail, STOP and question the architecture

## Critical Rules
- Never guess. Investigate first.
- Never fix multiple things at once.
- If you can't reproduce it, you don't understand it.
- After 3 failed fixes, the problem is likely architectural — escalate.
- Log your hypothesis chain so you don't repeat failed approaches.
