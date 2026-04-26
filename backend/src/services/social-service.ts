/**
 * Mapai Backend — Social Service
 * Handles loved places, activity feed, blocks, and friend social features.
 * Requires a Supabase database connection — configure SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in your .env to enable all functionality.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

/** Strip anything that isn't alphanumeric, underscore, or hyphen to prevent filter injection. */
function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

export class SocialService {

    // ─── Blocks ──────────────────────────────────────────

    async blockUser(blockerId: string, blockedId: string, reason?: string): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — blockUser is a no-op (configure Supabase to persist blocks)');
            return;
        }
        const supabase = getSupabase()!;
        await supabase.from('blocks').upsert({
            blocker_id: blockerId,
            blocked_id: blockedId,
            reason,
        } as any, { onConflict: 'blocker_id,blocked_id' });

        // Remove any existing friendship edge between the two users (either direction)
        await (supabase.from('friendships') as any).delete()
            .or(
                `and(requester_id.eq.${blockerId},addressee_id.eq.${blockedId}),` +
                `and(requester_id.eq.${blockedId},addressee_id.eq.${blockerId})`
            );
    }

    async unblockUser(blockerId: string, blockedId: string): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — unblockUser is a no-op (configure Supabase to persist blocks)');
            return;
        }
        const supabase = getSupabase()!;
        await supabase.from('blocks').delete()
            .eq('blocker_id', blockerId).eq('blocked_id', blockedId);
    }

    async isBlocked(userId1: string, userId2: string): Promise<boolean> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning false for isBlocked (configure Supabase to enable block checks)');
            return false;
        }
        const supabase = getSupabase()!;
        const { count } = await (supabase.from('blocks') as any)
            .select('id', { count: 'exact', head: true })
            .or(`and(blocker_id.eq.${sanitizeId(userId1)},blocked_id.eq.${sanitizeId(userId2)}),and(blocker_id.eq.${sanitizeId(userId2)},blocked_id.eq.${sanitizeId(userId1)})`);
        return (count ?? 0) > 0;
    }

    async getBlockedIds(userId: string): Promise<string[]> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning empty blocked list for getBlockedIds (configure Supabase to enable blocks)');
            return [];
        }
        const supabase = getSupabase()!;
        const { data } = await (supabase.from('blocks') as any)
            .select('blocked_id')
            .eq('blocker_id', userId);
        return (data || []).map((r: any) => r.blocked_id);
    }

    // ─── Loved Places ────────────────────────────────────

    async lovePlace(userId: string, placeId: string, opts: {
        rating?: number;
        oneLineReview?: string;
        personalNote?: string;
        visibility?: 'public' | 'friends' | 'private';
        placeName?: string;
        location?: { latitude: number; longitude: number };
    } = {}): Promise<any> {
        console.log(`[SocialService] lovePlace called — userId=${userId?.slice(0,8)}... placeId=${placeId} hasDB=${hasDatabase()}`);
        if (!hasDatabase()) {
            console.error('[SocialService] lovePlace: NO DATABASE — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on this server. Loved place will NOT be saved.');
            throw new Error('Database not configured on server — cannot save loved place. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
        }

        const supabase = getSupabase()!;
        const { data, error } = await (supabase.from('user_loved_places') as any)
            .upsert({
                user_id: userId,
                place_id: placeId,
                place_name: opts.placeName,
                rating: opts.rating,
                one_line_review: opts.oneLineReview,
                personal_note: opts.personalNote,
                visibility: opts.visibility || 'friends',
                last_visited_at: new Date().toISOString(),
            }, { onConflict: 'user_id,place_id' })
            .select()
            .single();

        if (error) {
            console.error('[SocialService] lovePlace upsert failed:', error.message, error.code, error.details);
            throw new Error(`Failed to save loved place: ${error.message}`);
        }

        // Increment visit count (non-blocking — failure here is non-critical)
        if (data) {
            (supabase.from('user_loved_places') as any)
                .update({ visit_count: (data.visit_count || 0) + 1 })
                .eq('id', data.id)
                .then(({ error: updateErr }: any) => {
                    if (updateErr) console.warn('[SocialService] visit_count increment failed:', updateErr.message);
                });
        }

        // Fire-and-forget activity event — never block the love action on this
        this.createActivity(userId, 'place_loved', placeId, opts.placeName)
            .catch((err: any) => console.warn('[SocialService] createActivity failed (non-critical):', err?.message));

        return data;
    }

    async unlovePlace(userId: string, placeId: string): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — unlovePlace is a no-op (configure Supabase to persist loved places)');
            return;
        }
        const supabase = getSupabase()!;
        const { error } = await supabase.from('user_loved_places').delete()
            .eq('user_id', userId).eq('place_id', placeId);
        if (error) {
            console.error('[SocialService] unlovePlace delete failed:', error.message, error.code);
            throw new Error(`Failed to remove loved place: ${error.message}`);
        }
    }

    async getLovedPlaces(userId: string, viewerId?: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning empty array for getLovedPlaces (configure Supabase to persist loved places)');
            return [];
        }

        const supabase = getSupabase()!;
        let query = (supabase.from('user_loved_places') as any)
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        // If viewer is not the owner, filter by visibility
        if (viewerId && viewerId !== userId) {
            query = query.in('visibility', ['public', 'friends']);
        }

        const { data } = await query;
        return data || [];
    }

    async getFriendsWhoLovePlace(placeId: string, userId: string): Promise<any[]> {
        if (!hasDatabase()) return [];

        const supabase = getSupabase()!;

        // Resolve accepted friend IDs from the single-edge friendships table
        const friendIds = await this._getAcceptedFriendIds(userId);
        if (!friendIds.length) return [];

        // Get friends who loved this place
        const { data } = await (supabase.from('user_loved_places') as any)
            .select('user_id, rating, one_line_review, last_visited_at, score_speed, score_value, score_quality')
            .eq('place_id', placeId)
            .in('user_id', friendIds)
            .neq('visibility', 'private');

        return data || [];
    }

    // ─── Activity Feed ───────────────────────────────────

    async createActivity(
        actorId: string,
        type: string,
        placeId: string,
        placeName?: string,
        metadata: any = {}
    ): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — createActivity is a no-op (configure Supabase to persist activity events)');
            return;
        }

        const supabase = getSupabase()!;
        await supabase.from('activity_events').insert({
            actor_id: actorId,
            activity_type: type,
            place_id: placeId,
            place_name: placeName,
            metadata,
        } as any);
    }

    async getFriendFeed(userId: string, limit = 20, cursor?: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning empty array for getFriendFeed (configure Supabase to enable activity feed)');
            return [];
        }

        const supabase = getSupabase()!;

        // Resolve accepted friend IDs from the single-edge friendships table
        const friendIds = await this._getAcceptedFriendIds(userId);
        if (!friendIds.length) return [];

        // Get blocked IDs to exclude
        const blockedIds = await this.getBlockedIds(userId);
        const validFriendIds = friendIds.filter((id: string) => !blockedIds.includes(id));

        if (!validFriendIds.length) return [];

        // Fetch activity from friends
        let query = (supabase.from('activity_events') as any)
            .select('*')
            .in('actor_id', validFriendIds)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data } = await query;
        return data || [];
    }

    // ─── Reactions ───────────────────────────────────────

    async reactToActivity(activityId: string, userId: string, reaction: string): Promise<void> {
        if (!hasDatabase()) return;
        const supabase = getSupabase()!;
        await (supabase.from('activity_reactions') as any).upsert({
            activity_id: activityId,
            user_id: userId,
            reaction,
        }, { onConflict: 'activity_id,user_id' });
    }

    async removeReaction(activityId: string, userId: string): Promise<void> {
        if (!hasDatabase()) return;
        const supabase = getSupabase()!;
        await supabase.from('activity_reactions').delete()
            .eq('activity_id', activityId).eq('user_id', userId);
    }

    async getReactions(activityId: string): Promise<any[]> {
        if (!hasDatabase()) return [];
        const supabase = getSupabase()!;
        const { data } = await (supabase.from('activity_reactions') as any)
            .select('user_id, reaction, created_at')
            .eq('activity_id', activityId);
        return data || [];
    }

    // ─── Reports ─────────────────────────────────────────

    async reportUser(reporterId: string, reportedId: string, type: string, details?: string): Promise<void> {
        if (!hasDatabase()) return;
        const supabase = getSupabase()!;
        await supabase.from('reports').insert({
            reporter_id: reporterId,
            reported_id: reportedId,
            report_type: type,
            details,
        } as any);
    }

    // ─── Friends List (enhanced) ─────────────────────────

    async getFriends(userId: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning empty array for getFriends (configure Supabase to enable friend lookups)');
            return [];
        }
        const supabase = getSupabase()!;

        // Fetch accepted edges; keep created_at so we can expose friends_since
        const { data: edges } = await (supabase.from('friendships') as any)
            .select('requester_id, addressee_id, created_at')
            .or(
                `and(requester_id.eq.${userId},addressee_id.neq.${userId}),` +
                `and(addressee_id.eq.${userId},requester_id.neq.${userId})`
            )
            .eq('status', 'accepted');

        if (!edges?.length) return [];

        const friendIds = edges.map((e: any) =>
            e.requester_id === userId ? e.addressee_id : e.requester_id
        );

        // Get friend profiles
        const { data: users } = await (supabase.from('users') as any)
            .select('id, display_name, username, avatar_url')
            .in('id', friendIds);

        return (users || []).map((u: any) => {
            const edge = edges.find((e: any) =>
                e.requester_id === u.id || e.addressee_id === u.id
            );
            return { ...u, friends_since: edge?.created_at };
        });
    }

    async getFriendshipStatus(userId: string, targetId: string): Promise<string> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning "none" for getFriendshipStatus (configure Supabase to enable friendship checks)');
            return 'none';
        }
        if (userId === targetId) return 'self';

        const supabase = getSupabase()!;

        // Check blocked first
        if (await this.isBlocked(userId, targetId)) return 'blocked';

        // Look for any edge between the two users in the friendships table
        const { data: edge } = await (supabase.from('friendships') as any)
            .select('id, status, requester_id, addressee_id')
            .or(
                `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),` +
                `and(requester_id.eq.${targetId},addressee_id.eq.${userId})`
            )
            .maybeSingle();

        if (!edge) return 'none';

        if (edge.status === 'accepted') return 'friends';

        if (edge.status === 'pending') {
            return edge.requester_id === userId ? 'pending_outgoing' : 'pending_incoming';
        }

        return 'none';
    }

    // ─── Place View Tracking ─────────────────────────────

    /**
     * Records that a user opened a place detail screen.
     * Upserts into recent_places_viewed (incrementing view_count + refreshing
     * last_viewed_at) and optionally emits a 'place_viewed' activity event.
     * The activity event is throttled to once per hour per user+place pair
     * to avoid flooding the feed.
     */
    async trackPlaceView(userId: string, placeId: string, opts: {
        placeName?: string;
        latitude?: number;
        longitude?: number;
        category?: string;
        emitActivity?: boolean;
    } = {}): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — trackPlaceView is a no-op');
            return;
        }
        const supabase = getSupabase()!;
        const { emitActivity = false } = opts; // default false — views are private by default

        // Upsert into recent_places_viewed
        const now = new Date().toISOString();
        const { data: existing } = await (supabase.from('recent_places_viewed') as any)
            .select('id, view_count')
            .eq('user_id', userId)
            .eq('place_id', placeId)
            .maybeSingle();

        if (existing) {
            await (supabase.from('recent_places_viewed') as any)
                .update({
                    last_viewed_at: now,
                    view_count: (existing.view_count || 1) + 1,
                    place_name: opts.placeName,
                    latitude: opts.latitude,
                    longitude: opts.longitude,
                    category: opts.category,
                })
                .eq('id', existing.id);
        } else {
            await (supabase.from('recent_places_viewed') as any)
                .insert({
                    user_id: userId,
                    place_id: placeId,
                    place_name: opts.placeName,
                    latitude: opts.latitude,
                    longitude: opts.longitude,
                    category: opts.category,
                    view_count: 1,
                    first_viewed_at: now,
                    last_viewed_at: now,
                });
        }

        // Optionally emit activity event (throttled — once per hour per user+place)
        if (emitActivity) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { count } = await (supabase.from('activity_events') as any)
                .select('id', { count: 'exact', head: true })
                .eq('actor_id', userId)
                .eq('place_id', placeId)
                .eq('activity_type', 'place_viewed')
                .gte('created_at', oneHourAgo);
            if ((count ?? 0) === 0) {
                await this.createActivity(userId, 'place_viewed', placeId, opts.placeName);
            }
        }
    }

    /**
     * Returns the N most recently viewed places for a user.
     * Powers the "Recently Viewed" section in the Social / Profile tab.
     */
    async getRecentPlacesViewed(userId: string, limit = 20): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning empty array for getRecentPlacesViewed');
            return [];
        }
        const supabase = getSupabase()!;
        const { data } = await (supabase.from('recent_places_viewed') as any)
            .select('*')
            .eq('user_id', userId)
            .order('last_viewed_at', { ascending: false })
            .limit(limit);
        return data || [];
    }

    /**
     * Efficiently checks whether a user has loved a specific place.
     * Much faster than fetching the entire loved list and filtering client-side.
     */
    async isPlaceLoved(userId: string, placeId: string): Promise<boolean> {
        if (!hasDatabase()) return false;
        const supabase = getSupabase()!;
        const { count } = await (supabase.from('user_loved_places') as any)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('place_id', placeId);
        return (count ?? 0) > 0;
    }

    /**
     * Enriched friend feed — joins actor profile (display_name, avatar_url)
     * so the frontend doesn't need a second round-trip per card.
     * Excludes 'place_viewed' events from the public feed (those are private).
     */
    async getEnrichedFriendFeed(userId: string, limit = 20, cursor?: string): Promise<any[]> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning empty array for getEnrichedFriendFeed');
            return [];
        }
        const supabase = getSupabase()!;
        const friendIds = await this._getAcceptedFriendIds(userId);
        if (!friendIds.length) return [];
        const blockedIds = await this.getBlockedIds(userId);
        const validFriendIds = friendIds.filter((id: string) => !blockedIds.includes(id));
        if (!validFriendIds.length) return [];

        let query = (supabase.from('activity_events') as any)
            .select('id, actor_id, activity_type, place_id, place_name, metadata, created_at')
            .in('actor_id', validFriendIds)
            .in('activity_type', ['place_loved', 'place_visited', 'review_posted', 'place_shared'])
            .order('created_at', { ascending: false })
            .limit(limit);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: events } = await query;
        if (!events?.length) return [];

        // Batch-fetch actor profiles to avoid N+1 queries
        const uniqueActorIds = [...new Set(events.map((e: any) => e.actor_id))];
        const { data: profiles } = await (supabase.from('user_profiles') as any)
            .select('user_id, display_name, username, avatar_url')
            .in('user_id', uniqueActorIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

        return events.map((row: any) => {
            const profile = profileMap.get(row.actor_id);
            return {
                ...row,
                actor_name: profile?.display_name ?? null,
                actor_username: profile?.username ?? null,
                actor_avatar_url: profile?.avatar_url ?? null,
            };
        });
    }

    // ─── Internal helpers ────────────────────────────────

    /**
     * Returns the IDs of all users who share an accepted friendship edge with
     * `userId`, regardless of which side of the edge they sit on.
     */
    private async _getAcceptedFriendIds(userId: string): Promise<string[]> {
        const supabase = getSupabase()!;
        const { data: edges } = await (supabase.from('friendships') as any)
            .select('requester_id, addressee_id')
            .or(
                `and(requester_id.eq.${userId},addressee_id.neq.${userId}),` +
                `and(addressee_id.eq.${userId},requester_id.neq.${userId})`
            )
            .eq('status', 'accepted');

        if (!edges?.length) return [];

        return edges.map((e: any) =>
            e.requester_id === userId ? e.addressee_id : e.requester_id
        );
    }
}
