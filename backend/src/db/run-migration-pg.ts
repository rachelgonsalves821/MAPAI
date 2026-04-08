/**
 * Direct PostgreSQL migration runner.
 * Connects via the Supabase PostgreSQL wire protocol and executes DDL.
 * Run: npx tsx src/db/run-migration-pg.ts
 *
 * Required env vars:
 *   SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_PASSWORD
 *   (or set them in .env)
 */
import 'dotenv/config';
import { Client } from 'pg';
import { MIGRATION_SQL } from './migrate.js';

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}. Set it in .env or your shell.`);
    }
    return value;
}

async function main() {
    console.log('🗄️  Mapai Database Migration (direct PostgreSQL)');
    console.log('');

    const client = new Client({
        host: requireEnv('SUPABASE_DB_HOST'),
        port: parseInt(process.env.SUPABASE_DB_PORT || '6543', 10),
        database: process.env.SUPABASE_DB_NAME || 'postgres',
        user: process.env.SUPABASE_DB_USER || 'postgres',
        password: requireEnv('SUPABASE_DB_PASSWORD'),
        ssl: { rejectUnauthorized: false },
    });

    try {
        console.log('🔗 Connecting to Supabase PostgreSQL...');
        await client.connect();
        console.log('✅ Connected!');
        console.log('');

        console.log('📝 Running migration SQL...');
        await client.query(MIGRATION_SQL);
        console.log('');
        console.log('✅ Migration complete! Tables created:');
        console.log('   - users');
        console.log('   - user_preferences');
        console.log('   - places');
        console.log('   - social_signals');
        console.log('   - chat_sessions');
        console.log('');

        // Verify tables exist
        const { rows } = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        console.log('📋 Tables in public schema:');
        for (const row of rows) {
            console.log(`   ✓ ${row.table_name}`);
        }
    } catch (err: any) {
        console.error('❌ Migration failed:', err.message);
        if (err.position) {
            console.error('   At position:', err.position);
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

main().catch(console.error);
