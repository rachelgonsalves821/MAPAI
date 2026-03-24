/**
 * Mapai — Overnight Decision Logger
 * Utility for tracking autonomous decisions during overnight runs.
 */

export function logDecision(
  title: string,
  context: string,
  choice: string,
  why: string,
  risk: string
) {
  console.log(`[OVERNIGHT DECISION] ${title}`);
  console.log(`  Context: ${context}`);
  console.log(`  Choice: ${choice}`);
  console.log(`  Why: ${why}`);
  console.log(`  Risk: ${risk}`);
}
