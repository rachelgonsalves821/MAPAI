/**
 * Mapai Backend — Memory Routes
 * GET  /v1/user/memory     — get current user preferences + memory facts.
 * PUT  /v1/user/memory     — update user preferences.
 * DELETE /v1/user/memory   — clear all preferences (privacy).
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { MemoryService } from '../services/memory-service.js';

const updateMemorySchema = z.object({
    preferences: z.object({
        cuisine_likes: z.array(z.string()).optional(),
        cuisine_dislikes: z.array(z.string()).optional(),
        price_range: z.object({ min: z.number(), max: z.number() }).optional(),
        speed_sensitivity: z.enum(['relaxed', 'moderate', 'fast']).optional(),
        ambiance_preferences: z.array(z.string()).optional(),
        dietary_restrictions: z.array(z.string()).optional(),
    }).optional(),
});

export async function memoryRoutes(app: FastifyInstance) {
    const memory = new MemoryService();

    /**
     * GET /v1/user/memory
     */
    app.get('/memory', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const userId = request.user!.id;
            const context = await memory.getUserContext(userId);
            const facts = await memory.getMemoryFacts(userId);

            return envelope({
                preferences: context,
                facts,
                fact_count: facts.length,
            });
        },
    });

    /**
     * PUT /v1/user/memory
     */
    app.put('/memory', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = updateMemorySchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid memory update', 'ValidationError', parsed.error.message)
                );
            }

            const userId = request.user!.id;
            await memory.updatePreferences(userId, parsed.data.preferences || {});

            return envelope({ updated: true });
        },
    });

    /**
     * DELETE /v1/user/memory
     */
    app.delete('/memory', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const userId = request.user!.id;
            await memory.clearAll(userId);
            return envelope({ cleared: true });
        },
    });
}
