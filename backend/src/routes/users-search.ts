/**
 * Mapai Backend — User Search Routes
 * GET /v1/users/search?q=query — Search users by name or @username
 *
 * Delegates to UserSearchService so this and /v1/social/search share
 * identical query logic against the user_profiles table.
 *
 * Response shape: { data: { users: SearchedUser[] } }
 */

import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { searchUsers } from '../services/user-search-service.js';

export async function usersSearchRoutes(app: FastifyInstance) {
    /**
     * GET /v1/users/search?q=query
     *
     * Search user_profiles where username ILIKE query% OR
     * display_name ILIKE %query%.  Requires at least 2 characters.
     * Returns at most 20 results, excludes the requesting user.
     */
    app.get<{ Querystring: { q?: string } }>('/search', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const query = (request.query.q ?? '').trim();
            const userId = request.user!.id;

            if (query.length < 2) {
                return reply.send(envelope({ users: [] }));
            }

            try {
                const users = await searchUsers(query, userId, 20);
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
