/**
 * Mapai Backend — Social Service
 * Handles loved places, activity feed, blocks, and friend social features.
 * Uses Supabase when available, in-memory fallback otherwise.
 */

import { getSupabase, hasDatabase } from '../db/supabase-client.js';

// In-memory fallback stores (seeded with dev data when no database is available)
const inMemoryLovedPlaces = new Map<string, any[]>();
const inMemoryActivity = new Map<string, any[]>();
const inMemoryBlocks = new Map<string, string[]>();
const inMemoryFriendships = new Map<string, any[]>();

// Seed in-memory stores with dev data so the Social tab isn't empty without Supabase
(function seedInMemoryDevData() {
    const DEV_USER = 'dev-user-001';
    const DEV_FRIEND = 'dev-user-002';
    const now = new Date().toISOString();
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();

    // Loved places for dev user
    inMemoryLovedPlaces.set(DEV_USER, [
        {
            id: 'loved-seed-1',
            user_id: DEV_USER,
            place_id: 'place-neptune',
            place_name: 'Neptune Oyster',
            name: 'Neptune Oyster',
            neighborhood: 'North End',
            priceRange: '$$$',
            category: 'Seafood',
            rating: 4.8,
            one_line_review: 'Best lobster roll in Boston',
            visibility: 'friends',
            visit_count: 5,
            created_at: dayAgo,
        },
        {
            id: 'loved-seed-2',
            user_id: DEV_USER,
            place_id: 'place-tatte',
            place_name: 'Tatte Bakery',
            name: 'Tatte Bakery',
            neighborhood: 'Beacon Hill',
            priceRange: '$$',
            category: 'Cafe',
            rating: 4.5,
            one_line_review: 'Amazing pastries and coffee',
            visibility: 'public',
            visit_count: 12,
            created_at: dayAgo,
        },
        {
            id: 'loved-seed-3',
            user_id: DEV_USER,
            place_id: 'place-giulia',
            place_name: 'Giulia',
            name: 'Giulia',
            neighborhood: 'Cambridge',
            priceRange: '$$$',
            category: 'Italian',
            rating: 4.7,
            visibility: 'friends',
            visit_count: 3,
            created_at: dayAgo,
        },
    ]);

    // Activity feed (global)
    inMemoryActivity.set('global', [
        {
            id: 'act-seed-1',
            actor_id: DEV_FRIEND,
            actor_name: 'Alex Chen',
            activity_type: 'place_loved',
            place_id: 'place-neptune',
            place_name: 'Neptune Oyster',
            metadata: { one_line_review: 'Incredible raw bar!' },
            created_at: hourAgo,
        },
        {
            id: 'act-seed-2',
            actor_id: DEV_FRIEND,
            actor_name: 'Alex Chen',
            activity_type: 'place_visited',
            place_id: 'place-tatte',
            place_name: 'Tatte Bakery',
            metadata: {},
            created_at: dayAgo,
        },
    ]);
    // Friendships (bidirectional)
    inMemoryFriendships.set(DEV_USER, [
        { friend_id: DEV_FRIEND, display_name: 'Alex Chen', username: 'alexchen', created_at: dayAgo },
    ]);
    inMemoryFriendships.set(DEV_FRIEND, [
        { friend_id: DEV_USER, display_name: 'Dev User', username: 'devuser', created_at: dayAgo },
    ]);
})();

export class SocialService {

    // ─── Blocks ──────────────────────────────────────────

    async blockUser(blockerId: string, blockedId: string, reason?: string): Promise<void> {
        if (!hasDatabase()) {
            const blocks = inMemoryBlocks.get(blockerId) || [];
            if (!blocks.includes(blockedId)) blocks.push(blockedId);
            inMemoryBlocks.set(blockerId, blocks);
            return;
        }
        const supabase = getSupabase()!;
        await supabase.from('blocks').upsert({
            blocker_id: blockerId,
            blocked_id: blockedId,
            reason,
        } as any, { onConflict: 'blocker_id,blocked_id' });

        // Also remove any existing friendship
        await supabase.from('friendships').delete()
            .or(`and(user_id.eq.${blockerId},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${blockerId})`);

        // Remove pending requests
        await supabase.from('friend_requests').delete()
            .or(`and(from_user_id.eq.${blockerId},to_user_id.eq.${blockedId}),and(from_user_id.eq.${blockedId},to_user_id.eq.${blockerId})`);
    }

    async unblockUser(blockerId: string, blockedId: string): Promise<void> {
        if (!hasDatabase()) {
            const blocks = inMemoryBlocks.get(blockerId) || [];
            inMemoryBlocks.set(blockerId, blocks.filter(id => id !== blockedId));
            return;
        }
        const supabase = getSupabase()!;
        await supabase.from('blocks').delete()
            .eq('blocker_id', blockerId).eq('blocked_id', blockedId);
    }

    async isBlocked(userId1: string, userId2: string): Promise<boolean> {
        if (!hasDatabase()) {
            const blocks1 = inMemoryBlocks.get(userId1) || [];
            const blocks2 = inMemoryBlocks.get(userId2) || [];
            return blocks1.includes(userId2) || blocks2.includes(userId1);
        }
        const supabase = getSupabase()!;
        const { count } = await (supabase.from('blocks') as any)
            .select('id', { count: 'exact', head: true })
            .or(`and(blocker_id.eq.${userId1},blocked_id.eq.${userId2}),and(blocker_id.eq.${userId2},blocked_id.eq.${userId1})`);
        return (count ?? 0) > 0;
    }

    async getBlockedIds(userId: string): Promise<string[]> {
        if (!hasDatabase()) return inMemoryBlocks.get(userId) || [];
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
            const places = inMemoryLovedPlaces.get(userId) || [];
            const existing = places.find(p => p.place_id === placeId);
            if (existing) {
                Object.assign(existing, opts, { visit_count: (existing.visit_count || 1) + 1, last_visited_at: new Date().toISOString() });
                return existing;
            }
            const newPlace = {
                id: `loved-${Date.now()}`,
                user_id: userId,
                place_id: placeId,
                ...opts,
                visit_count: 1,
                created_at: new Date().toISOString(),
            };
            places.push(newPlace);
            inMemoryLovedPlaces.set(userId, places);

            // Create activity event with location metadata
            await this.createActivity(userId, 'place_loved', placeId, opts.placeName, {
                location: opts.location || null,
                one_line_review: opts.oneLineReview || null,
            });
            return newPlace;
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
            const places = inMemoryLovedPlaces.get(userId) || [];
            inMemoryLovedPlaces.set(userId, places.filter(p => p.place_id !== placeId));
            return;
        }
        const supabase = getSupabase()!;
        await supabase.from('user_loved_places').delete()
            .eq('user_id', userId).eq('place_id', placeId);
    }

    async getLovedPlaces(userId: string, viewerId?: string): Promise<any[]> {
        if (!hasDatabase()) return inMemoryLovedPlaces.get(userId) || [];

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
        // Get user's friend IDs
        const { data: friendships } = await (supabase.from('friendships') as any)
            .select('user_id, friend_id')
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        if (!friendships?.length) return [];

        const friendIds = friendships.map((f: any) =>
            f.user_id === userId ? f.friend_id : f.user_id
        );

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
            const activities = inMemoryActivity.get('global') || [];
            activities.unshift({
                id: `act-${Date.now()}`,
                actor_id: actorId,
                activity_type: type,
                place_id: placeId,
                place_name: placeName,
                metadata,
                created_at: new Date().toISOString(),
            });
            if (activities.length > 500) activities.length = 500;
            inMemoryActivity.set('global', activities);
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
            return (inMemoryActivity.get('global') || []).slice(0, limit);
        }

        const supabase = getSupabase()!;

        // Get friend IDs
        const { data: friendships } = await (supabase.from('friendships') as any)
            .select('user_id, friend_id')
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        if (!friendships?.length) return [];

        const friendIds = friendships.map((f: any) =>
            f.user_id === userId ? f.friend_id : f.user_id
        );

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
        if (!hasDatabase()) return inMemoryFriendships.get(userId) || [];
        const supabase = getSupabase()!;

        const { data: friendships } = await (supabase.from('friendships') as any)
            .select('user_id, friend_id, created_at')
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        if (!friendships?.length) return [];

        const friendIds = friendships.map((f: any) =>
            f.user_id === userId ? f.friend_id : f.user_id
        );

        // Get friend profiles
        const { data: users } = await (supabase.from('users') as any)
            .select('id, display_name, username, avatar_url')
            .in('id', friendIds);

        return (users || []).map((u: any) => {
            const friendship = friendships.find((f: any) =>
                f.user_id === u.id || f.friend_id === u.id
            );
            return { ...u, friends_since: friendship?.created_at };
        });
    }

    async getFriendshipStatus(userId: string, targetId: string): Promise<string> {
        if (!hasDatabase()) return 'none';
        if (userId === targetId) return 'self';

        const supabase = getSupabase()!;

        // Check blocked
        if (await this.isBlocked(userId, targetId)) return 'blocked';

        // Check friends
        const { count: friendCount } = await (supabase.from('friendships') as any)
            .select('id', { count: 'exact', head: true })
            .or(`and(user_id.eq.${userId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${userId})`);
        if ((friendCount ?? 0) > 0) return 'friends';

        // Check pending requests
        const { data: outgoing } = await (supabase.from('friend_requests') as any)
            .select('id')
            .eq('from_user_id', userId).eq('to_user_id', targetId).eq('status', 'pending')
            .maybeSingle();
        if (outgoing) return 'pending_outgoing';

        const { data: incoming } = await (supabase.from('friend_requests') as any)
            .select('id')
            .eq('from_user_id', targetId).eq('to_user_id', userId).eq('status', 'pending')
            .maybeSingle();
        if (incoming) return 'pending_incoming';

        return 'none';
    }
}
