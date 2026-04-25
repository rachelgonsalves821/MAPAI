/**
 * Mapai Backend — Social Routes
 * GET  /v1/social/friends  — list user's friends
 * POST /v1/social/request  — send friend request
 * PUT  /v1/social/request/:id — accept/reject friend request
 * GET  /v1/social/requests — list pending friend requests
 *
 * All friendship state is stored in a single `friendships` table with
 * columns (requester_id, addressee_id, status). There is no separate
 * `friend_requests` table.
 *
 * Status lifecycle: pending → accepted | blocked
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { SocialService } from '../services/social-service.js';
import { searchUsers } from '../services/user-search-service.js';

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

      // friendships table uses requester_id / addressee_id (single directed edge).
      // A user is a "friend" when status='accepted' and they appear on either side.
      const friends = await social.getFriends(userId);
      return envelope({ friends, count: friends.length });
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

      // Check for an existing edge in either direction
      const { data: existing } = await (supabase
        .from('friendships') as any)
        .select('id, status')
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${to_user_id}),` +
          `and(requester_id.eq.${to_user_id},addressee_id.eq.${userId})`
        )
        .maybeSingle();

      if (existing) {
        return envelope({ status: 'already_exists', request_id: existing.id });
      }

      // Insert a new pending edge
      const { data, error } = await (supabase
        .from('friendships') as any)
        .insert({
          requester_id: userId,
          addressee_id: to_user_id,
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

      // Incoming: edges where the current user is the addressee
      const { data: incoming } = await (supabase
        .from('friendships') as any)
        .select(`
          id, status, created_at,
          requester:users!friendships_requester_id_fkey(
            id, username, display_name, avatar_url
          )
        `)
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      // Outgoing: edges where the current user is the requester
      const { data: outgoing } = await (supabase
        .from('friendships') as any)
        .select(`
          id, status, created_at,
          addressee:users!friendships_addressee_id_fkey(
            id, username, display_name, avatar_url
          )
        `)
        .eq('requester_id', userId)
        .eq('status', 'pending');

      return envelope({
        incoming: incoming || [],
        outgoing: outgoing || [],
      });
    },
  });

  /**
   * PUT /v1/social/request/:id
   * The requesting user must be the addressee of the friendship edge.
   * On 'accepted' the status is updated in-place — no second row is created.
   * On 'rejected' the row is deleted to keep the table clean.
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

      // Must be addressed to the current user and currently pending
      const { data: friendship } = await (supabase
        .from('friendships') as any)
        .select('id, requester_id, addressee_id')
        .eq('id', requestId)
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .single();

      if (!friendship) {
        return reply.status(404).send(
          errorResponse(404, 'Friend request not found', 'NotFoundError')
        );
      }

      if (status === 'accepted') {
        // Update the single edge to accepted
        await (supabase
          .from('friendships') as any)
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', requestId);
      } else {
        // Rejected — delete the row so the requester can try again later
        await (supabase
          .from('friendships') as any)
          .delete()
          .eq('id', requestId);
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
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { place_id, rating, one_line_review, personal_note, visibility, place_name, location } = request.body as any;
      if (!place_id) {
        return reply.status(400).send(errorResponse(400, 'place_id is required', 'ValidationError'));
      }
      try {
        const result = await social.lovePlace(userId, place_id, {
          rating,
          oneLineReview: one_line_review,
          personalNote: personal_note,
          visibility,
          placeName: place_name,
          location,
        });
        return envelope(result ?? { saved: true });
      } catch (err: any) {
        console.error('[Route] POST /loved-places failed:', err?.message);
        return reply.status(500).send(errorResponse(500, err?.message ?? 'Failed to save loved place', 'ServerError'));
      }
    },
  });

  app.delete('/loved-places/:placeId', {
    preHandler: authMiddleware,
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { placeId } = request.params as any;
      try {
        await social.unlovePlace(userId, placeId);
        return envelope({ removed: true });
      } catch (err: any) {
        console.error('[Route] DELETE /loved-places failed:', err?.message);
        return reply.status(500).send(errorResponse(500, err?.message ?? 'Failed to remove loved place', 'ServerError'));
      }
    },
  });

  // ─── Specific loved-places sub-routes MUST come before /:userId wildcard ───

  // Efficient single-place loved check — avoids fetching the entire loved list.
  app.get('/loved-places/check/:placeId', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { placeId } = request.params as any;
      const loved = await social.isPlaceLoved(userId, placeId);
      return envelope({ loved });
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

  // Wildcard route — must come AFTER all specific /loved-places/* routes
  app.get('/loved-places/:userId', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const viewerId = request.user!.id;
      const { userId } = request.params as any;
      const places = await social.getLovedPlaces(userId, viewerId);
      return envelope({ places, count: places.length });
    },
  });

  // ─── Activity Feed (enriched with actor profiles) ──────────────────

  app.get('/feed', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { limit, cursor } = request.query as any;
      // Use enriched feed that joins actor profile names/avatars in one query
      const feed = await social.getEnrichedFriendFeed(userId, parseInt(limit) || 20, cursor);
      return envelope({
        items: feed,
        count: feed.length,
        next_cursor: feed.length > 0 ? feed[feed.length - 1].created_at : null,
      });
    },
  });

  // ─── Place View Tracking ──────────────────────────────────────
  // Called silently when the user opens a place detail screen.
  // Populates recent_places_viewed for the "Recently Viewed" section.
  app.post('/track-view', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { place_id, place_name, latitude, longitude, category } = request.body as any;
      if (!place_id) return envelope({ tracked: false });
      // Fire-and-forget — don't block the response on DB write
      social.trackPlaceView(userId, place_id, {
        placeName: place_name,
        latitude,
        longitude,
        category,
        emitActivity: false,
      }).catch((err: any) => console.error('[Social] trackPlaceView error:', err));
      return envelope({ tracked: true });
    },
  });

  // Returns the current user's recently viewed places (max 50, ordered by recency).
  app.get('/recent-views', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;
      const { limit } = request.query as any;
      const places = await social.getRecentPlacesViewed(userId, parseInt(limit) || 20);
      return envelope({ places, count: places.length });
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

  // ─── User Search ─────────────────────────────────────────────────────────
  //
  // Delegates to UserSearchService so both /v1/social/search and
  // /v1/users/search run identical query logic against user_profiles.
  //
  // Response: { data: { users: SearchedUser[] } }
  //   SearchedUser.id  = clerk_user_id  (canonical identifier)

  app.get<{ Querystring: { q?: string } }>('/search', {
    preHandler: authMiddleware,
    handler: async (request, reply) => {
      const query = (request.query.q ?? '').trim();
      if (query.length < 2) return reply.send(envelope({ users: [] }));

      try {
        const users = await searchUsers(query, request.user!.id, 20);
        return reply.send(envelope({ users }));
      } catch (err) {
        app.log.error(err, 'User search failed');
        return reply.status(500).send(
          errorResponse(500, 'User search failed', 'ServerError'),
        );
      }
    },
  });

}
