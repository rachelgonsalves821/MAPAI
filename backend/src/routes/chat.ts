/**
 * Mapai Backend — Chat Routes
 * POST /v1/chat/message — send a message and get an AI response with place results.
 * GET  /v1/chat/stream  — WebSocket for streaming chat (Sprint 2).
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { AiOrchestrator } from '../services/ai-orchestrator.js';
import { PlacesService } from '../services/places-service.js';
import { MemoryService } from '../services/memory-service.js';
import { ChatService } from '../services/chat-service.js';
import { config } from '../config.js';

// Request validation
const chatMessageSchema = z.object({
    message: z.string().min(1).max(2000),
    session_id: z.string().optional(),
    location: z
        .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
        })
        .optional(),
    context: z
        .object({
            neighborhood: z.string().optional(),
            time_of_day: z.string().optional(),
        })
        .optional(),
});

export async function chatRoutes(app: FastifyInstance) {
    const ai = new AiOrchestrator();
    const places = new PlacesService();
    const memory = new MemoryService();
    const chat = new ChatService();

    /**
     * POST /v1/chat/message
     * Main conversational endpoint. Sends user message → Claude → returns reply + places.
     */
    app.post('/message', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = chatMessageSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid request body', 'ValidationError', parsed.error.message)
                );
            }

            const { message, session_id, location, context } = parsed.data;
            const userId = request.user!.id;

            try {
                const t0 = Date.now();
                request.log.info({ userId, msgLen: message.length }, '[Chat] incoming message');

                // 1. Resolve or create the chat session so messages are always persisted,
                //    even if the frontend's fire-and-forget calls fail.
                let sessionId = session_id;
                if (!sessionId) {
                    sessionId = await chat.createSession(userId);
                    request.log.info({ sessionId }, '[Chat] new session created');
                }

                // 2. Persist the user message BEFORE calling the LLM.
                //    This guarantees the message is saved even if the LLM call fails.
                try {
                    await chat.saveMessage({
                        sessionId,
                        clerkUserId: userId,
                        role: 'user',
                        content: message,
                    });
                } catch (persistErr: any) {
                    // Non-fatal: log but don't block the LLM call
                    console.warn(`[Chat] Failed to persist user message: ${persistErr.message}`);
                }

                // 3. Load user memory/preferences
                const userMemory = await memory.getUserContext(userId);
                const tMemory = Date.now();
                request.log.info({ memoryMs: tMemory - t0 }, '[Chat] memory loaded');

                // 4. Send to AI orchestrator (history loading is now handled by orchestrator
                //    via ChatService.getSessionHistory, which reads from chat_messages)
                const aiResponse = await ai.chat({
                    message,
                    userId,
                    sessionId,
                    userMemory,
                    location: location
                        ? { latitude: location.lat, longitude: location.lng }
                        : undefined,
                    context,
                });
                const tAi = Date.now();
                request.log.info({ aiMs: tAi - tMemory, hasSearch: !!aiResponse.searchQuery }, '[Chat] AI responded');

                // 5. Persist the assistant response.
                try {
                    await chat.saveMessage({
                        sessionId,
                        clerkUserId: userId,
                        role: 'assistant',
                        content: aiResponse.text,
                    });
                } catch (persistErr: any) {
                    console.warn(`[Chat] Failed to persist assistant message: ${persistErr.message}`);
                }

                // 6. If AI detected a discovery intent, fetch real places
                let placeResults: any[] = [];
                if (aiResponse.searchQuery) {
                    if (!config.google.placesApiKey) {
                        console.warn('[Chat] GOOGLE_PLACES_API_KEY not set — skipping places search');
                    } else {
                        const searchLocation = location || { lat: 42.3601, lng: -71.0589 }; // default: Boston
                        placeResults = await places.search({
                            query: aiResponse.searchQuery,
                            location: { latitude: searchLocation.lat, longitude: searchLocation.lng },
                            userId,
                            userMemory,
                        });
                        const tPlaces = Date.now();
                        request.log.info({ placeCount: placeResults.length, placesMs: tPlaces - tAi }, '[Chat] places search complete');
                    }
                }

                // 7. Extract preference insights from conversation and save
                if (aiResponse.preferenceInsights && aiResponse.preferenceInsights.length > 0) {
                    await memory.learnFromInsights(userId, aiResponse.preferenceInsights);
                }

                const totalMs = Date.now() - t0;
                const responseType = placeResults.length > 0
                    ? 'recommendation'
                    : aiResponse.text
                        ? 'conversational'
                        : 'error';
                request.log.info({ totalMs, responseType, placeCount: placeResults.length, sessionId }, '[Chat] request complete');

                return envelope({
                    type: responseType,
                    reply: aiResponse.text,
                    places: placeResults,
                    intent: aiResponse.discoveryIntent || null,
                    // Always return the resolved sessionId so the client can store it
                    session_id: sessionId,
                });
            } catch (err: any) {
                console.error('[Chat] CHAT ERROR:', err);
                app.log.error(err, 'Chat error');
                return reply.status(500).send(
                    errorResponse(500, `Chat failed: ${err.message || 'Unknown error'}`, 'ChatError')
                );
            }
        },
    });

    /**
     * WebSocket /v1/chat/stream (Sprint 2 — streaming responses)
     */
    app.get('/stream', { websocket: true }, (socket, _request) => {
        socket.on('message', (rawMsg) => {
            // Sprint 2: Implement streaming via WebSocket
            socket.send(
                JSON.stringify({
                    type: 'info',
                    data: 'Streaming not yet implemented. Use POST /v1/chat/message.',
                })
            );
        });
    });
}
