/**
 * Mapai Backend — Memory Service
 * Manages user preferences + memory facts.
 * Requires a Supabase database connection — configure SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in your .env to enable preference persistence.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { PreferenceInsight, UserMemoryContext } from './ai-orchestrator.js';

interface MemoryFact {
    dimension: string;
    value: string;
    confidence: number;
    source: 'explicit' | 'inferred' | 'behavioral';
    createdAt: Date;
    lastUpdated: Date;
    decayWeight: number;
}

const DEFAULT_MEMORY: UserMemoryContext = {
    cuisineLikes: [],
    cuisineDislikes: [],
    priceRange: { min: 1, max: 3 },
    speedSensitivity: 'moderate',
    ambiancePreferences: [],
    dietaryRestrictions: [],
};

export class MemoryService {
    /**
     * Get the current user context for prompt injection.
     */
    async getUserContext(userId: string): Promise<UserMemoryContext> {
        if (!hasDatabase()) {
            console.warn('[MemoryService] No database — returning default memory context for getUserContext (configure Supabase to persist user preferences)');
            return { ...DEFAULT_MEMORY };
        }

        const supabase = getSupabase()!;
        const { data, error } = await (supabase as any)
            .from('user_preferences')
            .select('dimension, value, confidence')
            .or(`user_id.eq.${userId},clerk_user_id.eq.${userId}`)
            .gte('confidence', 0.3)
            .order('confidence', { ascending: false });

        if (error || !data || data.length === 0) {
            return { ...DEFAULT_MEMORY };
        }

        return this.buildContextFromRows(data);
    }

    /**
     * Get all stored memory facts for user.
     */
    async getMemoryFacts(userId: string): Promise<MemoryFact[]> {
        if (!hasDatabase()) {
            console.warn('[MemoryService] No database — returning empty array for getMemoryFacts (configure Supabase to persist user preferences)');
            return [];
        }

        const supabase = getSupabase()!;
        const { data, error } = await (supabase as any)
            .from('user_preferences')
            .select('*')
            .or(`user_id.eq.${userId},clerk_user_id.eq.${userId}`)
            .order('last_updated', { ascending: false });

        if (error || !data) return [];

        return data.map((row: any) => ({
            dimension: row.dimension,
            value: row.value,
            confidence: parseFloat(row.confidence),
            source: row.source,
            createdAt: new Date(row.created_at),
            lastUpdated: new Date(row.last_updated),
            decayWeight: parseFloat(row.decay_weight),
        }));
    }

    /**
     * Learn from preference insights extracted from conversation.
     */
    async learnFromInsights(
        userId: string,
        insights: PreferenceInsight[]
    ): Promise<void> {
        // Filter low-confidence signals
        const meaningful = insights.filter((i) => i.confidence >= 0.5);
        if (meaningful.length === 0) return;

        if (!hasDatabase()) {
            console.warn('[MemoryService] No database — learnFromInsights is a no-op (configure Supabase to persist preference insights)');
            return;
        }

        const supabase = getSupabase()!;

        for (const insight of meaningful) {
            // Upsert: if same user+dimension+value exists, update confidence
            const { data: existing } = await (supabase as any)
                .from('user_preferences')
                .select('id, confidence')
                .or(`user_id.eq.${userId},clerk_user_id.eq.${userId}`)
                .eq('dimension', insight.type)
                .eq('value', insight.value)
                .maybeSingle();

            if (existing) {
                // Increase confidence on repeat signals
                const newConfidence = Math.min(
                    0.99,
                    parseFloat(String((existing as any).confidence)) + 0.05
                );
                await (supabase as any)
                    .from('user_preferences')
                    .update({
                        confidence: newConfidence,
                        last_updated: new Date().toISOString(),
                    })
                    .eq('id', (existing as any).id);
            } else {
                await supabase.from('user_preferences').insert({
                    user_id: userId,
                    clerk_user_id: userId,
                    dimension: insight.type,
                    value: insight.value,
                    confidence: insight.confidence,
                    source: 'inferred',
                    decay_weight: 1.0,
                } as any);
            }
        }
    }

    /**
     * Manually update preferences (from profile screen or onboarding).
     * Always writes with clerk_user_id as the canonical identifier.
     * Also sets user_id for backward compatibility with legacy rows.
     */
    async updatePreferences(
        userId: string,
        updates: Record<string, any>
    ): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[MemoryService] No database — updatePreferences is a no-op (configure Supabase to persist user preferences)');
            return;
        }

        const supabase = getSupabase()!;

        // Map update keys to dimension rows
        const dimensionMap: Record<string, { dimension: string; values: string[] }> = {
            cuisine_likes: { dimension: 'cuisine_like', values: updates.cuisine_likes || [] },
            cuisine_dislikes: { dimension: 'cuisine_dislike', values: updates.cuisine_dislikes || [] },
            ambiance_preferences: { dimension: 'ambiance_preference', values: updates.ambiance_preferences || [] },
            dietary_restrictions: { dimension: 'dietary_restriction', values: updates.dietary_restrictions || [] },
        };

        for (const [key, { dimension, values }] of Object.entries(dimensionMap)) {
            if (!updates[key]) continue;

            // Delete existing rows for this user+dimension — match on either ID column
            // to handle rows created before the Clerk migration.
            await (supabase as any)
                .from('user_preferences')
                .delete()
                .or(`clerk_user_id.eq.${userId},user_id.eq.${userId}`)
                .eq('dimension', dimension);

            if (values.length > 0) {
                const rows = values.map((v: string) => ({
                    clerk_user_id: userId,
                    user_id: userId,
                    dimension,
                    value: v,
                    confidence: 0.95,
                    source: 'explicit' as const,
                    decay_weight: 1.0,
                }));
                await (supabase.from('user_preferences') as any).insert(rows);
            }
        }

        // Handle scalar preferences
        if (updates.price_range) {
            await (supabase as any)
                .from('user_preferences')
                .delete()
                .or(`clerk_user_id.eq.${userId},user_id.eq.${userId}`)
                .eq('dimension', 'price_preference');

            const label = this.priceRangeToLabel(updates.price_range);
            await (supabase.from('user_preferences') as any).insert({
                clerk_user_id: userId,
                user_id: userId,
                dimension: 'price_preference',
                value: label,
                confidence: 0.95,
                source: 'explicit',
                decay_weight: 1.0,
            });
        }

        if (updates.speed_sensitivity) {
            await (supabase as any)
                .from('user_preferences')
                .delete()
                .or(`clerk_user_id.eq.${userId},user_id.eq.${userId}`)
                .eq('dimension', 'speed_sensitivity');

            await (supabase.from('user_preferences') as any).insert({
                clerk_user_id: userId,
                user_id: userId,
                dimension: 'speed_sensitivity',
                value: updates.speed_sensitivity,
                confidence: 0.95,
                source: 'explicit',
                decay_weight: 1.0,
            });
        }
    }

    /**
     * Clear all data (privacy/reset).
     * Matches on either ID column to catch rows from before the Clerk migration.
     */
    async clearAll(userId: string): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[MemoryService] No database — clearAll is a no-op (configure Supabase to delete user preferences)');
            return;
        }

        const supabase = getSupabase()!;
        await (supabase as any)
            .from('user_preferences')
            .delete()
            .or(`clerk_user_id.eq.${userId},user_id.eq.${userId}`);
    }

    /**
     * Track a visit to a place.
     */
    async recordVisit(userId: string, placeId: string): Promise<string | null> {
        if (!hasDatabase()) return null;

        const supabase = getSupabase()!;
        const { data, error } = await supabase.from('visits').insert({
            user_id: userId,
            place_id: placeId,
            status: 'visited',
            visit_date: new Date().toISOString()
        } as any).select().single();

        return (data as any)?.id || null;
    }

    /**
     * Process feedback from a survey.
     * Extracts preference signals from survey responses and writes them as
     * behavioral preference rows (confidence 0.6, source 'behavioral').
     *
     * Supports both the current 5-dimension format and the legacy 2-question
     * format ('improvement' / 'recommendation') for backward compatibility.
     *
     * Expected `response` format: JSON-encoded SurveyResponse[]
     *   New:    [{ questionId: 'satisfaction'|'speed'|'value'|'match'|'return', answer: '...' }, ...]
     *   Legacy: [{ questionId: 'improvement', answer: '...' }, { questionId: 'recommendation', answer: '...' }]
     */
    async processSurveyFeedback(userId: string, surveyId: string, rating: number, response: string): Promise<void> {
        interface SurveyResponse {
            questionId: string;
            answer: string;
        }

        let responses: SurveyResponse[];
        try {
            responses = JSON.parse(response) as SurveyResponse[];
        } catch {
            console.warn(`[Memory] Could not parse survey responses for survey ${surveyId}`);
            return;
        }

        const byId = (id: string) => responses.find(r => r.questionId === id);

        // ── satisfaction ─────────────────────────────────────────────────────
        // Top-2 positive answers boost place affinity; bottom-2 reduce it.
        // We surface this as a 'place_affinity' signal so the AI can weight
        // future recommendations toward / away from similar venues.
        const satisfaction = byId('satisfaction');
        if (satisfaction) {
            const positiveAnswers = new Set(['Loved it', 'Really good']);
            const negativeAnswers = new Set(['Disappointing', 'Bad experience']);

            if (positiveAnswers.has(satisfaction.answer)) {
                await this.upsertBehavioralPreference(userId, 'place_affinity', 'positive', 0.6);
            } else if (negativeAnswers.has(satisfaction.answer)) {
                await this.upsertBehavioralPreference(userId, 'place_affinity', 'negative', 0.6);
            }
        }

        // ── speed ────────────────────────────────────────────────────────────
        // Fast service → speed_sensitivity: low (user doesn't need to worry).
        // Slow service → speed_sensitivity: high (user values speed).
        const speed = byId('speed');
        if (speed) {
            if (speed.answer === 'Lightning fast' || speed.answer === 'Quick enough') {
                await this.upsertBehavioralPreference(userId, 'speed_sensitivity', 'low', 0.6);
            } else if (speed.answer === 'A bit slow' || speed.answer === 'Painfully slow') {
                await this.upsertBehavioralPreference(userId, 'speed_sensitivity', 'high', 0.6);
            }
        }

        // ── value ────────────────────────────────────────────────────────────
        // Pricey / overpriced answers signal high price sensitivity.
        // Positive value answers carry no actionable negative signal — skip.
        const value = byId('value');
        if (value) {
            if (value.answer === 'A bit pricey' || value.answer === 'Overpriced') {
                await this.upsertBehavioralPreference(userId, 'price_sensitivity', 'high', 0.6);
            }
        }

        // ── match ────────────────────────────────────────────────────────────
        // Measures recommendation calibration quality.
        // Logged so that an offline analytics pass can tune the ranking model.
        const match = byId('match');
        if (match) {
            const positiveMatch = new Set(['Even better than expected', 'Matched perfectly']);
            const negativeMatch = new Set(['Not quite', 'Completely off']);

            if (positiveMatch.has(match.answer)) {
                console.log(
                    `[Memory] Recommendation calibration POSITIVE for user ${userId} — survey ${surveyId}: "${match.answer}"`
                );
            } else if (negativeMatch.has(match.answer)) {
                console.log(
                    `[Memory] Recommendation calibration NEGATIVE for user ${userId} — survey ${surveyId}: "${match.answer}"`
                );
            }
        }

        // ── return ───────────────────────────────────────────────────────────
        // Top-2 positive answers signal high loyalty tendency for this place
        // category, which can inform future recommendation ranking.
        const returnQ = byId('return');
        if (returnQ) {
            if (returnQ.answer === 'Already planning my next visit' || returnQ.answer === 'Definitely yes') {
                await this.upsertBehavioralPreference(userId, 'loyalty_tendency', 'high', 0.6);
            }
        }

        // ── Legacy: improvement (2-question format) ──────────────────────────
        // Map each answer option to a preference dimension+value pair.
        // "Nothing — it's great as is" carries no negative signal — skip it.
        const legacyDimensionMap: Record<string, { dimension: string; value: string }> = {
            'Faster service':                  { dimension: 'speed_sensitivity',       value: 'high' },
            'More seating / less crowded':     { dimension: 'ambiance_preference',     value: 'quiet_spacious' },
            'Better music / ambiance':         { dimension: 'ambiance_preference',     value: 'good_ambiance' },
            'More menu variety':               { dimension: 'menu_variety_preference', value: 'high' },
            'Lower prices':                    { dimension: 'price_sensitivity',        value: 'high' },
        };

        const improvement = byId('improvement');
        if (improvement) {
            const mapping = legacyDimensionMap[improvement.answer];
            if (mapping) {
                await this.upsertBehavioralPreference(userId, mapping.dimension, mapping.value, 0.6);
            }
        }

        // ── Legacy: recommendation (2-question format) ───────────────────────
        // High-rating visits (4–5) signal the user genuinely liked this type of
        // place — surface this in logs so downstream analytics can act on it.
        const recommendation = byId('recommendation');
        if (recommendation && rating >= 4) {
            console.log(
                `[Memory] User ${userId} highly recommends place (rating: ${rating}, answer: "${recommendation.answer}")`
            );
        }
    }

    /**
     * Upsert a single behavioral preference row.
     * Increases confidence by 0.05 on repeat signals (capped at 0.99).
     */
    private async upsertBehavioralPreference(
        userId: string,
        dimension: string,
        value: string,
        confidence: number
    ): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[MemoryService] No database — upsertBehavioralPreference is a no-op (configure Supabase to persist behavioral preferences)');
            return;
        }

        const supabase = getSupabase()!;

        // The user_preferences table has a UNIQUE constraint on (clerk_user_id, dimension),
        // so there is at most one row per dimension per user.  We upsert on that key:
        // if the row already exists (possibly with a different value from an earlier signal),
        // update both the value and bump confidence; otherwise insert fresh.
        const { data: existing } = await (supabase as any)
            .from('user_preferences')
            .select('id, confidence')
            .eq('clerk_user_id', userId)
            .eq('dimension', dimension)
            .maybeSingle();

        if (existing) {
            const newConfidence = Math.min(0.99, parseFloat(String(existing.confidence)) + 0.05);
            await (supabase as any)
                .from('user_preferences')
                .update({
                    value,
                    confidence: newConfidence,
                    source: 'behavioral',
                    last_updated: new Date().toISOString(),
                })
                .eq('id', existing.id);
        } else {
            await (supabase as any)
                .from('user_preferences')
                .insert({
                    clerk_user_id: userId,
                    user_id: userId,
                    dimension,
                    value,
                    confidence,
                    source: 'behavioral',
                    decay_weight: 1.0,
                });
        }
    }

    // ─── Private helpers ──────────────────────────────────

    private buildContextFromRows(
        rows: Array<{ dimension: string; value: string; confidence: number }>
    ): UserMemoryContext {
        const ctx: UserMemoryContext = { ...DEFAULT_MEMORY };

        for (const row of rows) {
            switch (row.dimension) {
                case 'cuisine_like':
                    ctx.cuisineLikes.push(row.value);
                    break;
                case 'cuisine_dislike':
                    ctx.cuisineDislikes.push(row.value);
                    break;
                case 'price_preference':
                    ctx.priceRange = this.labelToPriceRange(row.value);
                    break;
                case 'speed_sensitivity':
                    ctx.speedSensitivity = row.value;
                    break;
                case 'ambiance_preference':
                    ctx.ambiancePreferences.push(row.value);
                    break;
                case 'dietary_restriction':
                    ctx.dietaryRestrictions.push(row.value);
                    break;
            }
        }

        return ctx;
    }

    private priceRangeToLabel(range: { min: number; max: number }): string {
        if (range.max <= 2) return 'budget';
        if (range.max <= 3) return 'moderate';
        return 'upscale';
    }

    private labelToPriceRange(label: string): { min: number; max: number } {
        const lower = label.toLowerCase();
        if (lower.includes('budget') || lower.includes('cheap')) return { min: 1, max: 2 };
        if (lower.includes('moderate') || lower.includes('mid')) return { min: 2, max: 3 };
        if (lower.includes('upscale') || lower.includes('expensive') || lower.includes('fine')) return { min: 3, max: 4 };
        return { min: 1, max: 3 };
    }
}
