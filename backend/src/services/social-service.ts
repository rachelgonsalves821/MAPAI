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
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — returning null for lovePlace (configure Supabase to persist loved places)');
            return null;
        }

        const supabase = getSupabase()!;
        const { data } = await (supabase.from('user_loved_places') as any)
            .upsert({
                user_id: userId,
                place_id: placeId,
                rating: opts.rating,
                one_line_review: opts.oneLineReview,
                personal_note: opts.personalNote,
                visibility: opts.visibility || 'friends',
                last_visited_at: new Date().toISOString(),
            }, { onConflict: 'user_id,place_id' })
            .select()
            .single();

        // Increment visit count
        if (data) {
            await (supabase.from('user_loved_places') as any)
                .update({ visit_count: (data.visit_count || 0) + 1 })
                .eq('id', data.id);
        }

        await this.createActivity(userId, 'place_loved', placeId, opts.placeName);
        return data;
    }

    async unlovePlace(userId: string, placeId: string): Promise<void> {
        if (!hasDatabase()) {
            console.warn('[SocialService] No database — unlovePlace is a no-op (configure Supabase to persist loved places)');
            return;
        }
        const supabase = getSupabase()!;
        await supabase.from('user_loved_places').delete()
            .eq('user_id', userId).eq('place_id', placeId);
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
