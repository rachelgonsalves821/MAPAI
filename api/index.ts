/**
 * Vercel Serverless Function — Mapai API
 * Wraps the Fastify backend for Vercel's serverless runtime.
 * All /api/* requests are routed here by vercel.json.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { buildApp } from '../backend/src/server.js';

let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

async function getHandler() {
    if (handler) return handler;

    const app = await buildApp();
    await app.ready();

    handler = (req: IncomingMessage, res: ServerResponse) => {
        // Strip /api prefix so Fastify routes match (e.g., /api/v1/chat → /v1/chat)
        if (req.url?.startsWith('/api')) {
            req.url = req.url.slice(4) || '/';
        }
        app.server.emit('request', req, res);
    };

    return handler;
}

export default async function (req: IncomingMessage, res: ServerResponse) {
    const handle = await getHandler();
    handle(req, res);
}
