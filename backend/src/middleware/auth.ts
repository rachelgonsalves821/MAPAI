/**
 * Mapai Backend — JWT Auth Middleware
 * Validates Supabase JWTs on protected routes.
 *
 * Supabase projects sign JWTs with ES256 (ECC P-256). Verification is done
 * against the project's JWKS discovery endpoint
 * (${SUPABASE_URL}/auth/v1/.well-known/jwks.json) using jose's
 * createRemoteJWKSet, which handles key caching + rotation.
 *
 * Dev-user fallbacks are ONLY active when:
 *   - SKIP_AUTH=true  (!requireAuth)
 *
 * Set SKIP_AUTH=false (or leave unset) to enforce production auth.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config, requireAuth } from '../config.js';

export interface AuthUser {
    id: string;
    email?: string;
    role: string;
}

/**
 * How the current request was authenticated.
 *
 *  'supabase-jwt' — Verified against Supabase JWKS (ES256)
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

// ---------------------------------------------------------------------------
// JWKS — built once at module load. jose caches the keys and refreshes on
// rotation automatically, so subsequent verifications are in-memory.
// ---------------------------------------------------------------------------
const supabaseUrl = config.supabase?.url?.replace(/\/$/, '') || '';
const JWKS_URL = supabaseUrl
    ? `${supabaseUrl}/auth/v1/.well-known/jwks.json`
    : '';
const JWKS = JWKS_URL ? createRemoteJWKSet(new URL(JWKS_URL)) : null;
const EXPECTED_ISSUER = supabaseUrl ? `${supabaseUrl}/auth/v1` : '';
const EXPECTED_AUDIENCE = 'authenticated';

if (!requireAuth) {
    console.warn(
        '[Auth] Running in PERMISSIVE mode (SKIP_AUTH=true) — unauthenticated requests will receive a synthetic dev user.'
    );
} else if (!JWKS) {
    console.error(
        '[Auth] SUPABASE_URL not set — JWKS verification is disabled and all authenticated routes will 401.'
    );
} else {
    console.info(`[Auth] Auth ENFORCED — verifying ES256 JWTs against ${JWKS_URL}`);
}

async function verifySupabaseJwt(token: string): Promise<AuthUser> {
    if (!JWKS) throw new Error('SUPABASE_URL not configured');
    const { payload } = await jwtVerify(token, JWKS, {
        algorithms: ['ES256'],
        issuer: EXPECTED_ISSUER,
        audience: EXPECTED_AUDIENCE,
    });
    return {
        id: (payload.sub as string) || '',
        email: payload.email as string | undefined,
        role: (payload.role as string) || 'authenticated',
    };
}

/**
 * Authentication hook — attach to routes that need a logged-in user.
 * Verifies Supabase JWTs via the project's JWKS endpoint (ES256).
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

    try {
        request.user = await verifySupabaseJwt(token);
        request.authMethod = 'supabase-jwt';
    } catch (e) {
        const message = (e as Error).message;
        console.warn('[Auth] JWT verify failed on', request.url, '-', message);
        if (!requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
            return;
        }
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

        request.user = await verifySupabaseJwt(token);
        request.authMethod = 'supabase-jwt';
    } catch {
        if (!requireAuth) {
            request.user = DEV_USER;
            request.authMethod = 'dev-user';
        }
    }
}
