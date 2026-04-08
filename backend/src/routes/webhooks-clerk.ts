/**
 * Mapai Backend — Clerk Webhook Handler
 * Creates stub user_profiles on user.created, cleans up on user.deleted.
 * Signature verification via svix + CLERK_WEBHOOK_SECRET.
 */

import { FastifyInstance } from 'fastify';
import { Webhook } from 'svix';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

export async function clerkWebhookRoutes(app: FastifyInstance) {
    app.post('/clerk', {
        handler: async (request, reply) => {
            const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

            let type: string;
            let data: any;

            if (webhookSecret) {
                // Verify signature with svix
                const wh = new Webhook(webhookSecret);
                try {
                    const payload = JSON.stringify(request.body);
                    const event = wh.verify(payload, {
                        'svix-id': request.headers['svix-id'] as string,
                        'svix-timestamp': request.headers['svix-timestamp'] as string,
                        'svix-signature': request.headers['svix-signature'] as string,
                    }) as any;
                    type = event.type;
                    data = event.data;
                } catch (err) {
                    console.error('[Webhook] Signature verification failed:', err);
                    return reply.status(400).send({ error: 'Invalid signature' });
                }
            } else if (process.env.NODE_ENV === 'development') {
                // Permissive skip: only in exact 'development' — staging and test
                // environments still require a valid signature.
                console.warn('[Webhook] No CLERK_WEBHOOK_SECRET — accepting without verification (development only)');
                const body = request.body as any;
                type = body?.type;
                data = body?.data;
            } else {
                // Production, staging, test — CLERK_WEBHOOK_SECRET is mandatory.
                console.error('[Webhook] CLERK_WEBHOOK_SECRET is not configured. Cannot process webhooks safely.');
                return reply.status(500).send({ error: 'Webhook secret not configured — contact the platform team' });
            }

            if (!type || !data) {
                return reply.status(400).send({ error: 'Invalid webhook payload' });
            }

            console.log(`[Webhook] Received event: ${type}`);

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
                        console.log(`[Webhook] Created stub profile for ${id}: ${displayName}`);
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
                } else {
                    console.log(`[Webhook/Mock] Would delete profile for ${id}`);
                }
            }

            return reply.send({ received: true });
        },
    });
}
