/**
 * Mapai Backend — Configuration
 * Loads and validates environment variables.
 */

import 'dotenv/config';
import { requireEnv, optionalEnv } from './lib/env.js';

const nodeEnv = optionalEnv('NODE_ENV', 'development');
const isDev = nodeEnv === 'development';

/** Allowed CORS origins. Parsed from comma-separated CORS_ORIGIN env var. */
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:8081'];
const PRODUCTION_ORIGINS = ['https://mapai.app', 'https://www.mapai.app'];

function parseCorsOrigins(): string[] {
    const raw = process.env.CORS_ORIGIN;
    if (!raw) return isDev ? DEFAULT_ORIGINS : PRODUCTION_ORIGINS;
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

export const config = {
    // Server
    port: parseInt(optionalEnv('PORT', '3001'), 10),
    host: optionalEnv('HOST', '0.0.0.0'),
    nodeEnv,
    isDev,

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
        jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    },

    // LLM Provider: 'gemini' or 'anthropic'
    llmProvider: optionalEnv('LLM_PROVIDER', 'gemini') as 'gemini' | 'anthropic',

    // Anthropic Claude
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: optionalEnv('CLAUDE_MODEL', 'claude-sonnet-4-5-20250514'),
    },

    // Google Gemini
    gemini: {
        apiKey: process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '',
        model: optionalEnv('GEMINI_MODEL', 'gemini-2.0-flash'),
    },

    // Google Places
    google: {
        placesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
    },

    // Redis
    redis: {
        url: process.env.REDIS_URL || '',
    },

    // CORS
    corsOrigins: parseCorsOrigins(),
} as const;

// Validate required config on startup
export function validateConfig(): string[] {
    const warnings: string[] = [];
    if (!process.env.NODE_ENV) {
        warnings.push('NODE_ENV not set — defaulting to development. Set NODE_ENV=production for all deployments.');
    }
    if (!config.anthropic.apiKey) warnings.push('ANTHROPIC_API_KEY not set');
    if (!config.google.placesApiKey) warnings.push('GOOGLE_PLACES_API_KEY not set');
    if (!config.supabase.url) warnings.push('SUPABASE_URL not set — auth disabled');
    if (!config.redis.url) warnings.push('REDIS_URL not set — using in-memory cache');

    // In production, enforce critical secrets
    if (!isDev) {
        if (!config.supabase.jwtSecret) warnings.push('CRITICAL: SUPABASE_JWT_SECRET not set in production');
        if (!config.anthropic.apiKey) warnings.push('CRITICAL: ANTHROPIC_API_KEY not set in production');
    }

    return warnings;
}
