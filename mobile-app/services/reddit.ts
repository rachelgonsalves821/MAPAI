/**
 * Mapai — Reddit Social Signal Service
 * Real Reddit integration to fetch place-level social signals from Boston subreddits.
 * Uses Reddit's public JSON API (no auth required for read-only).
 */

import { SocialSignal } from '../types';

// Target Boston subreddits (PRD §4.2)
const BOSTON_SUBREDDITS = ['boston', 'BostonFood', 'CambridgeMA'];
const REDDIT_BASE = 'https://www.reddit.com';

// Cache so we don't re-fetch for the same place
const signalCache = new Map<string, { signals: SocialSignal[]; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Search Reddit for mentions of a place and extract social signals.
 * Uses Reddit's public .json endpoints (no API key needed).
 */
export async function fetchRedditSignals(
    placeName: string,
    neighborhood?: string
): Promise<SocialSignal[]> {
    const cacheKey = placeName.toLowerCase();
    const cached = signalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.signals;
    }

    const signals: SocialSignal[] = [];

    for (const subreddit of BOSTON_SUBREDDITS) {
        try {
            const query = encodeURIComponent(
                `"${placeName}"${neighborhood ? ` ${neighborhood}` : ''}`
            );
            const url = `${REDDIT_BASE}/r/${subreddit}/search.json?q=${query}&restrict_sr=1&sort=relevance&limit=5&t=year`;

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mapai/1.0 (place discovery app)',
                },
            });

            if (!response.ok) continue;

            const data = await response.json();
            const posts = data?.data?.children || [];

            for (const post of posts) {
                const postData = post.data;
                if (!postData) continue;

                // Skip very short posts or removed content
                const text = postData.selftext || postData.title || '';
                if (text.length < 20) continue;

                // Use the post title + selftext, prefer selftext for richer quotes
                const quote = extractBestQuote(text, placeName);
                if (!quote) continue;

                const signal: SocialSignal = {
                    source: 'reddit',
                    quote,
                    author: `u/${postData.author || 'anonymous'}`,
                    date: formatRedditDate(postData.created_utc),
                    sentiment: inferSentiment(text),
                    highlightedAttributes: extractAttributes(text),
                };

                signals.push(signal);
            }
        } catch (error) {
            console.warn(`Reddit fetch error for r/${subreddit}:`, error);
        }
    }

    // Deduplicate and limit to top 3
    const uniqueSignals = deduplicateSignals(signals).slice(0, 3);
    signalCache.set(cacheKey, { signals: uniqueSignals, timestamp: Date.now() });
    return uniqueSignals;
}

/**
 * Fetch top comments from a Reddit post for richer quotes.
 */
export async function fetchPostComments(
    permalink: string,
    placeName: string
): Promise<SocialSignal[]> {
    try {
        const url = `${REDDIT_BASE}${permalink}.json?limit=10&sort=top`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mapai/1.0' },
        });

        if (!response.ok) return [];

        const data = await response.json();
        const comments = data?.[1]?.data?.children || [];
        const signals: SocialSignal[] = [];

        for (const comment of comments) {
            const cd = comment.data;
            if (!cd?.body || cd.body.length < 30) continue;

            // Only include comments that mention the place
            if (!cd.body.toLowerCase().includes(placeName.toLowerCase())) continue;

            const quote = extractBestQuote(cd.body, placeName);
            if (!quote) continue;

            signals.push({
                source: 'reddit',
                quote,
                author: `u/${cd.author || 'anonymous'}`,
                date: formatRedditDate(cd.created_utc),
                sentiment: inferSentiment(cd.body),
                highlightedAttributes: extractAttributes(cd.body),
            });
        }

        return signals.slice(0, 2);
    } catch {
        return [];
    }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Extract the most relevant quote from a body of text about a place.
 * Finds the sentence(s) most directly about the place.
 */
function extractBestQuote(text: string, placeName: string): string | null {
    // Clean up Reddit markdown
    const cleaned = text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove links
        .replace(/[*_~`#>]/g, '')                 // remove markdown
        .replace(/\n+/g, ' ')                     // collapse newlines
        .trim();

    // Split into sentences
    const sentences = cleaned.split(/(?<=[.!?])\s+/);

    // Find sentences mentioning the place
    const placeNameLower = placeName.toLowerCase();
    const relevant = sentences.filter(
        (s) => s.toLowerCase().includes(placeNameLower) && s.length > 20
    );

    if (relevant.length > 0) {
        // Return the best 1-2 sentences (under 200 chars)
        let quote = relevant[0];
        if (relevant.length > 1 && quote.length < 100) {
            quote += ' ' + relevant[1];
        }
        return quote.slice(0, 200).trim();
    }

    // If no direct mention, use the first substantial sentence
    const substantial = sentences.find((s) => s.length > 30);
    return substantial ? substantial.slice(0, 200).trim() : null;
}

/**
 * Simple sentiment inference from text keywords.
 * In production this would be done by the LLM pipeline.
 */
function inferSentiment(
    text: string
): 'positive' | 'neutral' | 'negative' {
    const lower = text.toLowerCase();

    const positiveWords = [
        'amazing', 'love', 'best', 'great', 'excellent', 'fantastic',
        'delicious', 'perfect', 'favorite', 'recommend', 'incredible',
        'outstanding', 'wonderful', 'gem', 'must-try', 'worth',
    ];
    const negativeWords = [
        'terrible', 'worst', 'awful', 'horrible', 'disgusting', 'overpriced',
        'rude', 'avoid', 'disappointing', 'mediocre', 'gross', 'bad', 'never again',
    ];

    const posCount = positiveWords.filter((w) => lower.includes(w)).length;
    const negCount = negativeWords.filter((w) => lower.includes(w)).length;

    if (posCount > negCount + 1) return 'positive';
    if (negCount > posCount + 1) return 'negative';
    if (posCount > 0) return 'positive';
    if (negCount > 0) return 'negative';
    return 'neutral';
}

/**
 * Extract place attributes mentioned in text.
 */
function extractAttributes(text: string): string[] {
    const lower = text.toLowerCase();
    const attributePatterns: [string, RegExp][] = [
        ['great food', /great food|delicious|tasty/],
        ['fast service', /fast service|quick|speedy/],
        ['slow service', /slow service|long wait|waited forever/],
        ['cozy atmosphere', /cozy|intimate|warm atmosphere/],
        ['loud', /loud|noisy|crowded/],
        ['quiet', /quiet|peaceful|calm/],
        ['good value', /good value|affordable|cheap|worth the price/],
        ['overpriced', /overpriced|expensive|not worth/],
        ['great cocktails', /cocktail|drinks|bar/],
        ['outdoor seating', /outdoor|patio|rooftop/],
        ['date night', /date night|romantic/],
        ['family friendly', /family|kids|children/],
        ['vegan options', /vegan|plant-based/],
        ['gluten free', /gluten.free|celiac/],
        ['long wait', /long wait|reservation|busy/],
        ['hidden gem', /hidden gem|underrated|sleeper/],
    ];

    const found: string[] = [];
    for (const [label, pattern] of attributePatterns) {
        if (pattern.test(lower)) {
            found.push(label);
        }
        if (found.length >= 3) break;
    }

    return found;
}

/**
 * Format Reddit UTC timestamp to human-readable relative date.
 */
function formatRedditDate(utcSeconds: number): string {
    const now = Date.now() / 1000;
    const diff = now - utcSeconds;

    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    return `${Math.floor(diff / 31536000)} years ago`;
}

/**
 * Remove near-duplicate signals (same author or very similar quotes).
 */
function deduplicateSignals(signals: SocialSignal[]): SocialSignal[] {
    const seen = new Set<string>();
    return signals.filter((s) => {
        const key = s.author || s.quote.slice(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
