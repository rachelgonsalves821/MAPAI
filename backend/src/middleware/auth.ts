/**
 * Mapai Backend — JWT Auth Middleware
 * Validates Supabase JWTs on protected routes.
 *
 * Dev-user fallbacks are ONLY active when:
 *   - NODE_ENV === 'development'  (isDev)
 *   - REQUIRE_AUTH is not set to 'true'  (!requireAuth)
 *
 * Set REQUIRE_AUTH=true to test production-style auth in a local or staging env.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config, requireAuth } from '../config.js';

export interface AuthUser {
    id: string;
    email?: string;
    role: string;
}

/**
 * How the current request was authenticated.
 *
 *  'supabase-jwt' — Verified against SUPABASE_JWT_SECRET
 *  'dev-token'    — Matched DEV_AUTH_TOKEN (dev/test environments only)
 *  'dev-user'     — No token present; synthetic dev user injected (dev only)
 */
export type AuthMethod = 'supabase-jwt' | 'dev-token' | 'dev-user';

declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthUser;
        authMethod?: AuthMethod;
    }
}

const DEV_USER: AuthUser = {
    id: 'dev-user-001',
    email: 'dev@mapai.app',
    role: 'authenticated',
};

if (!requireAuth) {
    console.warn(
        '[Auth] Running in PERMISSIVE mode (SKIP_AUTH=true) — unauthenticated requests will receive a synthetic dev user.'
    );
} else {
    console.info('[Auth] Auth ENFORCED — all requests require a valid Supabase JWT.');
}

/**
 * Authentication hook — attach to routes that need a logged-in user.
 * Verifies Supabase JWTs using SUPABASE_JWT_SECRET.
 */
export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    if (!request.headers.authorization) {
        if (!requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
            return;
        }
        console.warn('[Auth] 401 — no Authorization header on', request.url);
        reply.status(401).send({
            error: {
                type: 'AuthenticationError',
                title: 'Missing or invalid authorization header',
                status: 401,
            },
        });
        return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader.startsWith('Bearer ')) {
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

    // Dev token shortcut — only permitted in permissive dev mode.
    const devToken = process.env.DEV_AUTH_TOKEN;
    if (!requireAuth && devToken && token === devToken) {
        request.user = DEV_USER;
        request.authMethod = 'dev-token';
        return;
    }

    // Verify Supabase JWT using SUPABASE_JWT_SECRET
    try {
        const secret = config.supabase?.jwtSecret;

        if (!secret) {
            if (requireAuth) {
                reply.status(401).send({
                    error: {
                        type: 'AuthenticationError',
                        title: 'SUPABASE_JWT_SECRET is not configured — cannot verify JWTs',
                        status: 401,
                    },
                });
                return;
            }
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
            return;
        }

        const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
        request.user = {
            id: decoded.sub || '',
            email: decoded.email as string | undefined,
            role: (decoded.role as string) || 'authenticated',
        };
        request.authMethod = 'supabase-jwt';
    } catch {
        reply.status(401).send({
            error: {
                type: 'AuthenticationError',
                title: 'Invalid or expired token',
                status: 401,
            },
        });
    }
}

/**
 * Optional auth — sets request.user if a valid token is present.
 * Does NOT reject unauthenticated requests; the route handler decides what to do.
 */
export async function optionalAuth(
    request: FastifyRequest,
    _reply: FastifyReply
): Promise<void> {
    if (!request.headers.authorization) {
        if (!requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
        }
        return;
    }

    try {
        const token = request.headers.authorization.slice(7);

        const devToken = process.env.DEV_AUTH_TOKEN;
        if (!requireAuth && devToken && token === devToken) {
            request.user = DEV_USER;
            request.authMethod = 'dev-token';
            return;
        }

        const secret = config.supabase?.jwtSecret;
        if (secret) {
            const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
            request.user = {
                id: decoded.sub || '',
                email: decoded.email as string | undefined,
                role: (decoded.role as string) || 'authenticated',
            };
            request.authMethod = 'supabase-jwt';
        }
    } catch {
        if (!requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
        }
    }
}
