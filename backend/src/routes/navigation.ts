/**
 * Mapai Backend — Navigation Routes
 * GET /v1/navigation/routes — calculate multi-modal paths to a destination.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { NavigationService } from '../services/navigation-service.js';

const routeQuerySchema = z.object({
    origin_lat: z.coerce.number().min(-90).max(90),
    origin_lng: z.coerce.number().min(-180).max(180),
    dest_lat: z.coerce.number().min(-90).max(90),
    dest_lng: z.coerce.number().min(-180).max(180),
    place_id: z.string(),
});

export async function navigationRoutes(app: FastifyInstance) {
    const nav = new NavigationService();

    /**
     * GET /v1/navigation/routes?origin_lat=...&origin_lng=...&dest_lat=...&dest_lng=...&place_id=...
     * Returns multi-modal route options (walking, transit, driving, cycling).
     */
    app.get('/routes', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = routeQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid routing parameters', 'ValidationError', parsed.error.message)
                );
            }

            const { origin_lat, origin_lng, dest_lat, dest_lng, place_id } = parsed.data;
            const userId = request.user!.id;

            try {
                const routes = await nav.getRoutes({
                    origin: { latitude: origin_lat, longitude: origin_lng },
                    destination: { latitude: dest_lat, longitude: dest_lng },
                    userId,
                    place_id: place_id, // Match DB column name or pass to service
                    placeId: place_id,
                } as any);

                return envelope({
                    routes,
                    destination: { lat: dest_lat, lng: dest_lng },
                    place_id,
                });
            } catch (err: any) {
                app.log.error(err, 'Navigation error');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to calculate routes', 'NavigationError')
                );
            }
        },
    });
}
