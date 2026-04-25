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
     * GET /v1/health/db
     * Tests the Supabase database connection and reports which env vars are set.
     * Use this to diagnose connectivity issues on Vercel without needing logs.
     */
    app.get('/health/db', async (_request, reply) => {
        const supabaseUrl     = !!process.env.SUPABASE_URL;
        const serviceRoleKey  = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        const anonKey         = !!process.env.SUPABASE_ANON_KEY;
        const geminiKey       = !!process.env.GOOGLE_GEMINI_API_KEY;
        const placesKey       = !!process.env.GOOGLE_PLACES_API_KEY;

        const envStatus = { supabaseUrl, serviceRoleKey, anonKey, geminiKey, placesKey };

        if (!hasDatabase()) {
            return reply.status(503).send(envelope({
                status: 'no_database',
                message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — database is unavailable.',
                env: envStatus,
            }));
        }

        // Attempt a lightweight query to verify the connection is live
        const supabase = getSupabase()!;
        const { error } = await (supabase as any)
            .from('user_loved_places')
            .select('id')
            .limit(1);

        if (error) {
            return reply.status(503).send(envelope({
                status: 'db_error',
                message: error.message,
                code: error.code,
                env: envStatus,
            }));
        }

        return envelope({
            status: 'ok',
            message: 'Database connection is healthy.',
            env: envStatus,
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
