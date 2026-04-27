/**
 * Mapai Backend — Review Service
 * Full CRUD for place reviews with privacy, social graph awareness, and points integration.
 * Requires a Supabase database connection — configure SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in your .env to enable all functionality.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { LoyaltyService } from './loyalty-service.js';
import { SocialService } from './social-service.js';

export class ReviewService {
    private loyalty = new LoyaltyService();
    private social = new SocialService();

    // ─── Create / Update Review ───────────────────────────────────────────────

    async createReview(
        userId: string,
        placeId: string,
        opts: {
            rating?: number;
            reviewText?: string;
            visitDate?: string;
            placeName?: string;
        }
    ): Promise<any> {
        if (!hasDatabase()) {
            console.warn('[ReviewService] No database — returning null for createReview (configure Supabase to persist reviews)');
            return null;
        }

        const isNew = !(await this.getReview(userId, placeId));

        const supabase = getSupabase()!;
        const { data, error } = await (supabase.from('place_reviews') as any)
            .upsert({
                user_id: userId,
                place_id: placeId,
                place_name: opts.placeName ?? null,
                rating: opts.rating ?? null,
                review_text: opts.reviewText ?? null,
                visit_date: opts.visitDate ?? null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,place_id' })
            .select()
            .single();

        if (error) throw new Error(`Failed to save review: ${error.message}`);

        // Create activity event
        await (supabase.from('activity_events') as any)
            .insert({
                actor_id: userId,
                activity_type: 'review_posted',
                place_id: placeId,
                place_name: opts.placeName ?? null,
                metadata: { rating: opts.rating },
            })
            .then(() => {});  // fire-and-forget

        // Award points on first review for this place
        let points_awarded = 0;
        let balance = 0;
        if (isNew) {
            const reward = await this.loyalty.awardForReview(userId, placeId);
            points_awarded = reward.transaction?.points ?? 0;
            balance = reward.balance;
        } else {
            balance = await this.loyalty.getBalance(userId);
        }

        return { review: data, points_awarded, balance };
    }

    // ─── Get Single Review (user + place) ─────────────────────────────────────

    async getReview(userId: string, placeId: string): Promise<any | null> {
        if (!hasDatabase()) {
            console.warn('[ReviewService] No database — returning null for getReview (configure Supabase to read reviews)');
            return null;
        }
        const supabase = getSupabase()!;
        const { data } = await (supabase.from('place_reviews') as any)
            .select('*')
            .eq('user_id', userId)
            .eq('place_id', placeId)
            .maybeSingle();
        return data ?? null;
    }

    // ─── Get All Reviews for a Place ──────────────────────────────────────────

    async getPlaceReviews(placeId: string, viewerId?: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[ReviewService] No database — returning empty array for getPlaceReviews (configure Supabase to read reviews)');
            return [];
        }

        const supabase = getSupabase()!;

        // Get blocked IDs so we can exclude them
        const blockedIds = viewerId ? await this.social.getBlockedIds(viewerId) : [];

        let query = (supabase.from('place_reviews') as any)
            .select(`
                id, user_id, place_id, place_name, rating, review_text, visit_date,
                created_at, updated_at,
                reviewer:users!place_reviews_user_id_fkey(
                    id, display_name, username, avatar_url
                )
            `)
            .eq('place_id', placeId)
            .order('created_at', { ascending: false });

        if (blockedIds.length > 0) {
            query = query.not('user_id', 'in', `(${blockedIds.map((id: string) => `"${id.replace(/"/g, '')}"`).join(',')})`);
        }

        const { data } = await query;
        return data || [];
    }

    // ─── Get Friends' Reviews for a Place ─────────────────────────────────────

    async getFriendReviews(placeId: string, userId: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[ReviewService] No database — returning empty array for getFriendReviews (configure Supabase to read friend reviews)');
            return [];
        }

        const supabase = getSupabase()!;

        // Resolve friend IDs
        const { data: friendships } = await (supabase.from('friendships') as any)
            .select('requester_id, addressee_id')
            .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (!friendships?.length) return [];

        const friendIds: string[] = (friendships || []).map((f: any) =>
            f.requester_id === userId ? f.addressee_id : f.requester_id
        );

        // Exclude blocked
        const blockedIds = await this.social.getBlockedIds(userId);
        const validFriendIds = friendIds.filter(id => !blockedIds.includes(id));

        if (!validFriendIds.length) return [];

        const { data } = await (supabase.from('place_reviews') as any)
            .select(`
                id, user_id, place_id, place_name, rating, review_text, visit_date,
                created_at,
                reviewer:users!place_reviews_user_id_fkey(
                    id, display_name, username, avatar_url
                )
            `)
            .eq('place_id', placeId)
            .in('user_id', validFriendIds)
            .order('created_at', { ascending: false });

        return data || [];
    }

    // ─── Get All Reviews by a User ────────────────────────────────────────────

    async getUserReviews(userId: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[ReviewService] No database — returning empty array for getUserReviews (configure Supabase to read reviews)');
            return [];
        }

        const supabase = getSupabase()!;
        const { data } = await (supabase.from('place_reviews') as any)
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        return data || [];
    }

    // ─── Delete Review ────────────────────────────────────────────────────────

    async deleteReview(userId: string, placeId: string): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[ReviewService] No database — deleteReview is a no-op (configure Supabase to delete reviews)');
            return;
        }
        const supabase = getSupabase()!;
        await (supabase.from('place_reviews') as any)
            .delete()
            .eq('user_id', userId)
            .eq('place_id', placeId);
    }
}
