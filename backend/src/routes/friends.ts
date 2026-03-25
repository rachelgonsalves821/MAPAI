/**
 * Mapai Backend — Friends Routes
 * POST /v1/friends/request       — Send a friend request
 * POST /v1/friends/respond       — Accept or block a request
 * GET  /v1/friends               — List accepted friends
 * POST /v1/friends/match-contacts — Match phone contacts to Mapai users
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const friendRequestSchema = z.object({
    addressee_id: z.string().min(1),
});

const friendRespondSchema = z.object({
    friendship_id: z.string().min(1),
    action: z.enum(['accepted', 'blocked']),
});

const matchContactsSchema = z.object({
    emails: z.array(z.string().email()).min(1).max(500),
    phoneNumbers: z.array(z.string()).optional(),
});

// ─── Mock data (no database) ─────────────────────────────────────────────────

const mockFriendships: any[] = [];
let mockFriendshipCounter = 1;

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function friendRoutes(app: FastifyInstance) {
    /**
     * POST /v1/friends/request
     * Send a friend request from the current user to addressee_id.
     */
    app.post('/request', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = friendRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid request body', 'ValidationError', parsed.error.message)
                );
            }

            const requesterId = request.user!.id;
            const { addressee_id } = parsed.data;

            if (requesterId === addressee_id) {
                return reply.status(400).send(
                    errorResponse(400, 'Cannot send a friend request to yourself', 'ValidationError')
                );
            }

            if (!hasDatabase()) {
                // Check for existing mock friendship in either direction
                const existing = mockFriendships.find(
                    (f) =>
                        (f.requester_id === requesterId && f.addressee_id === addressee_id) ||
                        (f.requester_id === addressee_id && f.addressee_id === requesterId)
                );
                if (existing) {
                    return reply.status(409).send(
                        errorResponse(409, 'Friendship already exists', 'ConflictError')
                    );
                }
                const friendship = {
                    id: `mock-friendship-${mockFriendshipCounter++}`,
                    requester_id: requesterId,
                    addressee_id,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                mockFriendships.push(friendship);
                console.log(`[Mock] Friend request sent from ${requesterId} to ${addressee_id}`);
                return reply.status(201).send(envelope(friendship));
            }

            const supabase = getSupabase()!;

            // Check for existing friendship in either direction
            const { data: existing } = await (supabase.from('friendships') as any)
                .select('id, status')
                .or(
                    `and(requester_id.eq.${requesterId},addressee_id.eq.${addressee_id}),` +
                    `and(requester_id.eq.${addressee_id},addressee_id.eq.${requesterId})`
                )
                .maybeSingle();

            if (existing) {
                return reply.status(409).send(
                    errorResponse(409, 'Friendship already exists', 'ConflictError')
                );
            }

            const { data: friendship, error } = await (supabase.from('friendships') as any)
                .insert({
                    requester_id: requesterId,
                    addressee_id,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) {
                app.log.error(error, 'Failed to create friend request');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to send friend request', 'ServerError')
                );
            }

            return reply.status(201).send(envelope(friendship));
        },
    });

    /**
     * POST /v1/friends/respond
     * Accept or block an incoming friend request.
     * Only the addressee may respond.
     */
    app.post('/respond', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = friendRespondSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid request body', 'ValidationError', parsed.error.message)
                );
            }

            const userId = request.user!.id;
            const { friendship_id, action } = parsed.data;

            if (!hasDatabase()) {
                const friendship = mockFriendships.find((f) => f.id === friendship_id);
                if (!friendship) {
                    return reply.status(404).send(
                        errorResponse(404, 'Friendship not found', 'NotFoundError')
                    );
                }
                if (friendship.addressee_id !== userId) {
                    return reply.status(403).send(
                        errorResponse(403, 'Only the addressee can respond to a friend request', 'ForbiddenError')
                    );
                }
                friendship.status = action;
                friendship.updated_at = new Date().toISOString();
                console.log(`[Mock] Friendship ${friendship_id} updated to ${action}`);
                return reply.send(envelope(friendship));
            }

            const supabase = getSupabase()!;

            // Fetch the friendship record first to verify addressee
            const { data: friendship, error: fetchError } = await (supabase.from('friendships') as any)
                .select('*')
                .eq('id', friendship_id)
                .single();

            if (fetchError || !friendship) {
                return reply.status(404).send(
                    errorResponse(404, 'Friendship not found', 'NotFoundError')
                );
            }

            if (friendship.addressee_id !== userId) {
                return reply.status(403).send(
                    errorResponse(403, 'Only the addressee can respond to a friend request', 'ForbiddenError')
                );
            }

            const { data: updated, error: updateError } = await (supabase.from('friendships') as any)
                .update({ status: action, updated_at: new Date().toISOString() })
                .eq('id', friendship_id)
                .select()
                .single();

            if (updateError) {
                app.log.error(updateError, 'Failed to update friendship');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to update friendship', 'ServerError')
                );
            }

            return reply.send(envelope(updated));
        },
    });

    /**
     * GET /v1/friends
     * List all accepted friends for the current user.
     * Joins user_profiles to return friend display info.
     */
    app.get('/', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;

            if (!hasDatabase()) {
                const accepted = mockFriendships
                    .filter(
                        (f) =>
                            f.status === 'accepted' &&
                            (f.requester_id === userId || f.addressee_id === userId)
                    )
                    .map((f) => ({
                        friendship_id: f.id,
                        friend_id: f.requester_id === userId ? f.addressee_id : f.requester_id,
                        display_name: 'Mock Friend',
                        username: 'mockfriend',
                        avatar_url: null,
                        since: f.updated_at,
                    }));
                console.log(`[Mock] Listing ${accepted.length} friends for user ${userId}`);
                return reply.send(envelope(accepted));
            }

            const supabase = getSupabase()!;

            // Fetch all accepted friendships involving the current user
            const { data: friendships, error } = await (supabase.from('friendships') as any)
                .select('id, requester_id, addressee_id, updated_at')
                .eq('status', 'accepted')
                .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

            if (error) {
                app.log.error(error, 'Failed to fetch friends list');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to fetch friends', 'ServerError')
                );
            }

            if (!friendships || friendships.length === 0) {
                return reply.send(envelope([]));
            }

            // Collect the IDs of the other party in each friendship
            const friendIds = friendships.map((f: any) =>
                f.requester_id === userId ? f.addressee_id : f.requester_id
            );

            // Join with user_profiles
            const { data: profiles, error: profileError } = await (supabase.from('user_profiles') as any)
                .select('id, display_name, username, avatar_url')
                .in('id', friendIds);

            if (profileError) {
                app.log.error(profileError, 'Failed to fetch friend profiles');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to fetch friend profiles', 'ServerError')
                );
            }

            const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

            const friends = friendships.map((f: any) => {
                const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id;
                const profile = profileMap.get(friendId) || {};
                return {
                    friendship_id: f.id,
                    friend_id: friendId,
                    display_name: (profile as any).display_name ?? null,
                    username: (profile as any).username ?? null,
                    avatar_url: (profile as any).avatar_url ?? null,
                    since: f.updated_at,
                };
            });

            return reply.send(envelope(friends));
        },
    });

    /**
     * POST /v1/friends/match-contacts
     * Match a list of emails (and optionally phone numbers) to existing Mapai users.
     * Used by the mobile app to find friends from the device contact list.
     */
    app.post('/match-contacts', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = matchContactsSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid request body', 'ValidationError', parsed.error.message)
                );
            }

            const userId = request.user!.id;
            // Spec: limit to first 500 emails (already enforced by schema max, but be explicit)
            const emails = parsed.data.emails.slice(0, 500);

            if (!hasDatabase()) {
                console.log(`[Mock] Contact match requested by ${userId} for ${emails.length} emails`);
                return reply.send(envelope([]));
            }

            const supabase = getSupabase()!;

            const { data: matches, error } = await (supabase.from('user_profiles') as any)
                .select('id, display_name, username, avatar_url, email')
                .in('email', emails)
                .neq('id', userId);

            if (error) {
                app.log.error(error, 'Failed to match contacts');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to match contacts', 'ServerError')
                );
            }

            return reply.send(envelope(matches || []));
        },
    });
}
