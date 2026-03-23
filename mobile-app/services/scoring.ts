/**
 * Mapai — Personalization Scoring Service
 * Uses Claude to compute REAL match scores based on user preferences + place attributes.
 * No random numbers — every score is explained by the LLM.
 */

import { Place, UserPreferences } from '../types';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250514';

// Cache to avoid re-scoring the same place for the same user state
const scoreCache = new Map<string, { scores: ScoredPlace[]; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface ScoredPlace extends Place {
    matchScore: number;
    matchReasons: string[];
}

/**
 * Score a batch of places against user preferences using Claude.
 * Returns places sorted by match score (highest first).
 */
export async function scorePlaces(
    places: Place[],
    userPreferences: UserPreferences,
    conversationContext?: string
): Promise<ScoredPlace[]> {
    if (places.length === 0) return [];

    // Build cache key from place IDs + preferences hash
    const cacheKey = JSON.stringify({
        ids: places.map((p) => p.id).sort(),
        prefs: userPreferences,
    });

    const cached = scoreCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.scores;
    }

    // Build a compact place summary for the LLM
    const placeSummaries = places.map((p, i) => ({
        index: i,
        name: p.name,
        category: p.category,
        types: p.categoryChips.slice(0, 3),
        rating: p.rating,
        priceLevel: p.priceLevel,
        address: p.address,
        openNow: p.openNow,
    }));

    const prompt = `You are Mapai's personalization engine. Score each place on how well it matches this specific user.

## User Preferences
- Cuisine likes: ${userPreferences.cuisinePreferences.join(', ') || 'none specified'}
- Cuisine dislikes: ${userPreferences.cuisineAversions.join(', ') || 'none specified'}
- Price comfort: ${'$'.repeat(userPreferences.priceRange.min)} to ${'$'.repeat(userPreferences.priceRange.max)}
- Speed preference: ${userPreferences.speedSensitivity}
- Ambiance: ${userPreferences.ambiancePreferences.join(', ') || 'none specified'}
- Dietary restrictions: ${userPreferences.dietaryRestrictions.join(', ') || 'none'}
${conversationContext ? `\n## Recent conversation context\n${conversationContext}` : ''}

## Places to Score
${JSON.stringify(placeSummaries, null, 1)}

## Instructions
For EACH place, return a match score (0-100) and exactly 2 short reasons (under 10 words each) explaining the score. Be specific and personal — reference the user's actual preferences.

A score of 85+ means "this is clearly a great fit for this user."
A score of 50-84 means "decent but not perfect."
Below 50 means "probably not what they want."

Return ONLY valid JSON array, no other text:
[{"index": 0, "score": 82, "reasons": ["Matches your love of Japanese", "Right in your price range"]}, ...]`;

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) {
            console.error('Scoring API error:', response.status);
            return fallbackScoring(places, userPreferences);
        }

        const data = await response.json();
        const rawText = data.content?.[0]?.text || '';

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.warn('Could not parse scoring response');
            return fallbackScoring(places, userPreferences);
        }

        const scores: { index: number; score: number; reasons: string[] }[] =
            JSON.parse(jsonMatch[0]);

        const scoredPlaces: ScoredPlace[] = places.map((place, i) => {
            const scoreEntry = scores.find((s) => s.index === i);
            return {
                ...place,
                matchScore: scoreEntry?.score ?? 50,
                matchReasons: scoreEntry?.reasons ?? ['Match score unavailable'],
            };
        });

        // Sort by match score descending
        scoredPlaces.sort((a, b) => b.matchScore - a.matchScore);

        scoreCache.set(cacheKey, { scores: scoredPlaces, timestamp: Date.now() });
        return scoredPlaces;
    } catch (error) {
        console.error('Scoring error:', error);
        return fallbackScoring(places, userPreferences);
    }
}

/**
 * Fallback heuristic scoring when LLM is unavailable.
 * Uses simple keyword matching — not as good but deterministic.
 */
function fallbackScoring(
    places: Place[],
    prefs: UserPreferences
): ScoredPlace[] {
    return places
        .map((place) => {
            let score = 50; // baseline
            const reasons: string[] = [];

            // Category match
            const categoryLikes = prefs.cuisinePreferences.map((c) => c.toLowerCase());
            const placeTypes = place.categoryChips.map((c) => c.toLowerCase());
            const categoryMatch = placeTypes.some((t) =>
                categoryLikes.some((l) => t.includes(l) || l.includes(t))
            );
            if (categoryMatch) {
                score += 20;
                reasons.push(`Matches your taste for ${prefs.cuisinePreferences[0]}`);
            }

            // Category aversion
            const categoryDislikes = prefs.cuisineAversions.map((c) => c.toLowerCase());
            const hasAversion = placeTypes.some((t) =>
                categoryDislikes.some((d) => t.includes(d) || d.includes(t))
            );
            if (hasAversion) {
                score -= 30;
                reasons.push('May not match your preferences');
            }

            // Price match
            if (
                place.priceLevel >= prefs.priceRange.min &&
                place.priceLevel <= prefs.priceRange.max
            ) {
                score += 10;
                reasons.push('Good fit for your budget');
            } else if (place.priceLevel > prefs.priceRange.max) {
                score -= 10;
                reasons.push('Above your typical price range');
            }

            // Rating boost
            if (place.rating >= 4.3) {
                score += 10;
                reasons.push(`Highly rated at ${place.rating}★`);
            }

            // Open now boost
            if (place.openNow === true) {
                score += 5;
            }

            score = Math.max(0, Math.min(100, score));
            return {
                ...place,
                matchScore: score,
                matchReasons: reasons.length > 0 ? reasons.slice(0, 2) : ['Nearby option'],
            };
        })
        .sort((a, b) => b.matchScore - a.matchScore);
}
