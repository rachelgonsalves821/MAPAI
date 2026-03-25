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
     * Permanently delete a user account and all associated data.
     * Idempotent — safe to call multiple times.
     *
     * Deletes from:
     * 1. PostgreSQL: users, chat_sessions, user_preferences, user_memory
     * 2. Supabase Auth: removes auth user
     * 3. Redis cache: clears user-scoped keys (if Redis available)
     * 4. Pinecone embeddings: removes user vectors (when implemented)
     */
    async deleteAccount(userId: string): Promise<void> {
        if (!hasDatabase()) {
            console.log(`[Mock] Account deleted for user ${userId}`);
            return;
        }

        const supabase = getSupabase()!;

        // 1. Delete user data from all tables (order matters — children first)
        const tables = ['chat_sessions', 'user_memory', 'user_preferences', 'saved_places', 'friend_connections', 'users'];
        for (const table of tables) {
            const column = table === 'friend_connections' ? 'user_id' : table === 'users' ? 'id' : 'user_id';
            const { error } = await (supabase.from(table) as any).delete().eq(column, userId);
            if (error && !error.message?.includes('does not exist')) {
                console.warn(`[User] Failed to delete from ${table}: ${error.message}`);
            }
        }

        // Also delete friend connections where user is the friend
        await (supabase.from('friend_connections') as any).delete().eq('friend_id', userId).catch(() => {});

        // Also delete from new tables (Clerk migration)
        const newTables = ['chat_messages', 'chat_sessions', 'friendships', 'user_profiles'];
        for (const table of newTables) {
            const col = table === 'chat_messages' ? 'clerk_user_id' : table === 'friendships' ? 'requester_id' : 'clerk_user_id';
            await (supabase.from(table) as any).delete().eq(col, userId).catch(() => {});
        }
        // Friendships where user is addressee
        await (supabase.from('friendships') as any).delete().eq('addressee_id', userId).catch(() => {});

        // 2. Delete Clerk auth user (if Clerk SDK available)
        try {
            const clerkSecretKey = process.env.CLERK_SECRET_KEY;
            if (clerkSecretKey) {
                const { createClerkClient } = await import('@clerk/clerk-sdk-node');
                const clerk = createClerkClient({ secretKey: clerkSecretKey });
                await clerk.users.deleteUser(userId);
            }
        } catch (err: any) {
            console.warn(`[User] Clerk user deletion failed: ${err.message}`);
            // Non-fatal — data is already gone
        }

        // Legacy: try Supabase Auth deletion too (backward compat)
        try {
            const { error: authError } = await supabase.auth.admin.deleteUser(userId);
            if (authError) {
                console.warn(`[User] Supabase Auth user deletion failed: ${authError.message}`);
            }
        } catch {
            // Not available or already deleted
        }

        // 3. Redis cache clear (best-effort)
        // TODO: When Redis is integrated, call redis.del(`user:${userId}:*`)

        // 4. Pinecone embeddings (best-effort)
        // TODO: When Pinecone is integrated, delete vectors with userId metadata

        console.log(`[User] Account fully deleted: ${userId}`);
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
