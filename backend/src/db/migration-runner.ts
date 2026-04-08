/**
 * Mapai Database Migration Runner
 *
 * Reads all *.sql files from src/db/migrations/ sorted by numeric prefix,
 * checks which versions have already been applied, and executes pending
 * migrations in order — each wrapped in a transaction.
 *
 * Usage:
 *   npx tsx src/db/migration-runner.ts            # run pending migrations
 *   npx tsx src/db/migration-runner.ts --status   # show applied / pending
 *   npx tsx src/db/migration-runner.ts --dry-run  # print SQL without executing
 *
 * Connection (in priority order):
 *   1. DATABASE_URL env var
 *   2. SUPABASE_DB_HOST + SUPABASE_DB_PORT + SUPABASE_DB_PASSWORD +
 *      SUPABASE_DB_NAME + SUPABASE_DB_USER
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, ClientConfig } from 'pg';

// ─── Constants ───────────────────────────────────────────────────

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER     PRIMARY KEY,
    name        TEXT        NOT NULL,
    applied_at  TIMESTAMPTZ DEFAULT now()
);
`.trim();

// ─── Types ───────────────────────────────────────────────────────

interface MigrationFile {
    version: number;
    name: string;
    filename: string;
    fullPath: string;
}

interface AppliedMigration {
    version: number;
    name: string;
    applied_at: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────

function buildClientConfig(): ClientConfig {
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
    }

    const host     = process.env.SUPABASE_DB_HOST;
    const password = process.env.SUPABASE_DB_PASSWORD;

    if (!host || !password) {
        console.error('');
        console.error('ERROR: No database connection configured.');
        console.error('');
        console.error('Set one of:');
        console.error('  DATABASE_URL=postgres://user:pass@host:port/dbname');
        console.error('  SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD (+ optional PORT, NAME, USER)');
        console.error('');
        process.exit(1);
    }

    return {
        host,
        port:     parseInt(process.env.SUPABASE_DB_PORT  || '6543', 10),
        database: process.env.SUPABASE_DB_NAME           || 'postgres',
        user:     process.env.SUPABASE_DB_USER           || 'postgres',
        password,
        ssl: { rejectUnauthorized: false },
    };
}

function discoverMigrations(): MigrationFile[] {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.error(`ERROR: Migrations directory not found: ${MIGRATIONS_DIR}`);
        process.exit(1);
    }

    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'));

    const migrations: MigrationFile[] = [];

    for (const filename of files) {
        const match = filename.match(/^(\d+)[_-](.+)\.sql$/);
        if (!match) {
            console.warn(`  SKIP  ${filename} — does not match NNN_name.sql pattern`);
            continue;
        }

        const version = parseInt(match[1], 10);
        const name    = match[2].replace(/_/g, ' ');

        migrations.push({
            version,
            name,
            filename,
            fullPath: path.join(MIGRATIONS_DIR, filename),
        });
    }

    // Sort ascending by version number (not lexicographic)
    migrations.sort((a, b) => a.version - b.version);

    // Check for duplicate version numbers
    const seen = new Set<number>();
    for (const m of migrations) {
        if (seen.has(m.version)) {
            console.error(`ERROR: Duplicate migration version ${m.version} detected.`);
            process.exit(1);
        }
        seen.add(m.version);
    }

    return migrations;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
    await client.query(SCHEMA_MIGRATIONS_DDL);
}

async function getAppliedMigrations(client: Client): Promise<Map<number, AppliedMigration>> {
    const { rows } = await client.query<AppliedMigration>(
        'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
    );

    const map = new Map<number, AppliedMigration>();
    for (const row of rows) {
        map.set(row.version, row);
    }
    return map;
}

function printSeparator(): void {
    console.log('─'.repeat(60));
}

// ─── Commands ────────────────────────────────────────────────────

async function runStatus(client: Client, migrations: MigrationFile[]): Promise<void> {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    console.log('');
    console.log('Migration Status');
    printSeparator();
    console.log(`${'Ver'.padEnd(6)} ${'Status'.padEnd(10)} ${'Name'.padEnd(30)} Applied At`);
    printSeparator();

    for (const m of migrations) {
        const record     = applied.get(m.version);
        const status     = record ? 'applied' : 'pending';
        const appliedAt  = record ? record.applied_at.toISOString().slice(0, 19).replace('T', ' ') : '';
        const statusPad  = record ? `[applied]` : `[pending]`;

        console.log(
            `${String(m.version).padEnd(6)} ${statusPad.padEnd(10)} ${m.name.slice(0, 30).padEnd(30)} ${appliedAt}`
        );
    }

    // Warn about applied versions that no longer have files
    for (const [version, record] of applied) {
        const exists = migrations.some(m => m.version === version);
        if (!exists) {
            console.log(`${String(version).padEnd(6)} [orphaned]  ${record.name}`);
        }
    }

    printSeparator();
    const pendingCount = migrations.filter(m => !applied.has(m.version)).length;
    console.log(`${applied.size} applied, ${pendingCount} pending`);
    console.log('');
}

async function runDryRun(migrations: MigrationFile[], applied: Map<number, AppliedMigration>): Promise<void> {
    const pending = migrations.filter(m => !applied.has(m.version));

    if (pending.length === 0) {
        console.log('');
        console.log('No pending migrations.');
        console.log('');
        return;
    }

    console.log('');
    console.log(`Dry run — ${pending.length} pending migration(s):`);
    console.log('');

    for (const m of pending) {
        printSeparator();
        console.log(`-- [${m.version}] ${m.name}  (${m.filename})`);
        printSeparator();
        const sql = fs.readFileSync(m.fullPath, 'utf-8');
        console.log(sql);
        console.log('');
    }
}

async function runMigrations(client: Client, migrations: MigrationFile[]): Promise<void> {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const pending = migrations.filter(m => !applied.has(m.version));

    if (pending.length === 0) {
        console.log('');
        console.log('All migrations are up to date. Nothing to apply.');
        console.log('');
        return;
    }

    console.log('');
    console.log(`Found ${pending.length} pending migration(s). Applying...`);
    console.log('');

    let successCount = 0;

    for (const m of pending) {
        const label = `[${String(m.version).padStart(3, '0')}] ${m.name}`;
        process.stdout.write(`  Applying ${label} ... `);

        const sql = fs.readFileSync(m.fullPath, 'utf-8');

        try {
            await client.query('BEGIN');

            await client.query(sql);

            await client.query(
                'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
                [m.version, m.name]
            );

            await client.query('COMMIT');

            console.log('OK');
            successCount++;
        } catch (err: unknown) {
            await client.query('ROLLBACK').catch(() => undefined);

            const message = err instanceof Error ? err.message : String(err);
            console.log('FAILED');
            console.error('');
            console.error(`  ERROR in migration ${m.filename}:`);
            console.error(`  ${message}`);
            console.error('');
            console.error('  Transaction rolled back. Stopping migration run.');
            console.error('');
            process.exit(1);
        }
    }

    console.log('');
    printSeparator();
    console.log(`Applied ${successCount} migration(s) successfully.`);
    printSeparator();
    console.log('');
}

// ─── Entry point ─────────────────────────────────────────────────

async function main(): Promise<void> {
    const args      = process.argv.slice(2);
    const isDryRun  = args.includes('--dry-run');
    const isStatus  = args.includes('--status');

    console.log('Mapai Migration Runner');
    printSeparator();

    const migrations = discoverMigrations();
    console.log(`Discovered ${migrations.length} migration file(s) in ${MIGRATIONS_DIR}`);

    if (isDryRun) {
        // Dry run does not need a DB connection to print SQL,
        // but we still connect to identify which are pending.
        const client = new Client(buildClientConfig());
        try {
            await client.connect();
            await ensureMigrationsTable(client);
            const applied = await getAppliedMigrations(client);
            await runDryRun(migrations, applied);
        } finally {
            await client.end().catch(() => undefined);
        }
        return;
    }

    const client = new Client(buildClientConfig());

    try {
        process.stdout.write('Connecting to database ... ');
        await client.connect();
        console.log('OK');

        if (isStatus) {
            await runStatus(client, migrations);
        } else {
            await runMigrations(client, migrations);
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('');
        console.error(`FATAL: ${message}`);
        console.error('');
        process.exit(1);
    } finally {
        await client.end().catch(() => undefined);
    }
}

main();
