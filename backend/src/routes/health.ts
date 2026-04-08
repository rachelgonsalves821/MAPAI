/**
 * Health check + admin routes.
 */

import { FastifyInstance } from 'fastify';
import { envelope, errorResponse } from '../utils/response.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

export async function healthRoutes(app: FastifyInstance) {
    app.get('/health', async () => {
        return envelope({
            status: 'ok',
            version: '0.1.0',
            timestamp: new Date().toISOString(),
        });
    });

    /**
     * GET /v1/admin/cleanup-chats
     * Deletes chat sessions older than 30 days. Protected with secret header.
     * Called by external scheduler (cron job) when pg_cron is unavailable.
     */
    app.get('/admin/cleanup-chats', async (request, reply) => {
        const secret = (request.headers as any)['x-cleanup-secret'];
        if (!secret || secret !== process.env.CLEANUP_SECRET) {
            return reply.status(401).send(
                errorResponse(401, 'Unauthorized', 'AuthError')
            );
        }

        if (!hasDatabase()) {
            return envelope({ deleted: 0, note: 'No database configured' });
        }

        const supabase = getSupabase()!;
        const { data, error } = await (supabase as any).rpc('cleanup_old_chat_sessions');

        if (error) {
            return reply.status(500).send(
                errorResponse(500, `Cleanup failed: ${error.message}`, 'ServerError')
            );
        }

        return envelope({ deleted: data ?? 0 });
    });
}
