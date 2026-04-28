/**
 * Mapai Backend — User Routes
 * POST /v1/user/onboarding — Finalize user profile and preferences.
 * GET  /v1/user/profile    — Get current user state.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { UserService, OnboardingPayload } from '../services/user-service.js';
import { getOrCreateUser, getPublicProfile } from '../services/identity-service.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

const onboardingSchema = z.object({
    display_name: z.string().min(1),
    username: z.string().optional(),
    is_onboarded: z.boolean().optional(),
    preferences: z.object({
        cuisine_preferences: z.array(z.string()),
        ambiance_preferences: z.array(z.string()),
        dietary_restrictions: z.array(z.string()),
        price_range: z.object({
            min: z.number(),
            max: z.number(),
        }),
    }).optional(),
});

export async function userRoutes(app: FastifyInstance) {
    const userService = new UserService();

    /**
     * POST /v1/user/onboarding
     */
    app.post('/onboarding', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = onboardingSchema.safeParse(request.body);
            
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid onboarding data', 'ValidationError', JSON.stringify(parsed.error.format()))
                );
            }

            const userId = request.user!.id;

            try {
                // Upsert into user_profiles (Clerk migration)
                if (hasDatabase()) {
                    const supabase = getSupabase()!;
                    await (supabase.from('user_profiles') as any).upsert({
                        user_id: userId,
                        display_name: parsed.data.display_name,
                        username: parsed.data.username || '',
                        is_onboarded: parsed.data.is_onboarded ?? true,
                    }, { onConflict: 'user_id' });
                }

                // Also update legacy users table if preferences provided
                if (parsed.data.preferences) {
                    await userService.completeOnboarding({
                        user_id: userId,
                        display_name: parsed.data.display_name,
                        preferences: parsed.data.preferences as OnboardingPayload['preferences'],
                    });
                }

                return envelope({ success: true, message: 'Onboarding complete' });
            } catch (error: any) {
                app.log.error(error);
                return reply.status(500).send(
                    errorResponse(500, 'Failed to save onboarding data', 'ServerError')
                );
            }
        },
    });

    /**
     * POST /v1/user/complete-onboarding
     * Marks onboarding as complete in user_profiles.
     */
    app.post('/complete-onboarding', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;

            try {
                if (hasDatabase()) {
                    const supabase = getSupabase()!;
                    // upsert so this is safe even if the create-identity step
                    // failed to write the row (display_name/username left blank
                    // — the onboarding step already wrote them; this is a guard)
                    await (supabase.from('user_profiles') as any)
                        .upsert({
                            user_id: userId,
                            is_onboarded: true,
                            display_name: (request.body as any)?.display_name || '',
                            username: (request.body as any)?.username || '',
                        }, { onConflict: 'user_id' });
                }

                return envelope({ success: true, onboardingCompleted: true });
            } catch (error: any) {
                app.log.error(error, 'Failed to complete onboarding');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to update onboarding status', 'ServerError')
                );
            }
        },
    });

    /**
     * GET /v1/user/profile
     */
    app.get('/profile', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;
            const profile = await userService.getProfile(userId);

            if (!profile) {
                return reply.status(404).send(
                    errorResponse(404, 'User profile not found', 'NotFoundError')
                );
            }

            return envelope(profile);
        },
    });

    /**
     * GET /v1/user/public/:username
     * Public profile — no auth required.
     */
    app.get<{ Params: { username: string } }>('/public/:username', {
        handler: async (request, reply) => {
            const { username } = request.params;

            const profile = await getPublicProfile(username);
            if (!profile) {
                return reply.status(404).send(
                    errorResponse(404, 'User not found', 'NotFoundError')
                );
            }

            return envelope(profile);
        },
    });

    /**
     * DELETE /v1/user/account
     * Permanently delete user account and all associated data.
     * Apple App Store requirement — must be accessible from Settings.
     * Idempotent: calling twice is safe.
     */
    app.delete('/account', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;

            try {
                // Log deletion event BEFORE deleting (needed for compliance reporting)
                console.log(`[User] ACCOUNT_DELETION user=${userId} timestamp=${new Date().toISOString()}`);

                // Delete all user data
                await userService.deleteAccount(userId);

                return envelope({
                    deleted: true,
                    deleted_at: new Date().toISOString(),
                });
            } catch (error: any) {
                app.log.error(error, `Account deletion failed for user ${userId}`);
                return reply.status(500).send(
                    errorResponse(
                        500,
                        'Account deletion failed. Please contact support@mapai.app for assistance.',
                        'DeletionError'
                    )
                );
            }
        },
    });

    /**
     * POST /v1/user/ensure
     * Get or create user record from auth session.
     * Called on app load to ensure user row exists.
     */
    app.post('/ensure', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const authUser = request.user!;
            const user = await getOrCreateUser({
                id: authUser.id,
                email: authUser.email,
                user_metadata: (request.body as any)?.user_metadata || {},
            });

            return envelope(user);
        },
    });
}
