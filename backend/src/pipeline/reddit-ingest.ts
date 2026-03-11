/**
 * Mapai Data Pipeline — Reddit Social Signal Ingestion
 * Batch-fetches Reddit posts mentioning Boston venues and enriches
 * the place index with social signals via Claude summarization.
 *
 * Usage: npx tsx src/pipeline/reddit-ingest.ts
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250514';
const REDDIT_BASE = 'https://www.reddit.com';

const TARGET_SUBREDDITS = ['boston', 'BostonFood', 'CambridgeMA'];

interface SocialSignal {
    placeId: string;
    placeName: string;
    source: 'reddit';
    quote: string;
    author: string;
    date: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    highlightedAttributes: string[];
    createdAt: Date;
}

interface PlaceRecord {
    id: string;
    name: string;
    neighborhood?: string;
    category: string;
    [key: string]: any;
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
        const data = await res.json();
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
): Promise<Omit<SocialSignal, 'placeId' | 'createdAt'>[]> {
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
  "date": "relative date like '2 weeks ago'",
  "sentiment": "positive|neutral|negative",
  "highlightedAttributes": ["up to 3 attributes like 'great ramen', 'long wait'"]
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
            placeName,
        }));
    } catch (err) {
        console.error(`  Claude error for ${placeName}:`, err);
        return [];
    }
}

async function main() {
    console.log('📱 Mapai Reddit Social Signal Pipeline');
    console.log(`   Subreddits: ${TARGET_SUBREDDITS.join(', ')}`);
    console.log('');

    // Load place index (from seed-places output)
    let places: PlaceRecord[] = [];
    try {
        const raw = fs.readFileSync('place-index.json', 'utf-8');
        places = JSON.parse(raw);
        console.log(`📄 Loaded ${places.length} places from place-index.json`);
    } catch {
        console.error('❌ place-index.json not found. Run seed-places.ts first.');
        process.exit(1);
    }

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
                placeId: place.id,
                placeName: place.name,
                source: 'reddit',
                createdAt: new Date(),
            });
        }
    }

    // Write signals to JSON (Sprint 2: write to PostgreSQL)
    const outputPath = 'social-signals.json';
    fs.writeFileSync(outputPath, JSON.stringify(allSignals, null, 2));

    console.log('\n─────────────────────────────────────');
    console.log(`✅ Extracted ${allSignals.length} social signals`);
    console.log(`📄 Saved to ${outputPath}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
