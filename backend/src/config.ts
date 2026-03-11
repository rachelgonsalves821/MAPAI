/**
 * Mapai Backend — Configuration
 * Loads and validates environment variables.
 */

import 'dotenv/config';

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    isDev: (process.env.NODE_ENV || 'development') === 'development',

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
        jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    },

    // Anthropic Claude
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250514',
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
    corsOrigin: process.env.CORS_ORIGIN || '*',
} as const;

// Validate required config on startup
export function validateConfig(): string[] {
    const warnings: string[] = [];
    if (!config.anthropic.apiKey) warnings.push('ANTHROPIC_API_KEY not set');
    if (!config.google.placesApiKey) warnings.push('GOOGLE_PLACES_API_KEY not set');
    if (!config.supabase.url) warnings.push('SUPABASE_URL not set — auth disabled');
    if (!config.redis.url) warnings.push('REDIS_URL not set — using in-memory cache');
    return warnings;
}
