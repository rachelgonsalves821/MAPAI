/**
 * Mapai Backend — Memory Service
 * Manages user preferences + memory facts.
 * Sprint 1: In-memory store. Sprint 2: PostgreSQL via Supabase.
 */

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

// In-memory store (migrates to Supabase PostgreSQL in Sprint 2)
const userPreferences = new Map<string, UserMemoryContext>();
const userFacts = new Map<string, MemoryFact[]>();

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
        return userPreferences.get(userId) || { ...DEFAULT_MEMORY };
    }

    /**
     * Get all stored memory facts for user.
     */
    async getMemoryFacts(userId: string): Promise<MemoryFact[]> {
        return userFacts.get(userId) || [];
    }

    /**
     * Learn from preference insights extracted from conversation.
     */
    async learnFromInsights(
        userId: string,
        insights: PreferenceInsight[]
    ): Promise<void> {
        const prefs = await this.getUserContext(userId);
        const facts = userFacts.get(userId) || [];

        for (const insight of insights) {
            // Only learn from reasonably confident signals
            if (insight.confidence < 0.5) continue;

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
                    this.updatePriceRange(prefs, insight.value);
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

        userPreferences.set(userId, prefs);
        userFacts.set(userId, facts);
    }

    /**
     * Manually update preferences (from profile screen).
     */
    async updatePreferences(
        userId: string,
        updates: Record<string, any>
    ): Promise<void> {
        const prefs = await this.getUserContext(userId);

        if (updates.cuisine_likes) prefs.cuisineLikes = updates.cuisine_likes;
        if (updates.cuisine_dislikes) prefs.cuisineDislikes = updates.cuisine_dislikes;
        if (updates.price_range) prefs.priceRange = updates.price_range;
        if (updates.speed_sensitivity) prefs.speedSensitivity = updates.speed_sensitivity;
        if (updates.ambiance_preferences) prefs.ambiancePreferences = updates.ambiance_preferences;
        if (updates.dietary_restrictions) prefs.dietaryRestrictions = updates.dietary_restrictions;

        userPreferences.set(userId, prefs);
    }

    /**
     * Clear all data (privacy/reset).
     */
    async clearAll(userId: string): Promise<void> {
        userPreferences.delete(userId);
        userFacts.delete(userId);
    }

    private updatePriceRange(prefs: UserMemoryContext, value: string): void {
        const lower = value.toLowerCase();
        if (lower.includes('budget') || lower.includes('cheap')) {
            prefs.priceRange = { min: 1, max: 2 };
        } else if (lower.includes('moderate') || lower.includes('mid')) {
            prefs.priceRange = { min: 2, max: 3 };
        } else if (lower.includes('upscale') || lower.includes('expensive') || lower.includes('fine')) {
            prefs.priceRange = { min: 3, max: 4 };
        }
    }
}
