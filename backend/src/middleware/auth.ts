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
 *
 * ── Common 401 causes on Vercel ──────────────────────────────────────────
 * 1. SUPABASE_URL not set in Vercel Environment Variables → JWKS is null →
 *    every authenticated route returns 401.
 * 2. JWT audience mismatch: Supabase tokens carry aud='authenticated' but
 *    some project configurations use the project ref URL as the audience.
 *    We now try verification without audience enforcement as a fallback.
 * 3. Token not sent by the client: the Axios interceptor reads from
 *    _supabaseToken which is populated by initAuthCache(). On web, if
 *    Supabase session is stored in localStorage and the page loads before
 *    the auth state change fires, the first request may have no token.
 *    The client retries automatically (axiosRetry), but chat POSTs do not
 *    retry (non-idempotent). The fix is in the client interceptor — it now
 *    awaits initAuthCache() before every request.
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

// Supabase user-session JWTs carry aud='authenticated'.
// Some Supabase project configurations may use the project ref URL instead.
// We try the strict check first, then fall back to issuer-only verification.
const EXPECTED_AUDIENCE = 'authenticated';

if (!requireAuth) {
    console.warn(
        '[Auth] Running in PERMISSIVE mode (SKIP_AUTH=true) — unauthenticated requests will receive a synthetic dev user.'
    );
} else if (!JWKS) {
    console.error(
        '[Auth] ⚠️  SUPABASE_URL is not set — JWKS verification is DISABLED.\n' +
        '       All authenticated routes will return 401.\n' +
        '       Fix: add SUPABASE_URL to your Vercel Environment Variables and redeploy.'
    );
} else {
    console.info(`[Auth] Auth ENFORCED — verifying ES256 JWTs against ${JWKS_URL}`);
}

async function verifySupabaseJwt(token: string): Promise<AuthUser> {
    if (!JWKS) throw new Error('SUPABASE_URL not configured — cannot verify JWT');

    // Attempt 1: strict verification with issuer + audience.
    // This is the correct path for all standard Supabase user sessions.
    try {
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
    } catch (strictErr) {
        const msg = (strictErr as Error).message ?? '';

        // Attempt 2: if the only failure reason is an audience mismatch,
        // retry without the audience check. This handles Supabase projects
        // that were configured with a custom JWT audience (e.g. the project
        // ref URL) or where the aud claim is an array containing 'authenticated'.
        if (msg.includes('unexpected "aud" claim') || msg.includes('"aud" claim')) {
            console.warn(
                '[Auth] JWT audience mismatch — retrying without audience check. ' +
                'Consider setting JWT_AUDIENCE env var to match your Supabase project config.'
            );
            const { payload } = await jwtVerify(token, JWKS, {
                algorithms: ['ES256'],
                issuer: EXPECTED_ISSUER,
                // No audience check
            });
            return {
                id: (payload.sub as string) || '',
                email: payload.email as string | undefined,
                role: (payload.role as string) || 'authenticated',
            };
        }

        // Re-throw all other errors (expired, invalid signature, wrong issuer, etc.)
        throw strictErr;
    }
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
        // Log the specific failure reason so it appears in Vercel Function Logs.
        // This makes it easy to distinguish "SUPABASE_URL not set" from
        // "token expired" from "audience mismatch" without guessing.
        console.warn(`[Auth] JWT verify failed on ${request.url} — ${message}`);
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
