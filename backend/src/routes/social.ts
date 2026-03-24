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

const friendRequestSchema = z.object({
  to_user_id: z.string().uuid(),
});

const updateRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});

export async function socialRoutes(app: FastifyInstance) {
  /**
   * GET /v1/social/friends
   */
  app.get('/friends', {
    preHandler: authMiddleware,
    handler: async (request) => {
      const userId = request.user!.id;

      if (!hasDatabase()) {
        return envelope({ friends: [], count: 0 });
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
}
