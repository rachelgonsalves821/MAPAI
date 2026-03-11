/**
 * Mapai Backend — Main Server
 * Fastify server with CORS, WebSocket, rate limiting, and route registration.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config, validateConfig } from './config.js';
import { chatRoutes } from './routes/chat.js';
import { placesRoutes } from './routes/places.js';
import { memoryRoutes } from './routes/memory.js';
import { healthRoutes } from './routes/health.js';

async function main() {
    // Validate config
    const warnings = validateConfig();
    if (warnings.length > 0) {
        console.warn('⚠️  Config warnings:');
        warnings.forEach((w) => console.warn(`   - ${w}`));
    }

    // Initialize Fastify
    const app = Fastify({
        logger: {
            level: config.isDev ? 'info' : 'warn',
            transport: config.isDev
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
        },
    });

    // Plugins
    await app.register(cors, {
        origin: config.corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await app.register(websocket);

    await app.register(rateLimit, {
        max: config.isDev ? 1000 : 100,
        timeWindow: '1 minute',
    });

    // Routes (all prefixed with /v1)
    await app.register(healthRoutes);
    await app.register(chatRoutes, { prefix: '/v1/chat' });
    await app.register(placesRoutes, { prefix: '/v1/places' });
    await app.register(memoryRoutes, { prefix: '/v1/user' });

    // Global error handler
    app.setErrorHandler((error, _request, reply) => {
        const statusCode = error.statusCode || 500;
        app.log.error(error);
        reply.status(statusCode).send({
            error: {
                type: error.name || 'InternalError',
                title: error.message || 'An unexpected error occurred',
                status: statusCode,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    });

    // Start
    try {
        await app.listen({ port: config.port, host: config.host });
        console.log(`\n🗺️  Mapai API running at http://${config.host}:${config.port}`);
        console.log(`   Environment: ${config.nodeEnv}`);
        console.log(`   Claude model: ${config.anthropic.model}\n`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
