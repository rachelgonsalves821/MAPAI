/**
 * Mapai Data Pipeline — Reddit Social Signal Ingestion
 * Batch-fetches Reddit posts mentioning Boston venues and enriches
 * the place index with social signals via Claude summarization.
 *
 * Writes to Supabase when configured, falls back to social-signals.json.
 * Usage: npx tsx src/pipeline/reddit-ingest.ts
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '../db/supabase-client.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250514';
const REDDIT_BASE = 'https://www.reddit.com';

const TARGET_SUBREDDITS = ['boston', 'BostonFood', 'CambridgeMA'];

interface SocialSignal {
    place_id: string;
    source: 'reddit';
    quote: string;
    author: string;
    post_date: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    highlighted_attributes: string[];
}

interface PlaceRecord {
    id: string;
    name: string;
    neighborhood?: string;
    category: string;
}

/**
 * Load places from Supabase or JSON fallback.
 */
async function loadPlaces(): Promise<PlaceRecord[]> {
    const supabase = getSupabase();
    if (supabase) {
        const { data, error } = await supabase
            .from('places')
            .select('id, name, neighborhood, category');

        if (!error && data && data.length > 0) {
            console.log(`📄 Loaded ${data.length} places from Supabase`);
            return data as PlaceRecord[];
        }
    }

    // Fallback to JSON file
    try {
        const fs = await import('fs');
        const raw = fs.readFileSync('place-index.json', 'utf-8');
        const places = JSON.parse(raw);
        console.log(`📄 Loaded ${places.length} places from place-index.json`);
        return places;
    } catch {
        console.error('❌ No places found. Run seed-places.ts first.');
        process.exit(1);
    }
}

/**
 * Search a subreddit for posts mentioning a place.
 */
async function searchSubreddit(
    subreddit: string,
    placeName: string
): Promise<any[]> {
    const query = encodeURIComponent(`"${placeName}"`);
    const url = `${REDDIT_BASE}/r/${subreddit}/search.json?q=${query}&restrict_sr=1&sort=relevance&limit=5&t=year`;

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mapai/1.0 (data pipeline)' },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        return data?.data?.children?.map((c: any) => c.data) || [];
    } catch {
        return [];
    }
}

/**
 * Use Claude to extract structured social signals from Reddit posts.
 */
async function summarizeWithClaude(
    placeName: string,
    posts: any[]
): Promise<Omit<SocialSignal, 'place_id'>[]> {
    if (!ANTHROPIC_API_KEY || posts.length === 0) return [];

    const postsText = posts
        .map(
            (p, i) =>
                `[${i + 1}] u/${p.author} (${new Date(p.created_utc * 1000).toLocaleDateString()}):\n` +
                `Title: ${p.title}\n` +
                `Body: ${(p.selftext || '').slice(0, 500)}`
        )
        .join('\n\n');

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    try {
        const response = await client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 512,
            messages: [
                {
                    role: 'user',
                    content: `Extract social signals from these Reddit posts about "${placeName}" in Boston.

${postsText}

Return a JSON array. For each meaningful mention, include:
{
  "quote": "best verbatim quote (under 150 chars)",
  "author": "u/username",
  "post_date": "relative date like '2 weeks ago'",
  "sentiment": "positive|neutral|negative",
  "highlighted_attributes": ["up to 3 attributes like 'great ramen', 'long wait'"]
}

If no meaningful mentions, return []. Return ONLY the JSON array.`,
                },
            ],
        });

        const text = response.content[0]?.type === 'text' ? response.content[0].text : '[]';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const signals = JSON.parse(jsonMatch[0]);
        return signals.map((s: any) => ({
            ...s,
            source: 'reddit' as const,
        }));
    } catch (err) {
        console.error(`  Claude error for ${placeName}:`, err);
        return [];
    }
}

/**
 * Write signals to Supabase, or fallback to JSON.
 */
async function writeSignals(signals: SocialSignal[]): Promise<void> {
    const supabase = getSupabase();
    if (supabase && signals.length > 0) {
        console.log(`\n📤 Writing ${signals.length} signals to Supabase...`);

        const BATCH_SIZE = 50;
        let written = 0;

        for (let i = 0; i < signals.length; i += BATCH_SIZE) {
            const batch = signals.slice(i, i + BATCH_SIZE);
            const { error } = await (supabase.from('social_signals') as any).insert(batch as any[]);

            if (error) {
                console.error(`  ✗ Batch error:`, error.message);
            } else {
                written += batch.length;
            }
        }

        console.log(`✅ Wrote ${written}/${signals.length} signals to Supabase`);
        return;
    }

    // Fallback to JSON
    const fs = await import('fs');
    const outputPath = 'social-signals.json';
    fs.writeFileSync(outputPath, JSON.stringify(signals, null, 2));
    console.log(`📄 Saved ${signals.length} signals to ${outputPath}`);
}

async function main() {
    console.log('📱 Mapai Reddit Social Signal Pipeline');
    console.log(`   Subreddits: ${TARGET_SUBREDDITS.join(', ')}`);
    console.log('');

    const places = await loadPlaces();
    const allSignals: SocialSignal[] = [];
    let processed = 0;

    for (const place of places) {
        processed++;
        if (processed % 50 === 0) {
            console.log(`   Progress: ${processed}/${places.length}`);
        }

        // Throttle to respect Reddit rate limits
        await sleep(1000);

        let allPosts: any[] = [];
        for (const subreddit of TARGET_SUBREDDITS) {
            const posts = await searchSubreddit(subreddit, place.name);
            allPosts.push(...posts);
        }

        if (allPosts.length === 0) continue;

        // Deduplicate posts by ID
        const uniquePosts = Array.from(
            new Map(allPosts.map((p) => [p.id, p])).values()
        );

        console.log(`  🔍 ${place.name}: ${uniquePosts.length} Reddit mentions`);

        // Throttle Claude calls
        await sleep(500);

        const signals = await summarizeWithClaude(place.name, uniquePosts);
        for (const signal of signals) {
            allSignals.push({
                ...signal,
                place_id: place.id,
                source: 'reddit',
            });
        }
    }

    await writeSignals(allSignals);

    console.log('\n─────────────────────────────────────');
    console.log(`✅ Extracted ${allSignals.length} social signals from ${processed} places`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
