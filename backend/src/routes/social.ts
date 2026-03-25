/**
 * Mapai Backend — Social Routes
 * GET  /v1/social/friends  — list user's friends
 * POST /v1/social/request  — send friend request
 * PUT  /v1/social/request/:id — accept/reject friend request
 * GET  /v1/social/requests — list pending friend requests
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { SocialService } from '../services/social-service.js';

const friendRequestSchema = z.object({
  to_user_id: z.string().uuid(),
});

const updateRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});

export async function socialRoutes(app: FastifyInstance) {
  const social = new SocialService();
  /**
   * GET /v1/social/friends
   */
  app.get('/friends', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;

      if (!hasDatabase()) {
        // Use service method which has in-memory fallback with seed data
        const friends = await social.getFriends(userId);
        return envelope({ friends, count: friends.length });
      }

      const supabase = getSupabase()!;
      const { data, error } = await (supabase
        .from('friendships') as any)
        .select(`
          friend_id,
          created_at,
          friend:users!friendships_friend_id_fkey(
            id, username, display_name, avatar_url
          )
        `)
        .eq('user_id', userId);

      if (error) {
        return envelope({ friends: [], count: 0 });
      }

      return envelope({
        friends: data || [],
        count: data?.length || 0,
      });
    },
  });

  /**
   * POST /v1/social/request
   */
  app.post('/request', {
    preHandler: authMiddleware,
    handler: async (request, reply) => {
      const parsed = friendRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          errorResponse(400, 'Invalid request body', 'ValidationError')
        );
      }

      const userId = request.user!.id;
      const { to_user_id } = parsed.data;

      if (userId === to_user_id) {
        return reply.status(400).send(
          errorResponse(400, 'Cannot send friend request to yourself', 'ValidationError')
        );
      }

      if (!hasDatabase()) {
        return envelope({ status: 'ok', message: 'Friend request sent (dev mode)' });
      }

      const supabase = getSupabase()!;

      // Check for existing request
      const { data: existing } = await (supabase
        .from('friend_requests') as any)
        .select('id, status')
        .or(`and(from_user_id.eq.${userId},to_user_id.eq.${to_user_id}),and(from_user_id.eq.${to_user_id},to_user_id.eq.${userId})`)
        .maybeSingle();

      if (existing) {
        return envelope({ status: 'already_exists', request_id: existing.id });
      }

      const { data, error } = await (supabase
        .from('friend_requests') as any)
        .insert({
          from_user_id: userId,
          to_user_id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send(
          errorResponse(500, 'Failed to send friend request', 'ServerError')
        );
      }

      return envelope({ status: 'ok', request: data });
    },
  });

  /**
   * GET /v1/social/requests
   */
  app.get('/requests', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;

      if (!hasDatabase()) {
        return envelope({ incoming: [], outgoing: [] });
      }

      const supabase = getSupabase()!;

      const { data: incoming } = await (supabase
        .from('friend_requests') as any)
        .select(`
          id, status, created_at,
          from_user:users!friend_requests_from_user_id_fkey(
            id, username, display_name, avatar_url
          )
        `)
        .eq('to_user_id', userId)
        .eq('status', 'pending');

      const { data: outgoing } = await (supabase
        .from('friend_requests') as any)
        .select(`
          id, status, created_at,
          to_user:users!friend_requests_to_user_id_fkey(
            id, username, display_name, avatar_url
          )
        `)
        .eq('from_user_id', userId)
        .eq('status', 'pending');

      return envelope({
        incoming: incoming || [],
        outgoing: outgoing || [],
      });
    },
  });

  /**
   * PUT /v1/social/request/:id
   */
  app.put<{ Params: { id: string } }>('/request/:id', {
    preHandler: authMiddleware,
    handler: async (request, reply) => {
      const parsed = updateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          errorResponse(400, 'Invalid status', 'ValidationError')
        );
      }

      const userId = request.user!.id;
      const requestId = request.params.id;
      const { status } = parsed.data;

      if (!hasDatabase()) {
        return envelope({ status });
      }

      const supabase = getSupabase()!;

      // Get the request (must be addressed to current user)
      const { data: friendReq } = await (supabase
        .from('friend_requests') as any)
        .select('*')
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .single();

      if (!friendReq) {
        return reply.status(404).send(
          errorResponse(404, 'Friend request not found', 'NotFoundError')
        );
      }

      // Update request status
      await (supabase
        .from('friend_requests') as any)
        .update({ status })
        .eq('id', requestId);

      // If accepted, create bidirectional friendship
      if (status === 'accepted') {
        await (supabase
          .from('friendships') as any)
          .insert([
            { user_id: friendReq.from_user_id, friend_id: friendReq.to_user_id },
            { user_id: friendReq.to_user_id, friend_id: friendReq.from_user_id },
          ]);

        // Update friend counts
        for (const uid of [friendReq.from_user_id, friendReq.to_user_id]) {
          const { data: countData } = await (supabase
            .from('friendships') as any)
            .select('id', { count: 'exact' })
            .eq('user_id', uid);

          const count = countData?.length || 0;
          await (supabase
            .from('users') as any)
            .update({ social: { friends_count: count, mutuals: 0 } })
            .eq('id', uid);
        }
      }

      return envelope({ status });
    },
  });

  // ─── Block / Unblock ─────────────────────────────────────

  app.post('/block', {
    preHandler: authMiddleware,
    handler: async (request, reply) => {
      const { target_user_id, reason } = request.body as any;
      if (!target_user_id) {
        return reply.status(400).send(errorResponse(400, 'target_user_id required', 'ValidationError'));
      }
      const userId = request.user!.id;
      await social.blockUser(userId, target_user_id, reason);
      return envelope({ blocked: true });
    },
  });

  app.post('/unblock', {
    preHandler: authMiddleware,
    handler: async (request, reply) => {
      const { target_user_id } = request.body as any;
      if (!target_user_id) {
        return reply.status(400).send(errorResponse(400, 'target_user_id required', 'ValidationError'));
      }
      await social.unblockUser(request.user!.id, target_user_id);
      return envelope({ unblocked: true });
    },
  });

  // ─── Loved Places ────────────────────────────────────────

  app.post('/loved-places', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { place_id, rating, one_line_review, personal_note, visibility, place_name, location } = request.body as any;
      const result = await social.lovePlace(userId, place_id, {
        rating,
        oneLineReview: one_line_review,
        personalNote: personal_note,
        visibility,
        placeName: place_name,
        location,
      });
      return envelope(result);
    },
  });

  app.delete('/loved-places/:placeId', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { placeId } = request.params as any;
      await social.unlovePlace(userId, placeId);
      return envelope({ removed: true });
    },
  });

  app.get('/loved-places/:userId', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const viewerId = request.user!.id;
      const { userId } = request.params as any;
      const places = await social.getLovedPlaces(userId, viewerId);
      return envelope({ places, count: places.length });
    },
  });

  app.get('/loved-places/place/:placeId/friends', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { placeId } = request.params as any;
      const friends = await social.getFriendsWhoLovePlace(placeId, userId);
      return envelope({ friends, count: friends.length });
    },
  });

  // ─── Activity Feed ───────────────────────────────────────

  app.get('/feed', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { limit, cursor } = request.query as any;
      const feed = await social.getFriendFeed(userId, parseInt(limit) || 20, cursor);
      return envelope({
        items: feed,
        count: feed.length,
        next_cursor: feed.length > 0 ? feed[feed.length - 1].created_at : null,
      });
    },
  });

  // ─── Reactions ───────────────────────────────────────────

  app.post('/react', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { activity_id, reaction } = request.body as any;
      await social.reactToActivity(activity_id, userId, reaction);
      return envelope({ reacted: true });
    },
  });

  app.delete('/react/:activityId', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { activityId } = request.params as any;
      await social.removeReaction(activityId, userId);
      return envelope({ removed: true });
    },
  });

  // ─── Friendship Status ──────────────────────────────────

  app.get('/status/:targetId', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { targetId } = request.params as any;
      const status = await social.getFriendshipStatus(userId, targetId);
      return envelope({ status });
    },
  });

  // ─── Report ─────────────────────────────────────────────

  app.post('/report', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { target_user_id, report_type, details } = request.body as any;
      await social.reportUser(userId, target_user_id, report_type, details);
      return envelope({ reported: true });
    },
  });
}
