---
name: dispatching-parallel-agents
description: Deploy 2+ agents on independent tasks simultaneously for maximum throughput.
---

# Dispatching Parallel Agents

**Core principle: Dispatch one agent per independent problem domain. Let them work concurrently.**

## The Pattern

### 1. Identify Independent Domains
- Group work by what's separate — different files, different subsystems, different concerns
- If two tasks touch the same files, they are NOT independent

### 2. Create Focused Agent Tasks
Each agent prompt must be:
- **Focused**: One problem domain only
- **Self-contained**: All context included in the prompt (don't rely on conversation history)
- **Specific about output**: State exactly what you want back (file changes, analysis, test results)
- **Constrained**: Clear boundaries on what NOT to touch

### 3. Dispatch in Parallel
- Use the Agent tool with multiple tool calls in a single message
- All agents run concurrently
- Each gets a fresh context window (no cross-contamination)

### 4. Review and Integrate
- Read all agent summaries
- Check for conflicts (did two agents modify the same file?)
- Run the full test suite
- Resolve any integration issues

## When to Use
- Multiple independent bugs in different subsystems
- Research tasks across different domains
- Parallel file modifications in separate directories
- Test writing for independent modules

## When NOT to Use
- Related failures (one root cause)
- Need full system context for the task
- Exploratory debugging (don't know the scope yet)
- Tasks that share mutable state
