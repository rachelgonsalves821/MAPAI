/**
 * Mapai Backend — JWT Auth Middleware
 * Validates Supabase JWT tokens on protected routes.
 * In dev mode, allows unauthenticated access with a test user.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthUser {
    id: string;
    email?: string;
    role: string;
}

// Extend Fastify request with user
declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthUser;
    }
}

// Dev-mode test user (no real auth needed during development)
const DEV_USER: AuthUser = {
    id: 'dev-user-001',
    email: 'dev@mapai.app',
    role: 'authenticated',
};

/**
 * Authentication hook — attach to routes that need a logged-in user.
 */
export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Dev mode: skip auth, use test user
    if (config.isDev && !request.headers.authorization) {
        request.user = DEV_USER;
        return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        reply.status(401).send({
            error: {
                type: 'AuthenticationError',
                title: 'Missing or invalid authorization header',
                status: 401,
            },
        });
        return;
    }

    const token = authHeader.slice(7);

    try {
        if (!config.supabase.jwtSecret) {
            // No JWT secret configured — accept token as-is in dev
            if (config.isDev) {
                request.user = DEV_USER;
                return;
            }
            throw new Error('JWT secret not configured');
        }

        const decoded = jwt.verify(token, config.supabase.jwtSecret) as jwt.JwtPayload;
        request.user = {
            id: decoded.sub || '',
            email: decoded.email as string | undefined,
            role: (decoded.role as string) || 'authenticated',
        };
    } catch (err) {
        reply.status(401).send({
            error: {
                type: 'AuthenticationError',
                title: 'Invalid or expired token',
                status: 401,
            },
        });
    }
}
