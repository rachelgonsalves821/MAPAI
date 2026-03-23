/**
 * Mapai Backend — JWT Auth Middleware
 * Validates Supabase JWT tokens on protected routes.
 * Falls back to dev user when Supabase is not configured.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

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
    // Non-production + no auth header: use test user
    if (process.env.NODE_ENV !== 'production' && !request.headers.authorization) {
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

    // Strategy 1: Verify with Supabase client (preferred)
    if (hasDatabase()) {
        try {
            const supabase = getSupabase()!;
            // Use Supabase's getUser to verify the token server-side
            const { data, error } = await supabase.auth.getUser(token);
            if (error || !data.user) {
                throw new Error(error?.message || 'Invalid token');
            }
            request.user = {
                id: data.user.id,
                email: data.user.email,
                role: data.user.role || 'authenticated',
            };
            return;
        } catch {
            // Fall through to JWT secret verification
        }
    }

    // Strategy 2: Verify JWT manually with secret
    try {
        if (!config.supabase.jwtSecret) {
            if (process.env.NODE_ENV !== 'production') {
                request.user = DEV_USER;
                return;
            }
            throw new Error('JWT secret not configured — set SUPABASE_JWT_SECRET in production');
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

/**
 * Optional auth — sets user if token present but doesn't reject unauthenticated.
 */
export async function optionalAuth(
    request: FastifyRequest,
    _reply: FastifyReply
): Promise<void> {
    if (!request.headers.authorization) {
        if (process.env.NODE_ENV !== 'production') {
            request.user = DEV_USER;
        }
        return;
    }

    // Try to authenticate, but don't fail the request
    try {
        const token = request.headers.authorization.slice(7);

        if (hasDatabase()) {
            const supabase = getSupabase()!;
            const { data } = await supabase.auth.getUser(token);
            if (data.user) {
                request.user = {
                    id: data.user.id,
                    email: data.user.email,
                    role: data.user.role || 'authenticated',
                };
                return;
            }
        }

        if (config.supabase.jwtSecret) {
            const decoded = jwt.verify(token, config.supabase.jwtSecret) as jwt.JwtPayload;
            request.user = {
                id: decoded.sub || '',
                email: decoded.email as string | undefined,
                role: (decoded.role as string) || 'authenticated',
            };
        }
    } catch {
        // Silently fail — user just won't be authenticated
        if (process.env.NODE_ENV !== 'production') {
            request.user = DEV_USER;
        }
    }
}
