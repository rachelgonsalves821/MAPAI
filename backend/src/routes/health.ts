/**
 * Health check routes — no auth required.
 */

import { FastifyInstance } from 'fastify';
import { envelope } from '../utils/response.js';

export async function healthRoutes(app: FastifyInstance) {
    app.get('/health', async () => {
        return envelope({
            status: 'ok',
            version: '0.1.0',
            timestamp: new Date().toISOString(),
        });
    });
}
