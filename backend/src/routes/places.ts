/**
 * Mapai Backend — Places Routes
 * GET  /v1/places/nearby     — search nearby places with personalization.
 * GET  /v1/places/:id        — get enriched place details.
 * GET  /v1/places/:id/why    — generate a personalized "Why this?" explanation.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { PlacesService } from '../services/places-service.js';
import { MemoryService } from '../services/memory-service.js';
import { AiOrchestrator } from '../services/ai-orchestrator.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

const nearbyQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().min(100).max(50000).default(3000),
    category: z.string().optional(),
    max_results: z.coerce.number().min(1).max(50).default(20),
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhyFactor {
    dimension: string;
    signal: string;
    impact: 'positive' | 'negative' | 'neutral';
}

interface WhyResponse {
    explanation: string;
    factors: WhyFactor[];
    matchScore: number;
    basedOn: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a WhyResponse from place data + memory without calling the LLM.
 * Used as the fallback when the LLM times out or errors.
 */
function buildFallbackWhy(place: any, memory: any, stats: { sessions: number; visits: number }): WhyResponse {
    const factors: WhyFactor[] = [];

    // Category / cuisine match
    const category = (place.category || '').toLowerCase();
    const likes = (memory.cuisineLikes || []).map((c: string) => c.toLowerCase());
    const dislikes = (memory.cuisineDislikes || []).map((c: string) => c.toLowerCase());

    if (likes.some((l: string) => category.includes(l) || l.includes(category))) {
        factors.push({
            dimension: 'Cuisine',
            signal: `You've shown a preference for ${memory.cuisineLikes[0]}`,
            impact: 'positive',
        });
    } else if (dislikes.some((d: string) => category.includes(d) || d.includes(category))) {
        factors.push({
            dimension: 'Cuisine',
            signal: `This category is outside your usual preferences`,
            impact: 'negative',
        });
    }

    // Price
    if (place.priceLevel != null) {
        const inRange = place.priceLevel >= memory.priceRange.min && place.priceLevel <= memory.priceRange.max;
        factors.push({
            dimension: 'Price',
            signal: inRange
                ? `At ${'$'.repeat(place.priceLevel || 1)}, this fits your typical budget`
                : place.priceLevel > memory.priceRange.max
                    ? `At ${'$'.repeat(place.priceLevel || 1)}, this is above your usual budget`
                    : `At ${'$'.repeat(place.priceLevel || 1)}, this is very affordable for you`,
            impact: inRange ? 'positive' : place.priceLevel > memory.priceRange.max ? 'negative' : 'positive',
        });
    }

    // Rating
    if (place.rating >= 4.3) {
        factors.push({
            dimension: 'Rating',
            signal: `Rated ${place.rating}\u2605 \u2014 one of the highest in the area`,
            impact: 'positive',
        });
    } else if (place.rating >= 3.5) {
        factors.push({
            dimension: 'Rating',
            signal: `Solid community rating of ${place.rating}\u2605`,
            impact: 'neutral',
        });
    }

    // Open status
    if (place.openNow === true) {
        factors.push({ dimension: 'Availability', signal: 'Open right now', impact: 'positive' });
    }

    // Fallback narrative from matchReasons
    const reasons: string[] = place.matchReasons || [];
    const explanation = reasons.length > 0
        ? `We think you'll love ${place.name} because ${reasons.join(', ').toLowerCase()}.`
        : `${place.name} looks like a solid match based on your taste profile.`;

    return {
        explanation,
        factors: factors.slice(0, 4),
        matchScore: place.matchScore ?? 50,
        basedOn: buildBasedOnLabel(stats),
    };
}

function buildBasedOnLabel(stats: { sessions: number; visits: number }): string {
    const parts: string[] = [];
    if (stats.sessions > 0) {
        parts.push(`${stats.sessions} conversation${stats.sessions !== 1 ? 's' : ''}`);
    }
    if (stats.visits > 0) {
        parts.push(`${stats.visits} visit${stats.visits !== 1 ? 's' : ''}`);
    }
    return parts.length > 0 ? parts.join(' and ') : 'your taste profile';
}

/**
 * Fetch approximate conversation count and visit count for the user.
 * These are used in the "Based on X conversations and Y visits" footer.
 * Non-fatal — returns zeros if the DB is unavailable.
 */
async function getUserStats(userId: string): Promise<{ sessions: number; visits: number }> {
    if (!hasDatabase()) return { sessions: 0, visits: 0 };
    const supabase = getSupabase()!;
    try {
        const [{ count: sessions }, { count: visits }] = await Promise.all([
            (supabase as any).from('chat_sessions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
            (supabase as any).from('visits').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        ]);
        return { sessions: sessions ?? 0, visits: visits ?? 0 };
    } catch {
        return { sessions: 0, visits: 0 };
    }
}

export async function placesRoutes(app: FastifyInstance) {
    const places = new PlacesService();
    const memory = new MemoryService();
    const ai = new AiOrchestrator();

    /**
     * GET /v1/places/nearby?lat=42.36&lng=-71.06&radius=3000
     * Returns personalized place results sorted by match score.
     */
    app.get('/nearby', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = nearbyQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid query parameters', 'ValidationError', parsed.error.message)
                );
            }

            const { lat, lng, radius, category, max_results } = parsed.data;
            const userId = request.user!.id;

            try {
                const userMemory = await memory.getUserContext(userId);

                const results = await places.searchNearby({
                    location: { latitude: lat, longitude: lng },
                    radius,
                    category,
                    maxResults: max_results,
                    userId,
                    userMemory,
                });

                return envelope({
                    places: results,
                    total: results.length,
                    center: { lat, lng },
                    radius,
                });
            } catch (err: any) {
                app.log.error(err, 'Nearby search error');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to search nearby places', 'PlacesError')
                );
            }
        },
    });

    /**
     * GET /v1/places/:id/why
     * Generates a personalized "Why this?" explanation for the authenticated user.
     * Calls the LLM with a focused prompt; falls back to a structured summary on timeout.
     */
    app.get('/:id/why', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { id } = request.params as { id: string };
            const userId = request.user!.id;

            try {
                // Fetch place details and user context in parallel
                const [userMemory, stats] = await Promise.all([
                    memory.getUserContext(userId),
                    getUserStats(userId),
                ]);

                const place = await places.getDetails(id, userId, userMemory);
                if (!place) {
                    return reply.status(404).send(
                        errorResponse(404, 'Place not found', 'NotFoundError')
                    );
                }

                // Build factor list from scoring dimensions (mirrors scorePlace logic)
                const factors: WhyFactor[] = [];
                const category = (place.category || '').toLowerCase();
                const likes = (userMemory.cuisineLikes || []).map((c: string) => c.toLowerCase());
                const dislikes = (userMemory.cuisineDislikes || []).map((c: string) => c.toLowerCase());

                if (likes.some((l: string) => category.includes(l) || l.includes(category))) {
                    factors.push({
                        dimension: 'Cuisine',
                        signal: `You've shown a strong preference for ${userMemory.cuisineLikes[0]}`,
                        impact: 'positive',
                    });
                } else if (dislikes.some((d: string) => category.includes(d) || d.includes(category))) {
                    factors.push({
                        dimension: 'Cuisine',
                        signal: `This category sits outside your usual preferences`,
                        impact: 'negative',
                    });
                } else if (userMemory.cuisineLikes.length > 0) {
                    factors.push({
                        dimension: 'Cuisine',
                        signal: `A chance to explore beyond your usual ${userMemory.cuisineLikes[0]}`,
                        impact: 'neutral',
                    });
                }

                const inPriceRange = place.priceLevel >= userMemory.priceRange.min && place.priceLevel <= userMemory.priceRange.max;
                const aboveBudget = place.priceLevel > userMemory.priceRange.max;
                factors.push({
                    dimension: 'Price',
                    signal: inPriceRange
                        ? `At ${'$'.repeat(place.priceLevel || 1)}, this fits your typical budget`
                        : aboveBudget
                            ? `At ${'$'.repeat(place.priceLevel || 1)}, this is above your usual comfort zone`
                            : `At ${'$'.repeat(place.priceLevel || 1)}, very affordable for your budget`,
                    impact: inPriceRange ? 'positive' : aboveBudget ? 'negative' : 'positive',
                });

                if (place.rating > 0) {
                    factors.push({
                        dimension: 'Rating',
                        signal: place.rating >= 4.3
                            ? `Rated ${place.rating}\u2605 \u2014 one of the highest in the area`
                            : `Community rating of ${place.rating}\u2605`,
                        impact: place.rating >= 4.3 ? 'positive' : 'neutral',
                    });
                }

                if (userMemory.speedSensitivity === 'low' && place.openNow) {
                    factors.push({ dimension: 'Speed', signal: 'Open now and known for quick service', impact: 'positive' });
                }

                if (userMemory.ambiancePreferences.length > 0) {
                    factors.push({
                        dimension: 'Ambiance',
                        signal: `Aligns with your preference for ${userMemory.ambiancePreferences.slice(0, 2).join(', ')} spaces`,
                        impact: 'positive',
                    });
                }

                // Attempt LLM call with 3-second timeout
                const priceDollarSigns = '$'.repeat(place.priceLevel || 1);
                const priceLabel = ['free', 'budget-friendly', 'moderately priced', 'upscale', 'very upscale'][place.priceLevel] ?? 'moderately priced';
                const cuisineSummary = userMemory.cuisineLikes.length > 0
                    ? `likes: ${userMemory.cuisineLikes.join(', ')}`
                    : 'no strong cuisine preferences yet';
                const dislikeSummary = userMemory.cuisineDislikes.length > 0
                    ? `avoids: ${userMemory.cuisineDislikes.join(', ')}`
                    : '';
                const ambianceSummary = userMemory.ambiancePreferences.length > 0
                    ? userMemory.ambiancePreferences.join(', ')
                    : 'no specific ambiance preferences';

                const llmPrompt = `You are Mapai, a warm and knowledgeable Boston local guide. Write a personalized explanation of why ${place.name} is a great match for this specific user.

Place details:
- Name: ${place.name}
- Category: ${place.category}
- Price: ${priceDollarSigns} (${priceLabel})
- Rating: ${place.rating > 0 ? `${place.rating}/5.0` : 'not yet rated'}
- Open now: ${place.openNow ? 'yes' : 'no / unknown'}
- Match score: ${place.matchScore}%

User profile:
- Cuisine ${cuisineSummary}${dislikeSummary ? `; ${dislikeSummary}` : ''}
- Budget comfort: ${'$'.repeat(userMemory.priceRange.min)}–${'$'.repeat(userMemory.priceRange.max)}
- Pace preference: ${userMemory.speedSensitivity}
- Ambiance preferences: ${ambianceSummary}
- Dietary restrictions: ${userMemory.dietaryRestrictions.length > 0 ? userMemory.dietaryRestrictions.join(', ') : 'none'}

Key matching factors: ${(place.matchReasons || []).join(', ')}
Data richness: ${buildBasedOnLabel(stats)}

Write 3-4 sentences starting with "We think you'll love" that explain why this place fits this user. Be specific, warm, and direct — like a knowledgeable friend who knows both the place and the person. Reference actual user preferences. Don't use generic phrases like "based on your profile". Just say it naturally.

Return ONLY the explanation text. No labels, no JSON, no extra formatting.`;

                let explanation: string | null = null;
                try {
                    const llmResult = await Promise.race([
                        ai.generateFocused(llmPrompt),
                        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
                    ]);
                    if (typeof llmResult === 'string' && llmResult.trim().length > 20) {
                        explanation = llmResult.trim();
                    }
                } catch (llmErr) {
                    app.log.warn({ llmErr }, '[WhyThis] LLM call failed, using fallback');
                }

                const basedOn = buildBasedOnLabel(stats);

                if (explanation) {
                    const response: WhyResponse = {
                        explanation,
                        factors: factors.slice(0, 4),
                        matchScore: place.matchScore ?? 50,
                        basedOn,
                    };
                    return envelope(response);
                }

                // Fallback: structured response without LLM narrative
                return envelope(buildFallbackWhy(place, userMemory, stats));
            } catch (err: any) {
                app.log.error(err, 'Why-this error');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to generate explanation', 'PlacesError')
                );
            }
        },
    });

    /**
     * GET /v1/places/:id
     * Returns enriched place details with match score, social signals, etc.
     */
    app.get('/:id', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { id } = request.params as { id: string };
            const userId = request.user!.id;

            try {
                const userMemory = await memory.getUserContext(userId);
                const place = await places.getDetails(id, userId, userMemory);

                if (!place) {
                    return reply.status(404).send(
                        errorResponse(404, 'Place not found', 'NotFoundError')
                    );
                }

                return envelope({ place });
            } catch (err: any) {
                app.log.error(err, 'Place details error');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to get place details', 'PlacesError')
                );
            }
        },
    });

    /**
     * POST /v1/places/compare
     * Fetch enriched details for 2-4 places in one call.
     */
    app.post('/compare', {
        preHandler: optionalAuth,
        handler: async (request, reply) => {
            const schema = z.object({
                place_ids: z.array(z.string().min(1)).min(2).max(4),
            });

            const parsed = schema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Provide 2-4 place IDs', 'ValidationError')
                );
            }

            const userId = request.user?.id;
            // Fetch user memory for personalized scoring
            const userMemory = userId ? await memory.getUserContext(userId) : null;

            // Fetch all places in parallel
            const placeResults = await Promise.all(
                parsed.data.place_ids.map((id) =>
                    places.getDetails(id, userId ?? '', userMemory as any).catch(() => null)
                )
            );

            const validPlaces = placeResults.filter(Boolean);

            if (validPlaces.length < 2) {
                return reply.status(404).send(
                    errorResponse(404, 'Could not find enough places to compare', 'NotFoundError')
                );
            }

            return envelope({
                places: validPlaces,
                compared_at: new Date().toISOString(),
            });
        },
    });
}
