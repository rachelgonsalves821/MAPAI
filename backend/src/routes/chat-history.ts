/**
 * Mapai Backend — Chat History Routes
 * GET  /v1/chat/history/sessions                        — List recent sessions
 * GET  /v1/chat/history/sessions/:sessionId             — Get messages for a session
 * POST /v1/chat/history/sessions                        — Create new session
 * POST /v1/chat/history/sessions/:sessionId/messages    — Add message to session
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

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function chatHistoryRoutes(app: FastifyInstance) {
    const chatService = new ChatService();

    /**
     * GET /v1/chat/history/sessions
     * Return the authenticated user's most recent chat sessions (up to 20).
     */
    app.get('/sessions', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;

            try {
                const sessions = await chatService.getRecentSessions(userId);
                return reply.send(envelope(sessions));
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
     * Return all messages for a specific session, oldest first.
     */
    app.get<{ Params: { sessionId: string } }>('/sessions/:sessionId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const { sessionId } = request.params;

            if (!sessionId) {
                return reply.status(400).send(
                    errorResponse(400, 'sessionId is required', 'ValidationError')
                );
            }

            try {
                const messages = await chatService.getSessionHistory(sessionId);
                return reply.send(envelope(messages));
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
