/**
 * Mapai Backend — JWT Auth Middleware
 * Validates Clerk JWTs on protected routes.
 *
 * Dev-user fallbacks are ONLY active when:
 *   - NODE_ENV === 'development'  (isDev)
 *   - REQUIRE_AUTH is not set to 'true'  (!requireAuth)
 *
 * Set REQUIRE_AUTH=true to test production-style auth in a local or staging env.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config, isDev, requireAuth } from '../config.js';

export interface AuthUser {
    id: string;
    email?: string;
    role: string;
}

/**
 * How the current request was authenticated.
 * Included on every authenticated request for audit logging.
 *
 *  'clerk-jwt'    — Clerk SDK verified the Bearer token
 *  'supabase-jwt' — Manual JWT verification against SUPABASE_JWT_SECRET
 *  'dev-token'    — Matched DEV_AUTH_TOKEN (dev/test environments only)
 *  'dev-user'     — No token present; synthetic dev user injected (dev only)
 */
export type AuthMethod = 'clerk-jwt' | 'supabase-jwt' | 'dev-token' | 'dev-user';

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

// Log the auth mode once at startup so developers always know the posture.
if (isDev && !requireAuth) {
    console.warn(
        '[Auth] Running in PERMISSIVE DEV mode — unauthenticated requests will receive a synthetic dev user. ' +
        'Remove SKIP_AUTH=true to test production auth locally.'
    );
} else {
    console.info('[Auth] Auth ENFORCED — all requests require a valid JWT.');
}

/**
 * Authentication hook — attach to routes that need a logged-in user.
 * Supports: Clerk JWTs, Supabase JWTs (legacy), and dev tokens.
 */
export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // No Authorization header present.
    // In permissive dev mode: synthesise a dev user so local development works
    // without any auth infrastructure.
    // In production / REQUIRE_AUTH mode: reject immediately.
    if (!request.headers.authorization) {
        if (isDev && !requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
            return;
        }
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
    // This intentionally does NOT work when REQUIRE_AUTH=true, even in development.
    const devToken = process.env.DEV_AUTH_TOKEN;
    if (!requireAuth && devToken && token === devToken) {
        request.user = DEV_USER;
        request.authMethod = 'dev-token';
        return;
    }

    // Strategy 1: Verify Clerk JWT using Clerk's JWKS (preferred)
    try {
        const clerkSecretKey = process.env.CLERK_SECRET_KEY;
        if (clerkSecretKey) {
            const { createClerkClient } = await import('@clerk/clerk-sdk-node');
            const clerk = createClerkClient({ secretKey: clerkSecretKey });
            const decoded = await clerk.verifyToken(token);
            request.user = {
                id: decoded.sub,
                email: (decoded as any).email,
                role: 'authenticated',
            };
            request.authMethod = 'clerk-jwt';
            return;
        }
    } catch {
        // Fall through to manual JWT verification
    }

    // Strategy 2: Verify JWT manually (Supabase JWT secret or Clerk PEM)
    try {
        const secret = config.supabase?.jwtSecret;

        if (!secret) {
            // No secret available — decide based on auth posture.
            if (requireAuth) {
                // Production or explicit REQUIRE_AUTH: never allow silent fallback.
                reply.status(401).send({
                    error: {
                        type: 'AuthenticationError',
                        title: 'Authentication service not configured',
                        status: 401,
                    },
                });
                return;
            }
            // Permissive dev mode: synthesise dev user.
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
 * Does NOT reject unauthenticated requests; the route handler decides what to do
 * with an absent user.
 *
 * Dev-user injection follows the same requireAuth gating as authMiddleware.
 */
export async function optionalAuth(
    request: FastifyRequest,
    _reply: FastifyReply
): Promise<void> {
    // No Authorization header.
    if (!request.headers.authorization) {
        if (isDev && !requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
        }
        // In production / REQUIRE_AUTH: leave request.user undefined — caller handles it.
        return;
    }

    try {
        const token = request.headers.authorization.slice(7);

        // Dev token shortcut (permissive dev mode only)
        const devToken = process.env.DEV_AUTH_TOKEN;
        if (!requireAuth && devToken && token === devToken) {
            request.user = DEV_USER;
            request.authMethod = 'dev-token';
            return;
        }

        // Strategy 1: Clerk SDK
        const clerkSecretKey = process.env.CLERK_SECRET_KEY;
        if (clerkSecretKey) {
            const { createClerkClient } = await import('@clerk/clerk-sdk-node');
            const clerk = createClerkClient({ secretKey: clerkSecretKey });
            const decoded = await clerk.verifyToken(token);
            request.user = {
                id: decoded.sub,
                email: (decoded as any).email,
                role: 'authenticated',
            };
            request.authMethod = 'clerk-jwt';
            return;
        }

        // Strategy 2: Supabase JWT
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
        // Verification failed.  In permissive dev mode, fall back to dev user so
        // local development stays frictionless.  In production / REQUIRE_AUTH, leave
        // request.user undefined — the route handler decides whether to proceed.
        if (isDev && !requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
        }
    }
}
