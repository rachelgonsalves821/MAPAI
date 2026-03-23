/**
 * Mapai Data Pipeline — Orchestrator
 * Runs the full pipeline: seed places → ingest Reddit → (future) Google Reviews.
 *
 * Usage: npx tsx src/pipeline/run-pipeline.ts [--seed] [--ingest] [--all]
 */

import 'dotenv/config';

const args = process.argv.slice(2);
const runSeed = args.includes('--seed') || args.includes('--all') || args.length === 0;
const runIngest = args.includes('--ingest') || args.includes('--all') || args.length === 0;

async function runScript(name: string, path: string): Promise<boolean> {
    const { execSync } = await import('child_process');

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`▶ Running: ${name}`);
    console.log(`${'═'.repeat(50)}\n`);

    try {
        execSync(`npx tsx ${path}`, {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: process.env,
        });
        console.log(`\n✅ ${name} completed successfully`);
        return true;
    } catch (err) {
        console.error(`\n❌ ${name} failed:`, err);
        return false;
    }
}

async function main() {
    const startTime = Date.now();

    console.log('🗺️  Mapai Data Pipeline Orchestrator');
    console.log(`   Seed places: ${runSeed ? 'YES' : 'SKIP'}`);
    console.log(`   Reddit ingest: ${runIngest ? 'YES' : 'SKIP'}`);
    console.log('');

    let success = true;

    // Step 1: Seed places from Google Places API
    if (runSeed) {
        const ok = await runScript(
            'Place Index Seeder',
            'src/pipeline/seed-places.ts'
        );
        if (!ok) {
            console.error('⚠️  Seed failed — skipping ingest (no places to process)');
            success = false;
            if (runIngest) {
                console.log('   (Run with --ingest to skip seed and run ingest alone)');
            }
        }
    }

    // Step 2: Ingest Reddit social signals
    if (runIngest && success) {
        const ok = await runScript(
            'Reddit Social Signal Ingestion',
            'src/pipeline/reddit-ingest.ts'
        );
        if (!ok) success = false;
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`Pipeline ${success ? '✅ complete' : '⚠️ completed with errors'} in ${elapsed}s`);
    console.log(`${'═'.repeat(50)}`);

    if (!success) process.exit(1);
}

main().catch((err) => {
    console.error('Pipeline orchestrator failed:', err);
    process.exit(1);
});
