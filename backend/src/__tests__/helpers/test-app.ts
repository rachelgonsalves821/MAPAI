/**
 * Test app factory — builds a Fastify instance with all routes registered.
 * External services (AI, Places, Memory) are mocked at the module level in
 * individual test files via vi.mock(). This helper just wires up the app.
 *
 * NODE_ENV=test is set in setup.ts so authMiddleware falls back to DEV_USER
 * for requests without an Authorization header.
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { chatRoutes } from '../../routes/chat.js';
import { healthRoutes } from '../../routes/health.js';
import { socialRoutes } from '../../routes/social.js';
import { friendRoutes } from '../../routes/friends.js';
import { reviewRoutes } from '../../routes/reviews.js';

export async function buildTestApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    await app.register(cors, { origin: '*' });
    await app.register(websocket);
    await app.register(rateLimit, { max: 10000, timeWindow: '1 minute' });

    await app.register(healthRoutes, { prefix: '/v1' });
    await app.register(chatRoutes, { prefix: '/v1/chat' });
    await app.register(socialRoutes, { prefix: '/v1/social' });
    await app.register(friendRoutes, { prefix: '/v1/friends' });
    await app.register(reviewRoutes, { prefix: '/v1/reviews' });

    await app.ready();
    return app;
}
