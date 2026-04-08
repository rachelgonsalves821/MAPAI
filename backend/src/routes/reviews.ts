/**
 * Mapai Backend — Review Routes
 * POST   /v1/reviews/places/:placeId          — create or update review
 * GET    /v1/reviews/places/:placeId           — all reviews for a place
 * GET    /v1/reviews/places/:placeId/friends   — friends-only reviews
 * GET    /v1/reviews/user/:userId              — all reviews by a user
 * DELETE /v1/reviews/places/:placeId           — delete own review
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { ReviewService } from '../services/review-service.js';

const createReviewSchema = z.object({
    rating: z.number().int().min(1).max(5).optional(),
    review_text: z.string().max(500).optional(),
    visit_date: z.string().optional(),  // ISO date string "YYYY-MM-DD"
    place_name: z.string().max(255).optional(),
});

export async function reviewRoutes(app: FastifyInstance) {
    const reviews = new ReviewService();

    /**
     * POST /v1/reviews/places/:placeId
     */
    app.post<{ Params: { placeId: string } }>('/places/:placeId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = createReviewSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid review body', 'ValidationError',
                        parsed.error.issues.map(i => i.message).join(', '))
                );
            }

            const userId = request.user!.id;
            const { placeId } = request.params;
            const { rating, review_text, visit_date, place_name } = parsed.data;

            try {
                const review = await reviews.createReview(userId, placeId, {
                    rating,
                    reviewText: review_text,
                    visitDate: visit_date,
                    placeName: place_name,
                });
                return reply.status(201).send(envelope(review));
            } catch (err: any) {
                return reply.status(500).send(
                    errorResponse(500, err?.message ?? 'Failed to save review', 'ServerError')
                );
            }
        },
    });

    /**
     * GET /v1/reviews/places/:placeId
     */
    app.get<{ Params: { placeId: string } }>('/places/:placeId', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const viewerId = request.user!.id;
            const { placeId } = request.params;
            const placeReviews = await reviews.getPlaceReviews(placeId, viewerId);
            return envelope({ reviews: placeReviews, count: placeReviews.length });
        },
    });

    /**
     * GET /v1/reviews/places/:placeId/friends
     */
    app.get<{ Params: { placeId: string } }>('/places/:placeId/friends', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const userId = request.user!.id;
            const { placeId } = request.params;
            const friendReviews = await reviews.getFriendReviews(placeId, userId);
            return envelope({ reviews: friendReviews, count: friendReviews.length });
        },
    });

    /**
     * GET /v1/reviews/user/:userId
     */
    app.get<{ Params: { userId: string } }>('/user/:userId', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const { userId } = request.params;
            const userReviews = await reviews.getUserReviews(userId);
            return envelope({ reviews: userReviews, count: userReviews.length });
        },
    });

    /**
     * DELETE /v1/reviews/places/:placeId
     */
    app.delete<{ Params: { placeId: string } }>('/places/:placeId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;
            const { placeId } = request.params;

            const existing = await reviews.getReview(userId, placeId);
            if (!existing) {
                return reply.status(404).send(
                    errorResponse(404, 'Review not found', 'NotFoundError')
                );
            }

            await reviews.deleteReview(userId, placeId);
            return envelope({ deleted: true });
        },
    });
}
