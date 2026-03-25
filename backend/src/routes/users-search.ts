/**
 * Mapai Backend — User Search Routes
 * GET /v1/users/search?q=query — Search users by name or @username
 */

import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

export async function usersSearchRoutes(app: FastifyInstance) {
    /**
     * GET /v1/users/search?q=query
     * Search user_profiles where username ilike query% OR display_name ilike %query%.
     * Returns at most 20 results, excludes the requesting user.
     */
    app.get<{ Querystring: { q?: string } }>('/search', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const query = (request.query.q ?? '').trim();
            const userId = request.user!.id;

            // Require at least 2 characters to avoid full-table scans
            if (query.length < 2) {
                return reply.send(envelope([]));
            }

            if (!hasDatabase()) {
                console.log(`[Mock] User search for "${query}" by ${userId}`);
                return reply.send(envelope([]));
            }

            const supabase = getSupabase()!;

            // username starts-with OR display_name contains, excluding self, limit 20
            const { data: results, error } = await (supabase.from('user_profiles') as any)
                .select('clerk_user_id, display_name, username, avatar_url')
                .or(`username.ilike.${query}%,display_name.ilike.%${query}%`)
                .neq('clerk_user_id', userId)
                .limit(20);

            if (error) {
                app.log.error(error, 'User search failed');
                return reply.status(500).send(
                    errorResponse(500, 'User search failed', 'ServerError')
                );
            }

            return reply.send(envelope(results || []));
        },
    });
}
