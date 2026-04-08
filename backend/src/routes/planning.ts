/**
 * Mapai Backend — Planning Routes
 * Collaborative trip planning sessions, suggestions, votes, messages.
 *
 * POST   /v1/planning/sessions                    — create session
 * GET    /v1/planning/sessions                    — list user's sessions
 * GET    /v1/planning/sessions/:id                — full session state
 * POST   /v1/planning/sessions/:id/suggestions    — add suggestion
 * POST   /v1/planning/sessions/:id/vote           — cast vote
 * POST   /v1/planning/sessions/:id/decide         — finalize decision (creator)
 * POST   /v1/planning/sessions/:id/messages       — send message
 * GET    /v1/planning/sessions/:id/updates        — poll for new data
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { PlanningService, SuggestionInput } from '../services/planning-service.js';

// ─── Validation schemas ───────────────────────────────────────

const createSessionSchema = z.object({
    title:      z.string().min(1).max(100),
    friend_ids: z.array(z.string()).max(9).default([]),
});

const addSuggestionSchema = z.object({
    place_id:       z.string().min(1),
    place_name:     z.string().min(1).max(255),
    place_address:  z.string().max(500).optional(),
    place_location: z.record(z.any()).optional(),
    note:           z.string().max(300).optional(),
});

const castVoteSchema = z.object({
    suggestion_id: z.string().min(1),
});

const sendMessageSchema = z.object({
    text: z.string().min(1).max(500),
});

// ─── Route plugin ─────────────────────────────────────────────

export async function planningRoutes(app: FastifyInstance) {
    const planning = new PlanningService();

    // ── POST /sessions ──────────────────────────────────────

    app.post('/sessions', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = createSessionSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid request body', 'ValidationError')
                );
            }

            const userId = request.user!.id;
            const { title, friend_ids } = parsed.data;

            try {
                const session = await planning.createSession(userId, title, friend_ids);
                return reply.status(201).send(envelope({ session }));
            } catch (err: any) {
                return reply.status(400).send(
                    errorResponse(400, err.message, 'PlanningError')
                );
            }
        },
    });

    // ── GET /sessions ───────────────────────────────────────

    app.get('/sessions', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const userId = request.user!.id;
            const sessions = await planning.getUserSessions(userId);
            return envelope({ sessions, count: sessions.length });
        },
    });

    // ── GET /sessions/:id ───────────────────────────────────

    app.get<{ Params: { id: string } }>('/sessions/:id', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId    = request.user!.id;
            const sessionId = request.params.id;

            const member = await planning.isMember(sessionId, userId);
            if (!member) {
                return reply.status(403).send(
                    errorResponse(403, 'Not a member of this session', 'ForbiddenError')
                );
            }

            const data = await planning.getSession(sessionId, userId);
            if (!data) {
                return reply.status(404).send(
                    errorResponse(404, 'Session not found', 'NotFoundError')
                );
            }

            return envelope(data);
        },
    });

    // ── POST /sessions/:id/suggestions ──────────────────────

    app.post<{ Params: { id: string } }>('/sessions/:id/suggestions', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = addSuggestionSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid suggestion data', 'ValidationError')
                );
            }

            const userId    = request.user!.id;
            const sessionId = request.params.id;

            const member = await planning.isMember(sessionId, userId);
            if (!member) {
                return reply.status(403).send(
                    errorResponse(403, 'Not a member of this session', 'ForbiddenError')
                );
            }

            try {
                const suggestion = await planning.addSuggestion(sessionId, userId, parsed.data as SuggestionInput);
                return reply.status(201).send(envelope({ suggestion }));
            } catch (err: any) {
                return reply.status(400).send(
                    errorResponse(400, err.message, 'PlanningError')
                );
            }
        },
    });

    // ── POST /sessions/:id/vote ─────────────────────────────

    app.post<{ Params: { id: string } }>('/sessions/:id/vote', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = castVoteSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'suggestion_id required', 'ValidationError')
                );
            }

            const userId    = request.user!.id;
            const sessionId = request.params.id;

            const member = await planning.isMember(sessionId, userId);
            if (!member) {
                return reply.status(403).send(
                    errorResponse(403, 'Not a member of this session', 'ForbiddenError')
                );
            }

            try {
                const vote = await planning.castVote(sessionId, userId, parsed.data.suggestion_id);
                return envelope({ vote });
            } catch (err: any) {
                return reply.status(400).send(
                    errorResponse(400, err.message, 'PlanningError')
                );
            }
        },
    });

    // ── POST /sessions/:id/decide ───────────────────────────

    app.post<{ Params: { id: string } }>('/sessions/:id/decide', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId    = request.user!.id;
            const sessionId = request.params.id;

            const member = await planning.isMember(sessionId, userId);
            if (!member) {
                return reply.status(403).send(
                    errorResponse(403, 'Not a member of this session', 'ForbiddenError')
                );
            }

            try {
                const winner = await planning.finalizeDecision(sessionId, userId);
                return envelope({ winner, decided: true });
            } catch (err: any) {
                return reply.status(400).send(
                    errorResponse(400, err.message, 'PlanningError')
                );
            }
        },
    });

    // ── POST /sessions/:id/messages ─────────────────────────

    app.post<{ Params: { id: string } }>('/sessions/:id/messages', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = sendMessageSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'text is required (max 500 chars)', 'ValidationError')
                );
            }

            const userId    = request.user!.id;
            const sessionId = request.params.id;

            const member = await planning.isMember(sessionId, userId);
            if (!member) {
                return reply.status(403).send(
                    errorResponse(403, 'Not a member of this session', 'ForbiddenError')
                );
            }

            const message = await planning.sendMessage(sessionId, userId, parsed.data.text);
            return reply.status(201).send(envelope({ message }));
        },
    });

    // ── GET /sessions/:id/updates ───────────────────────────

    app.get<{ Params: { id: string }; Querystring: { since?: string } }>('/sessions/:id/updates', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId    = request.user!.id;
            const sessionId = request.params.id;
            const since     = request.query.since || new Date(0).toISOString();

            const member = await planning.isMember(sessionId, userId);
            if (!member) {
                return reply.status(403).send(
                    errorResponse(403, 'Not a member of this session', 'ForbiddenError')
                );
            }

            const updates = await planning.getUpdates(sessionId, since);
            return envelope(updates);
        },
    });
}
