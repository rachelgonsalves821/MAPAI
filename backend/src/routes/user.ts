/**
 * Mapai Backend — User Routes
 * POST /v1/user/onboarding — Finalize user profile and preferences.
 * GET  /v1/user/profile    — Get current user state.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { UserService } from '../services/user-service.js';

const onboardingSchema = z.object({
    display_name: z.string().min(1),
    preferences: z.object({
        cuisine_preferences: z.array(z.string()),
        ambiance_preferences: z.array(z.string()),
        dietary_restrictions: z.array(z.string()),
        price_range: z.object({
            min: z.number(),
            max: z.number(),
        }),
    }),
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
                await userService.completeOnboarding({
                    user_id: userId,
                    display_name: parsed.data.display_name,
                    preferences: parsed.data.preferences,
                });

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
}
