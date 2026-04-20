/**
 * Clerk webhooks — removed. Auth is now handled by Supabase.
 * This file is kept to avoid breaking any tooling that scans for it.
 */

import { FastifyInstance } from 'fastify';

export async function clerkWebhookRoutes(_app: FastifyInstance) {
    // No-op — Clerk webhooks no longer registered
}
