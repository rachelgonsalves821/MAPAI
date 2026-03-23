/**
 * Mapai Backend — User Service
 * Manages user lifecycle, profiles, and onboarding status.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { MemoryService } from './memory-service.js';

export interface OnboardingPayload {
    user_id: string;
    display_name: string;
    preferences: {
        cuisine_preferences: string[];
        ambiance_preferences: string[];
        dietary_restrictions: string[];
        price_range: { min: number; max: number };
    };
}

export class UserService {
    private memoryService = new MemoryService();

    /**
     * Completes the onboarding process for a user.
     * Updates profile info and seeds initial preferences.
     */
    async completeOnboarding(payload: OnboardingPayload): Promise<void> {
        if (!hasDatabase()) {
            console.log(`[Mock] Onboarding complete for user ${payload.user_id}`);
            return;
        }

        const supabase = getSupabase()!;

        // 1. Update user profile
        const { error: profileError } = await (supabase
            .from('users') as any)
            .update({
                display_name: payload.display_name,
                onboarding_complete: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', payload.user_id);

        if (profileError) throw profileError;

        // 2. Save initial preferences
        await this.memoryService.updatePreferences(payload.user_id, {
            cuisine_likes: payload.preferences.cuisine_preferences,
            ambiance_preferences: payload.preferences.ambiance_preferences,
            dietary_restrictions: payload.preferences.dietary_restrictions,
            price_range: payload.preferences.price_range,
        });
    }

    /**
     * Gets a user's profile and onboarding status.
     */
    async getProfile(userId: string) {
        if (!hasDatabase()) {
            return { id: userId, display_name: 'Dev User', onboarding_complete: false };
        }

        const supabase = getSupabase()!;
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) return null;
        return data;
    }
}
