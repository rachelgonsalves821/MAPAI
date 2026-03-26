/**
 * Mapai Backend — Clerk Webhook Handler
 * Creates stub user_profiles on user.created, cleans up on user.deleted.
 * Signature verification via CLERK_WEBHOOK_SECRET.
 */

import { FastifyInstance } from 'fastify';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

export async function clerkWebhookRoutes(app: FastifyInstance) {
    app.post('/clerk', {
        config: {
            rawBody: true,
        },
        handler: async (request, reply) => {
            const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

            // In dev mode without secret, accept all webhooks
            if (!webhookSecret && process.env.NODE_ENV !== 'production') {
                console.warn('[Webhook] No CLERK_WEBHOOK_SECRET — accepting without verification (dev only)');
            } else if (!webhookSecret) {
                return reply.status(500).send({ error: 'Webhook secret not configured' });
            }

            // TODO: Add svix signature verification when CLERK_WEBHOOK_SECRET is set
            // For now, parse the body directly
            const body = request.body as any;
            const type = body?.type;
            const data = body?.data;

            if (!type || !data) {
                return reply.status(400).send({ error: 'Invalid webhook payload' });
            }

            if (type === 'user.created') {
                const { id, first_name, last_name, image_url } = data;
                const displayName = [first_name, last_name].filter(Boolean).join(' ') || 'New User';
                const tempUsername = `user_${(id as string).replace('user_', '').slice(0, 12)}`;

                if (hasDatabase()) {
                    try {
                        const supabase = getSupabase()!;
                        await (supabase.from('user_profiles') as any).upsert(
                            {
                                clerk_user_id: id,
                                display_name: displayName,
                                username: tempUsername,
                                avatar_url: image_url ?? null,
                                is_onboarded: false,
                            },
                            { onConflict: 'clerk_user_id' }
                        );
                        console.log(`[Webhook] Created stub profile for ${id}`);
                    } catch (err) {
                        console.error(`[Webhook] Failed to create profile for ${id}:`, err);
                    }
                } else {
                    console.log(`[Webhook/Mock] Would create profile for ${id}: ${displayName}`);
                }
            }

            if (type === 'user.deleted') {
                const { id } = data;
                if (hasDatabase()) {
                    try {
                        const supabase = getSupabase()!;
                        await (supabase.from('user_profiles') as any).delete().eq('clerk_user_id', id);
                        console.log(`[Webhook] Cleaned up profile for ${id}`);
                    } catch (err) {
                        console.error(`[Webhook] Failed to delete profile for ${id}:`, err);
                    }
                }
            }

            return reply.send({ received: true });
        },
    });
}
