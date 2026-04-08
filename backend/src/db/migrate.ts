/**
 * DEPRECATED — migrate.ts
 *
 * This file is no longer the active migration entrypoint.
 * The database schema has been consolidated into a numbered migration
 * sequence managed by migration-runner.ts.
 *
 * To apply migrations:
 *   npx tsx src/db/migration-runner.ts
 *
 * To check status:
 *   npx tsx src/db/migration-runner.ts --status
 *
 * To preview pending SQL without executing:
 *   npx tsx src/db/migration-runner.ts --dry-run
 *
 * Migration files live in:
 *   src/db/migrations/
 *     001_foundation.sql
 *     002_social_layer.sql
 *     003_user_profiles.sql
 *     004_friendships.sql
 *     005_chat_history.sql
 *     006_planning.sql
 *     007_loyalty_reviews.sql
 *
 * The legacy vN SQL files have been archived to:
 *   src/db/_archive/
 */

console.error('');
console.error('migrate.ts is deprecated.');
console.error('');
console.error('Use the migration runner instead:');
console.error('  npx tsx src/db/migration-runner.ts');
console.error('');
console.error('See src/db/migration-runner.ts for full usage.');
console.error('');
process.exit(1);

// ─── Legacy export (kept for any imports that reference MIGRATION_SQL) ───────
// This is intentionally an empty string so that run-migration-pg.ts
// (which imports MIGRATION_SQL) does not break compilation while the
// project transitions to migration-runner.ts.
export const MIGRATION_SQL = '-- Deprecated: see migration-runner.ts';
