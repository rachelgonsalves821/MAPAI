/**
 * Mapai Backend — Survey Routes
 * POST /v1/surveys/create                   — Create arrival survey after check-in
 * GET  /v1/surveys/pending                  — Get user's pending survey (if any)
 * POST /v1/surveys/:surveyId/submit         — Submit survey responses
 * GET  /v1/surveys/place/:placeId/stats     — Aggregated survey stats for a place
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { SurveyService, SurveyResponse } from '../services/survey-service.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createSurveySchema = z.object({
    place_id: z.string().min(1),
    place_name: z.string().min(1).max(255),
});

const surveyResponseSchema = z.object({
    // Accept any question ID so that new dimensions and legacy IDs both pass
    // validation without a schema change.  The service layer owns semantic
    // validation of which IDs are meaningful.
    questionId: z.string().min(1).max(50),
    answer: z.string().min(1).max(255),
});

const submitSurveySchema = z.object({
    // 1–5 responses: covers the 5 new PRD dimensions and the legacy 2-question
    // format (min(1) rejects empty submissions).
    responses: z.array(surveyResponseSchema).min(1).max(5),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function surveyRoutes(app: FastifyInstance) {
    const surveys = new SurveyService();

    /**
     * POST /v1/surveys/create
     * Creates a new arrival survey for the authenticated user.
     * Typically called by the check-in endpoint internally, but also exposed
     * here so the client can request one directly (e.g. after a QR scan).
     *
     * Body: { place_id, place_name }
     * Returns: Survey (with questions)
     */
    app.post('/create', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = createSurveySchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(
                        400,
                        'Invalid request body',
                        'ValidationError',
                        parsed.error.issues.map(i => i.message).join(', ')
                    )
                );
            }

            const userId = request.user!.id;
            const { place_id, place_name } = parsed.data;

            try {
                const survey = await surveys.createSurveyForCheckIn(userId, place_id, place_name);
                return reply.status(201).send(envelope(survey));
            } catch (err: any) {
                return reply.status(500).send(
                    errorResponse(500, err?.message ?? 'Failed to create survey', 'ServerError')
                );
            }
        },
    });

    /**
     * GET /v1/surveys/pending
     * Returns the authenticated user's most recent incomplete survey if it was
     * created within the last 24 hours. Returns null data if none exist.
     */
    app.get('/pending', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;

            try {
                const survey = await surveys.getPendingSurvey(userId);
                return envelope({ survey });
            } catch (err: any) {
                return reply.status(500).send(
                    errorResponse(500, err?.message ?? 'Failed to load pending survey', 'ServerError')
                );
            }
        },
    });

    /**
     * POST /v1/surveys/:surveyId/submit
     * Submit responses for a specific survey.
     * Awards 5 loyalty points and triggers preference learning.
     *
     * Body: { responses: [{ questionId, answer }] }
     */
    app.post<{ Params: { surveyId: string } }>('/:surveyId/submit', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = submitSurveySchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(
                        400,
                        'Invalid survey responses',
                        'ValidationError',
                        parsed.error.issues.map(i => i.message).join(', ')
                    )
                );
            }

            const userId = request.user!.id;
            const { surveyId } = request.params;
            const { responses } = parsed.data;

            try {
                await surveys.submitSurvey(userId, surveyId, responses as SurveyResponse[]);
                return envelope({ submitted: true, points_awarded: 5 });
            } catch (err: any) {
                const msg: string = err?.message ?? 'Failed to submit survey';

                if (msg.includes('not found')) {
                    return reply.status(404).send(
                        errorResponse(404, msg, 'NotFoundError')
                    );
                }
                if (msg.includes('already completed')) {
                    return reply.status(409).send(
                        errorResponse(409, msg, 'ConflictError')
                    );
                }
                if (msg.includes('expired')) {
                    return reply.status(410).send(
                        errorResponse(410, msg, 'ExpiredError')
                    );
                }
                return reply.status(500).send(
                    errorResponse(500, msg, 'ServerError')
                );
            }
        },
    });

    /**
     * GET /v1/surveys/place/:placeId/stats
     * Returns aggregated, anonymized survey statistics for a place.
     * Suitable for displaying to place owners or on a place detail screen.
     */
    app.get<{ Params: { placeId: string } }>('/place/:placeId/stats', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { placeId } = request.params;

            try {
                const stats = await surveys.getPlaceSurveyStats(placeId);
                return envelope(stats);
            } catch (err: any) {
                return reply.status(500).send(
                    errorResponse(500, err?.message ?? 'Failed to load survey stats', 'ServerError')
                );
            }
        },
    });
}
