/**
 * Mapai Backend — Main Server
 * Fastify server with CORS, WebSocket, rate limiting, and route registration.
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config, validateConfig } from './config.js';
import { chatRoutes } from './routes/chat.js';
import { placesRoutes } from './routes/places.js';
import { memoryRoutes } from './routes/memory.js';
import { navigationRoutes } from './routes/navigation.js';
import { healthRoutes } from './routes/health.js';
import { userRoutes } from './routes/user.js';
import { socialRoutes } from './routes/social.js';
import { planningRoutes } from './routes/planning.js';
import { loyaltyRoutes } from './routes/loyalty.js';
import { reviewRoutes } from './routes/reviews.js';
import { friendRoutes } from './routes/friends.js';
import { usersSearchRoutes } from './routes/users-search.js';
import { chatHistoryRoutes } from './routes/chat-history.js';
import { clerkWebhookRoutes } from './routes/webhooks-clerk.js';
import { surveyRoutes } from './routes/survey.js';

async function main() {
    // Validate config — critical errors are fatal in non-dev environments
    const { warnings, criticalErrors } = validateConfig();

    if (warnings.length > 0) {
        console.warn('Config warnings:');
        warnings.forEach((w) => console.warn(`   - ${w}`));
    }

    if (criticalErrors.length > 0) {
        console.error('FATAL: Server cannot start due to critical configuration errors:');
        criticalErrors.forEach((e) => console.error(`   - ${e}`));
        process.exit(1);
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
        origin: config.corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await app.register(websocket);

    await app.register(rateLimit, {
        max: config.isDev ? 1000 : 100,
        timeWindow: '1 minute',
    });

    // Root / landing
    app.get('/', async () => {
        return {
            name: 'Mapai API',
            status: 'running',
            documentation: '/v1/health',
            message: 'Welcome to the Mapai API. Use /v1 prefix for all endpoints.'
        };
    });

    // Routes (all prefixed with /v1)
    await app.register(healthRoutes, { prefix: '/v1' });
    await app.register(chatRoutes, { prefix: '/v1/chat' });
    await app.register(placesRoutes, { prefix: '/v1/places' });
    await app.register(memoryRoutes, { prefix: '/v1/user' });
    await app.register(userRoutes, { prefix: '/v1/user' });
    await app.register(navigationRoutes, { prefix: '/v1/navigation' });
    await app.register(socialRoutes, { prefix: '/v1/social' });
    await app.register(planningRoutes, { prefix: '/v1/planning' });
    await app.register(loyaltyRoutes, { prefix: '/v1/loyalty' });
    await app.register(reviewRoutes, { prefix: '/v1/reviews' });
    await app.register(friendRoutes, { prefix: '/v1/friends' });
    await app.register(usersSearchRoutes, { prefix: '/v1/users' });
    await app.register(chatHistoryRoutes, { prefix: '/v1/chat/history' });
    await app.register(clerkWebhookRoutes, { prefix: '/v1/webhooks' });
    await app.register(surveyRoutes, { prefix: '/v1/surveys' });

    // Global error handler
    app.setErrorHandler((error: any, _request, reply) => {
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

    return app;
}

/**
 * Build and export the Fastify app for serverless usage (Vercel).
 * The app is fully configured but NOT listening on a port.
 */
export { main as buildApp };

// Only start the server when running directly (not imported as a module).
// Vercel sets VERCEL=1; in that case we skip app.listen().
if (!process.env.VERCEL) {
    main().then(async (app) => {
        try {
            await app.listen({ port: config.port, host: config.host });
            console.log(`\n🗺️  Mapai API running at http://${config.host}:${config.port}`);
            console.log(`   Environment: ${config.nodeEnv}`);
            console.log(`   Claude model: ${config.anthropic.model}\n`);
        } catch (err) {
            app.log.error(err);
            process.exit(1);
        }
    });
}
