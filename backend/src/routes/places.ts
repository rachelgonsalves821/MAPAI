/**
 * Mapai Backend — Places Routes
 * GET  /v1/places/nearby  — search nearby places with personalization.
 * GET  /v1/places/:id     — get enriched place details.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { PlacesService } from '../services/places-service.js';
import { MemoryService } from '../services/memory-service.js';

const nearbyQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().min(100).max(50000).default(3000),
    category: z.string().optional(),
    max_results: z.coerce.number().min(1).max(50).default(20),
});

export async function placesRoutes(app: FastifyInstance) {
    const places = new PlacesService();
    const memory = new MemoryService();

    /**
     * GET /v1/places/nearby?lat=42.36&lng=-71.06&radius=3000
     * Returns personalized place results sorted by match score.
     */
    app.get('/nearby', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = nearbyQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid query parameters', 'ValidationError', parsed.error.message)
                );
            }

            const { lat, lng, radius, category, max_results } = parsed.data;
            const userId = request.user!.id;

            try {
                const userMemory = await memory.getUserContext(userId);

                const results = await places.searchNearby({
                    location: { latitude: lat, longitude: lng },
                    radius,
                    category,
                    maxResults: max_results,
                    userId,
                    userMemory,
                });

                return envelope({
                    places: results,
                    total: results.length,
                    center: { lat, lng },
                    radius,
                });
            } catch (err: any) {
                app.log.error(err, 'Nearby search error');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to search nearby places', 'PlacesError')
                );
            }
        },
    });

    /**
     * GET /v1/places/:id
     * Returns enriched place details with match score, social signals, etc.
     */
    app.get('/:id', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { id } = request.params as { id: string };
            const userId = request.user!.id;

            try {
                const userMemory = await memory.getUserContext(userId);
                const place = await places.getDetails(id, userId, userMemory);

                if (!place) {
                    return reply.status(404).send(
                        errorResponse(404, 'Place not found', 'NotFoundError')
                    );
                }

                return envelope({ place });
            } catch (err: any) {
                app.log.error(err, 'Place details error');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to get place details', 'PlacesError')
                );
            }
        },
    });
}
