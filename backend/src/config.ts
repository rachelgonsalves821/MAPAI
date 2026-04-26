/**
 * Mapai Backend — Configuration
 * Loads and validates environment variables.
 */

import 'dotenv/config';
import { requireEnv, optionalEnv } from './lib/env.js';

const nodeEnv = process.env.NODE_ENV || '';

/**
 * Build the ordered Gemini model priority list.
 *
 * Resolution order:
 *  1. GEMINI_MODELS=model1,model2,model3  (explicit multi-model list)
 *  2. GEMINI_MODEL + optional GEMINI_FALLBACK_MODEL  (legacy single/dual vars)
 *  3. Built-in default: gemini-2.5-flash-lite
 */
function parseGeminiModels(): string[] {
    const explicit = process.env.GEMINI_MODELS;
    if (explicit) {
        const list = explicit.split(',').map((m) => m.trim()).filter(Boolean);
        if (list.length > 0) return list;
    }
    const primary = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const fallback = process.env.GEMINI_FALLBACK_MODEL || '';
    const models = [primary];
    if (fallback && fallback !== primary) models.push(fallback);
    return models;
}

/**
 * True only when NODE_ENV is explicitly set to 'development'.
 * If NODE_ENV is missing, we default to secure (NOT dev).
 */
export const isDev = nodeEnv === 'development';

/**
 * Auth is bypassed when SKIP_AUTH=true is set explicitly.
 * Works regardless of NODE_ENV so it can be used on deployed environments
 * (e.g. Vercel) without switching NODE_ENV to development.
 */
export const requireAuth = process.env.SKIP_AUTH !== 'true';

/** Allowed CORS origins. Parsed from comma-separated CORS_ORIGIN env var. */
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:8090'];
const PRODUCTION_ORIGINS = [
    'https://mapai.app',
    'https://www.mapai.app',
    'https://mapai-api.fly.dev',
    'https://mapai-three.vercel.app', // Vercel web deployment
    'exp://',                    // Expo Go deep links
    'https://*.expo.dev',        // EAS Update
];

function parseCorsOrigins(): string[] {
    const raw = process.env.CORS_ORIGIN;
    if (!raw) return isDev ? DEFAULT_ORIGINS : PRODUCTION_ORIGINS;
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Startup diagnostics — logged once when the module is first imported.
// These lines appear in Vercel Function Logs and make it immediately obvious
// which environment variables are missing, without exposing secret values.
// ---------------------------------------------------------------------------
const _missingVars: string[] = [];
if (!process.env.SUPABASE_URL)            _missingVars.push('SUPABASE_URL');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) _missingVars.push('SUPABASE_SERVICE_ROLE_KEY');
if (!process.env.GOOGLE_GEMINI_API_KEY)   _missingVars.push('GOOGLE_GEMINI_API_KEY');
if (!process.env.GOOGLE_PLACES_API_KEY)   _missingVars.push('GOOGLE_PLACES_API_KEY');
if (_missingVars.length > 0) {
    console.error(
        `[Config] ⚠️  Missing environment variables: ${_missingVars.join(', ')}\n` +
        '         Add these to Vercel Project Settings → Environment Variables and redeploy.'
    );
} else {
    console.info('[Config] All required environment variables are set.');
}

export const config = {
    // Server
    port: parseInt(optionalEnv('PORT', '3001'), 10),
    host: optionalEnv('HOST', '0.0.0.0'),
    nodeEnv,
    isDev,
    requireAuth,

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
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
        apiKey: process.env.GOOGLE_GEMINI_API_KEY || '',
        // Ordered model priority list. The retry layer attempts each model in
        // sequence; the next is only tried when the current one fails for a
        // transient reason (429, 503, timeout, RESOURCE_EXHAUSTED, etc.).
        // Configure via GEMINI_MODELS=model1,model2 or legacy GEMINI_MODEL +
        // GEMINI_FALLBACK_MODEL.
        models: parseGeminiModels(),
        // Per-attempt timeout in ms. Each retry and each model gets this full
        // budget — a single slow response does not consume the budget for the
        // next model. Increase for Pro-class models if needed.
        timeoutMs: parseInt(optionalEnv('GEMINI_TIMEOUT_MS', '30000'), 10),
        // How many times to retry a single model before moving to the next one.
        // Keep low (2) so we fail over quickly on sustained capacity issues.
        maxRetriesPerModel: parseInt(optionalEnv('GEMINI_MAX_RETRIES_PER_MODEL', '2'), 10),
        // Set GEMINI_ENABLE_FALLBACK_PROVIDER=false to disable falling back to
        // non-Gemini providers after all Gemini models are exhausted.
        enableFallbackProvider: optionalEnv('GEMINI_ENABLE_FALLBACK_PROVIDER', 'true') !== 'false',
    },

    // Google Places
    google: {
        placesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
    },

    // Redis
    redis: {
        url: process.env.REDIS_URL || '',
    },

    // QR Code Signing
    qrSigningSecret: process.env.QR_SIGNING_SECRET || '',

    // CORS
    corsOrigins: parseCorsOrigins(),
} as const;

export interface ConfigValidationResult {
    warnings: string[];
    criticalErrors: string[];
}

/**
 * Validates the runtime configuration.
 *
 * Returns two lists:
 *  - `warnings`:      non-fatal issues (logged, server still starts)
 *  - `criticalErrors`: fatal issues in production (server must NOT start)
 *
 * Callers are responsible for calling process.exit(1) when criticalErrors
 * is non-empty in a production-like environment.
 */
export function validateConfig(): ConfigValidationResult {
    const warnings: string[] = [];
    const criticalErrors: string[] = [];

    if (!process.env.NODE_ENV) {
        warnings.push('NODE_ENV not set — auth is enforced by default. Set NODE_ENV=development and SKIP_AUTH=true for local dev without auth.');
    }

    if (!config.anthropic.apiKey) warnings.push('ANTHROPIC_API_KEY not set');
    if (!config.gemini.apiKey && config.llmProvider === 'gemini') warnings.push('GOOGLE_GEMINI_API_KEY not set — chat will fail (LLM_PROVIDER=gemini)');
    if (!config.google.placesApiKey) warnings.push('GOOGLE_PLACES_API_KEY not set');
    if (!config.supabase.url) warnings.push('SUPABASE_URL not set — auth disabled');
    if (!config.redis.url) warnings.push('REDIS_URL not set — using in-memory cache');

    // QR signing secret
    if (!isDev && !config.qrSigningSecret) {
        criticalErrors.push('CRITICAL: QR_SIGNING_SECRET not set — QR code check-ins cannot be validated in production');
    }
    if (isDev && !config.qrSigningSecret) {
        warnings.push('QR_SIGNING_SECRET not set — using built-in dev fallback (not safe for production)');
    }

    // Critical secrets — fatal in any non-dev environment
    if (!isDev) {
        if (!config.supabase.url) {
            criticalErrors.push('CRITICAL: SUPABASE_URL not set — cannot fetch JWKS to verify JWTs in production');
        }
        if (!config.anthropic.apiKey && config.llmProvider === 'anthropic') {
            criticalErrors.push('CRITICAL: ANTHROPIC_API_KEY not set but LLM_PROVIDER=anthropic');
        }
    }

    return { warnings, criticalErrors };
}
