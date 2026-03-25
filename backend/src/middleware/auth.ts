/**
 * Mapai Backend — JWT Auth Middleware
 * Validates Clerk JWTs on protected routes.
 * Falls back to dev user when Clerk is not configured.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthUser {
    id: string;
    email?: string;
    role: string;
}

declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthUser;
    }
}

const DEV_USER: AuthUser = {
    id: 'dev-user-001',
    email: 'dev@mapai.app',
    role: 'authenticated',
};

/**
 * Authentication hook — attach to routes that need a logged-in user.
 * Supports: Clerk JWTs, Supabase JWTs (legacy), and dev tokens.
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

    // Dev token shortcut
    if (process.env.NODE_ENV !== 'production' && token === 'dev-token-secret') {
        request.user = DEV_USER;
        return;
    }

    // Strategy 1: Verify Clerk JWT using Clerk's JWKS (preferred)
    // Clerk JWTs have an 'azp' claim and 'sub' starts with 'user_'
    try {
        // Try Clerk verification via their SDK
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
            return;
        }
    } catch {
        // Fall through to manual JWT verification
    }

    // Strategy 2: Verify JWT manually (Supabase JWT secret or Clerk PEM)
    try {
        const secret = config.supabase?.jwtSecret;
        if (!secret) {
            if (process.env.NODE_ENV !== 'production') {
                request.user = DEV_USER;
                return;
            }
            throw new Error('No JWT secret configured');
        }

        const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
        request.user = {
            id: decoded.sub || '',
            email: decoded.email as string | undefined,
            role: (decoded.role as string) || 'authenticated',
        };
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

    try {
        const token = request.headers.authorization.slice(7);

        if (process.env.NODE_ENV !== 'production' && token === 'dev-token-secret') {
            request.user = DEV_USER;
            return;
        }

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
        }
    } catch {
        if (process.env.NODE_ENV !== 'production') {
            request.user = DEV_USER;
        }
    }
}
