/**
 * Mapai Backend — Memory Service
 * Manages user preferences + memory facts.
 * Uses Supabase/PostgreSQL when available, falls back to in-memory store.
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

// ─── In-memory fallback (used when Supabase is not configured) ───
const inMemoryPreferences = new Map<string, UserMemoryContext>();
const inMemoryFacts = new Map<string, MemoryFact[]>();

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
            return inMemoryPreferences.get(userId) || { ...DEFAULT_MEMORY };
        }

        const supabase = getSupabase()!;
        const { data, error } = await (supabase as any)
            .from('user_preferences')
            .select('dimension, value, confidence')
            .eq('user_id', userId)
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
            return inMemoryFacts.get(userId) || [];
        }

        const supabase = getSupabase()!;
        const { data, error } = await (supabase as any)
            .from('user_preferences')
            .select('*')
            .eq('user_id', userId)
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
            return this.learnInMemory(userId, meaningful);
        }

        const supabase = getSupabase()!;

        for (const insight of meaningful) {
            // Upsert: if same user+dimension+value exists, update confidence
            const { data: existing } = await (supabase as any)
                .from('user_preferences')
                .select('id, confidence')
                .eq('user_id', userId)
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
     * Manually update preferences (from profile screen).
     */
    async updatePreferences(
        userId: string,
        updates: Record<string, any>
    ): Promise<void> {
        if (!hasDatabase()) {
            return this.updatePreferencesInMemory(userId, updates);
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

            // Delete existing for this dimension, then insert new
            await supabase
                .from('user_preferences')
                .delete()
                .eq('user_id', userId)
                .eq('dimension', dimension);

            if (values.length > 0) {
                const rows = values.map((v: string) => ({
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
            await supabase
                .from('user_preferences')
                .delete()
                .eq('user_id', userId)
                .eq('dimension', 'price_preference');

            const label = this.priceRangeToLabel(updates.price_range);
            await supabase.from('user_preferences').insert({
                user_id: userId,
                dimension: 'price_preference',
                value: label,
                confidence: 0.95,
                source: 'explicit',
                decay_weight: 1.0,
            } as any);
        }

        if (updates.speed_sensitivity) {
            await supabase
                .from('user_preferences')
                .delete()
                .eq('user_id', userId)
                .eq('dimension', 'speed_sensitivity');

            await supabase.from('user_preferences').insert({
                user_id: userId,
                dimension: 'speed_sensitivity',
                value: updates.speed_sensitivity,
                confidence: 0.95,
                source: 'explicit',
                decay_weight: 1.0,
            } as any);
        }
    }

    /**
     * Clear all data (privacy/reset).
     */
    async clearAll(userId: string): Promise<void> {
        if (!hasDatabase()) {
            inMemoryPreferences.delete(userId);
            inMemoryFacts.delete(userId);
            return;
        }

        const supabase = getSupabase()!;
        await supabase.from('user_preferences').delete().eq('user_id', userId);
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
     */
    async processSurveyFeedback(userId: string, surveyId: string, rating: number, response: string): Promise<void> {
        if (!hasDatabase()) return;

        const supabase = getSupabase()!;
        
        // Update survey
        await (supabase as any).from('surveys').update({
            rating,
            response_text: response,
            processed: true
        }).eq('id', surveyId);

        // Update preferences based on rating
        // If rating is high (4-5), boost confidence in related facts
        // If rating is low (1-2), decrease confidence or mark as dislike
        if (rating >= 4) {
             // Heuristic: boost related dimensions
             console.log('Survey processed:', surveyId, rating, response);
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

    // ─── In-memory fallback methods ───────────────────────

    private learnInMemory(userId: string, insights: PreferenceInsight[]): void {
        const prefs = inMemoryPreferences.get(userId) || { ...DEFAULT_MEMORY };
        const facts = inMemoryFacts.get(userId) || [];

        for (const insight of insights) {
            switch (insight.type) {
                case 'cuisine_like':
                    if (!prefs.cuisineLikes.includes(insight.value)) {
                        prefs.cuisineLikes.push(insight.value);
                    }
                    break;
                case 'cuisine_dislike':
                    if (!prefs.cuisineDislikes.includes(insight.value)) {
                        prefs.cuisineDislikes.push(insight.value);
                    }
                    break;
                case 'price_preference':
                    prefs.priceRange = this.labelToPriceRange(insight.value);
                    break;
                case 'ambiance_preference':
                    if (!prefs.ambiancePreferences.includes(insight.value)) {
                        prefs.ambiancePreferences.push(insight.value);
                    }
                    break;
                case 'dietary_restriction':
                    if (!prefs.dietaryRestrictions.includes(insight.value)) {
                        prefs.dietaryRestrictions.push(insight.value);
                    }
                    break;
            }

            facts.push({
                dimension: insight.type,
                value: insight.value,
                confidence: insight.confidence,
                source: 'inferred',
                createdAt: new Date(),
                lastUpdated: new Date(),
                decayWeight: 1.0,
            });
        }

        inMemoryPreferences.set(userId, prefs);
        inMemoryFacts.set(userId, facts);
    }

    private updatePreferencesInMemory(userId: string, updates: Record<string, any>): void {
        const prefs = inMemoryPreferences.get(userId) || { ...DEFAULT_MEMORY };

        if (updates.cuisine_likes) prefs.cuisineLikes = updates.cuisine_likes;
        if (updates.cuisine_dislikes) prefs.cuisineDislikes = updates.cuisine_dislikes;
        if (updates.price_range) prefs.priceRange = updates.price_range;
        if (updates.speed_sensitivity) prefs.speedSensitivity = updates.speed_sensitivity;
        if (updates.ambiance_preferences) prefs.ambiancePreferences = updates.ambiance_preferences;
        if (updates.dietary_restrictions) prefs.dietaryRestrictions = updates.dietary_restrictions;

        inMemoryPreferences.set(userId, prefs);
    }
}
