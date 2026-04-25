/**
 * Mapai Backend — Memory Routes
 * GET    /v1/user/memory                    — get current user preferences + memory facts.
 * PUT    /v1/user/memory                    — update user preferences.
 * DELETE /v1/user/memory                    — clear all preferences (privacy).
 * GET    /v1/user/preferences               — all preferences for current user (flat list).
 * POST   /v1/user/preferences               — upsert a preference dimension.
 * DELETE /v1/user/preferences/:dimension    — delete a single preference dimension.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { MemoryService } from '../services/memory-service.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

const upsertPreferenceSchema = z.object({
    dimension: z.string().min(1).max(100),
    value: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1.0),
});

const deletePreferenceDimensionSchema = z.object({
    dimension: z.string().min(1).max(100),
});

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

    /**
     * GET /v1/user/preferences
     * Return all preferences for the current user as a flat list.
     */
    app.get('/preferences', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const userId = request.user!.id;

            if (!hasDatabase()) {
                const ctx = await memory.getUserContext(userId);
                return envelope({ preferences: ctx });
            }

            const supabase = getSupabase()!;
            const { data } = await (supabase as any)
                .from('user_preferences')
                .select('dimension, value, confidence, last_updated')
                .or(`user_id.eq.${userId},user_id.eq.${userId}`)
                .order('confidence', { ascending: false });

            return envelope({ preferences: data ?? [] });
        },
    });

    /**
     * POST /v1/user/preferences
     * Upsert a single preference dimension for the current user.
     */
    app.post('/preferences', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;
            const parsed = upsertPreferenceSchema.safeParse(request.body);

            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid preference', 'ValidationError', parsed.error.message)
                );
            }

            const { dimension, value, confidence } = parsed.data;

            if (!hasDatabase()) {
                return envelope({ dimension, value, confidence });
            }

            const supabase = getSupabase()!;
            const { data, error } = await (supabase as any)
                .from('user_preferences')
                .upsert(
                    {
                        user_id: userId,
                        user_id: userId,
                        dimension,
                        value,
                        confidence: Math.min(confidence, 1.0),
                        source: 'explicit',
                        last_updated: new Date().toISOString(),
                        decay_weight: 1.0,
                    },
                    { onConflict: 'user_id,dimension' }
                )
                .select()
                .single();

            if (error) {
                return reply.status(500).send(
                    errorResponse(500, 'Failed to save preference', 'ServerError')
                );
            }

            return envelope(data);
        },
    });

    /**
     * DELETE /v1/user/preferences/:dimension
     * Delete a single preference dimension for the current user (idempotent).
     */
    app.delete('/preferences/:dimension', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = deletePreferenceDimensionSchema.safeParse(
                (request.params as any)
            );

            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid dimension', 'ValidationError', parsed.error.message)
                );
            }

            const { dimension } = parsed.data;
            const userId = request.user!.id;

            if (!hasDatabase()) {
                // In-memory fallback — nothing to delete, return success idempotently
                return envelope({ deleted: true, dimension });
            }

            const supabase = getSupabase()!;
            const { error } = await (supabase as any)
                .from('user_preferences')
                .delete()
                .or(`user_id.eq.${userId},user_id.eq.${userId}`)
                .eq('dimension', dimension);

            if (error) {
                return reply.status(500).send(
                    errorResponse(500, 'Failed to delete preference', 'ServerError')
                );
            }

            return envelope({ deleted: true, dimension });
        },
    });
}
