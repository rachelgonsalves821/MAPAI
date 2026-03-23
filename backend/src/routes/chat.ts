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

                // 1. Load user memory/preferences
                const userMemory = await memory.getUserContext(userId);
                const tMemory = Date.now();
                console.log(`[Chat] Memory loaded in ${tMemory - t0}ms for user ${userId}`);

                // 2. Send to AI orchestrator
                const aiResponse = await ai.chat({
                    message,
                    userId,
                    sessionId: session_id,
                    userMemory,
                    location: location
                        ? { latitude: location.lat, longitude: location.lng }
                        : undefined,
                    context,
                });
                const tAi = Date.now();
                console.log(`[Chat] AI responded in ${tAi - tMemory}ms — searchQuery: ${aiResponse.searchQuery ? `"${aiResponse.searchQuery}"` : '(none)'}`);

                // 3. If AI detected a discovery intent, fetch real places
                let placeResults: any[] = [];
                if (aiResponse.searchQuery) {
                    const searchLocation = location || { lat: 42.3601, lng: -71.0589 }; // default: Boston
                    placeResults = await places.search({
                        query: aiResponse.searchQuery,
                        location: { latitude: searchLocation.lat, longitude: searchLocation.lng },
                        userId,
                        userMemory,
                    });
                    const tPlaces = Date.now();
                    console.log(`[Chat] Places search returned ${placeResults.length} results in ${tPlaces - tAi}ms`);
                }

                // 4. Extract preference insights from conversation and save
                if (aiResponse.preferenceInsights && aiResponse.preferenceInsights.length > 0) {
                    await memory.learnFromInsights(userId, aiResponse.preferenceInsights);
                }

                const totalMs = Date.now() - t0;
                const responseType = placeResults.length > 0
                    ? 'recommendation'
                    : aiResponse.text
                        ? 'conversational'
                        : 'error';
                console.log(`[Chat] Total request time: ${totalMs}ms — type: ${responseType}`);

                return envelope({
                    type: responseType,
                    reply: aiResponse.text,
                    places: placeResults,
                    intent: aiResponse.discoveryIntent || null,
                    session_id: aiResponse.sessionId,
                });
            } catch (err: any) {
                app.log.error(err, 'Chat error');
                return reply.status(500).send(
                    errorResponse(500, 'Failed to process chat message', 'ChatError')
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
