/**
 * Mapai Backend — Chat History Routes
 * GET    /v1/chat/history/sessions                        — List recent sessions
 * GET    /v1/chat/history/sessions/:sessionId             — Get session with all messages
 * POST   /v1/chat/history/sessions                        — Create new session
 * PATCH  /v1/chat/history/sessions/:sessionId             — Update title/summary
 * DELETE /v1/chat/history/sessions/:sessionId             — Delete a session
 * POST   /v1/chat/history/sessions/:sessionId/messages    — Add message to session
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { ChatService } from '../services/chat-service.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addMessageSchema = z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(10000),
    metadata: z.record(z.unknown()).optional(),
});

const updateSessionSchema = z.object({
    title: z.string().max(200).optional(),
    summary: z.string().max(500).optional(),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function chatHistoryRoutes(app: FastifyInstance) {
    const chatService = new ChatService();

    /**
     * GET /v1/chat/history/sessions
     * Return the authenticated user's most recent chat sessions (last 30 days).
     * Optional query param `q` filters results by keyword (searches title,
     * summary, and message content via ILIKE).
     */
    app.get<{ Querystring: { limit?: string; q?: string } }>('/sessions', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;
            const limit = Math.min(
                parseInt((request.query as any).limit as string) || 20,
                50
            );
            const q = ((request.query as any).q as string | undefined)?.trim() || undefined;

            try {
                const sessions = await chatService.getRecentSessions(userId, limit, q);
                return reply.send(envelope({ sessions }));
            } catch (error: any) {
                app.log.error(error, 'Failed to fetch sessions');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to fetch chat sessions', 'ServerError')
                );
            }
        },
    });

    /**
     * GET /v1/chat/history/sessions/:sessionId
     * Return session metadata + all messages, oldest first.
     */
    app.get<{ Params: { sessionId: string } }>('/sessions/:sessionId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { sessionId } = request.params;
            const userId = request.user!.id;

            if (!sessionId) {
                return reply.status(400).send(
                    errorResponse(400, 'sessionId is required', 'ValidationError')
                );
            }

            try {
                const result = await chatService.getSessionWithMessages(sessionId, userId);
                if (!result) {
                    return reply.status(404).send(
                        errorResponse(404, 'Session not found', 'NotFound')
                    );
                }
                return reply.send(envelope(result));
            } catch (error: any) {
                app.log.error(error, 'Failed to fetch session history');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to fetch session history', 'ServerError')
                );
            }
        },
    });

    /**
     * POST /v1/chat/history/sessions
     * Create a new empty chat session for the current user.
     * Returns the new session ID.
     */
    app.post('/sessions', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;

            try {
                const sessionId = await chatService.createSession(userId);
                return reply.status(201).send(envelope({ session_id: sessionId }));
            } catch (error: any) {
                app.log.error(error, 'Failed to create session');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to create chat session', 'ServerError')
                );
            }
        },
    });

    /**
     * PATCH /v1/chat/history/sessions/:sessionId
     * Update title and/or summary on a session.
     */
    app.patch<{ Params: { sessionId: string } }>('/sessions/:sessionId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { sessionId } = request.params;
            const userId = request.user!.id;

            const parsed = updateSessionSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid request body', 'ValidationError', parsed.error.message)
                );
            }

            try {
                await chatService.updateSession(sessionId, userId, parsed.data);
                return reply.send(envelope({ updated: true }));
            } catch (error: any) {
                app.log.error(error, 'Failed to update session');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to update session', 'ServerError')
                );
            }
        },
    });

    /**
     * DELETE /v1/chat/history/sessions/:sessionId
     * Delete a session and cascade-delete its messages.
     */
    app.delete<{ Params: { sessionId: string } }>('/sessions/:sessionId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { sessionId } = request.params;
            const userId = request.user!.id;

            try {
                await chatService.deleteSession(sessionId, userId);
                return reply.send(envelope({ deleted: true }));
            } catch (error: any) {
                app.log.error(error, 'Failed to delete session');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to delete session', 'ServerError')
                );
            }
        },
    });

    /**
     * POST /v1/chat/history/sessions/:sessionId/messages
     * Append a message to an existing chat session.
     */
    app.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/messages', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { sessionId } = request.params;
            const userId = request.user!.id;

            const parsed = addMessageSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid request body', 'ValidationError', parsed.error.message)
                );
            }

            const { role, content, metadata } = parsed.data;

            try {
                await chatService.saveMessage({
                    sessionId,
                    clerkUserId: userId,
                    role,
                    content,
                    metadata: metadata as Record<string, any> | undefined,
                });
                return reply.status(201).send(envelope({ saved: true, session_id: sessionId }));
            } catch (error: any) {
                app.log.error(error, 'Failed to save message');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to save message', 'ServerError')
                );
            }
        },
    });
}
