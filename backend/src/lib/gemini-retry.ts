/**
 * Mapai Backend — Gemini multi-model retry / waterfall
 *
 * Attempts models in the configured priority order with per-attempt
 * exponential-backoff retries. A new model is only tried when the current one
 * fails for a transient reason (429, 500, 503, timeout, RESOURCE_EXHAUSTED,
 * DEADLINE_EXCEEDED). Auth errors (401/403) are thrown immediately as
 * GeminiAuthError — they are never retried and must never trigger a
 * provider-level fallback.
 *
 * Timeout is managed here (not in the caller) so every attempt — across all
 * models — gets an equal, independently-reset budget.
 */

import type { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Thrown when Gemini returns 401 or 403.
 *
 * The caller must NOT retry or fall back to another Gemini model — the API key
 * or project permissions are invalid regardless of which model is used.
 * Provider-level fallback code must catch this and surface a clean error
 * instead of attempting another provider with the same (Gemini) key.
 */
export class GeminiAuthError extends Error {
    readonly isAuthError = true;
    constructor(
        message: string,
        public readonly status: number,
        public readonly model: string,
    ) {
        super(message);
        this.name = 'GeminiAuthError';
    }
}

/**
 * Per-call overrides — all fields are optional; unset fields fall back to the
 * values in config.gemini.
 */
export interface GeminiRetryConfig {
    /** Ordered list of models to attempt. */
    models?: string[];
    /** Per-attempt timeout in ms (each retry gets a fresh budget). */
    timeoutMs?: number;
    /** Maximum attempts per model before moving to the next one. */
    maxRetriesPerModel?: number;
    /** Starting backoff delay in ms. */
    initialDelayMs?: number;
    /** Backoff cap in ms. */
    maxDelayMs?: number;
}

/**
 * Callback invoked for each attempt.
 *
 * `signal` is a per-attempt AbortSignal — pass it to the Gemini SDK call so
 * the underlying HTTP request is cancelled when the timeout fires. The signal
 * is automatically aborted if the per-attempt timeout elapses.
 */
export type GeminiCall<T> = (
    client: GoogleGenerativeAI,
    modelName: string,
    signal: AbortSignal,
) => Promise<T>;

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Run `call` against each model in the priority list, retrying transient
 * errors within each model before falling through to the next.
 *
 * Returns the first successful result.
 * Throws GeminiAuthError immediately on 401/403 (no further models tried).
 * Throws the last transient error if all models are exhausted.
 */
export async function withGeminiRetry<T>(
    client: GoogleGenerativeAI,
    call: GeminiCall<T>,
    overrides: GeminiRetryConfig = {},
): Promise<T> {
    const models      = overrides.models            ?? [...config.gemini.models];
    const timeoutMs   = overrides.timeoutMs         ?? config.gemini.timeoutMs;
    const maxRetries  = overrides.maxRetriesPerModel ?? config.gemini.maxRetriesPerModel;
    const initialDelay = overrides.initialDelayMs   ?? 500;
    const maxDelay     = overrides.maxDelayMs        ?? 8_000;

    const opts: ModelRunOptions = { maxRetries, timeoutMs, initialDelay, maxDelay };

    let lastErr: unknown;

    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const result = await tryModel(client, call, model, opts);

        if (result.ok) return result.value;

        lastErr = result.error;

        // Auth and invalid-request errors must not be forwarded to another model
        if (result.errorClass === 'auth' || result.errorClass === 'invalid_request') {
            throw result.error;
        }

        const nextModel = models[i + 1];
        if (nextModel) {
            console.warn(`[Gemini] Waterfall: exhausted ${model} (${result.errorClass}) → trying ${nextModel}`);
        }
    }

    throw lastErr;
}

// ─── Internal ────────────────────────────────────────────────────────────────

interface ModelRunOptions {
    maxRetries: number;
    timeoutMs: number;
    initialDelay: number;
    maxDelay: number;
}

type ErrorClass = 'auth' | 'invalid_request' | 'timeout' | 'transient' | 'unknown';

type ModelResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: unknown; errorClass: ErrorClass };

async function tryModel<T>(
    client: GoogleGenerativeAI,
    call: GeminiCall<T>,
    model: string,
    opts: ModelRunOptions,
): Promise<ModelResult<T>> {
    let lastErr: unknown;
    let lastClass: ErrorClass = 'unknown';

    for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
        const attemptStart = Date.now();
        const controller = new AbortController();

        // Single timeout handle that both aborts the signal AND rejects the race
        let timeoutHandle: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                controller.abort();
                reject(new Error(`Gemini request timed out after ${opts.timeoutMs}ms`));
            }, opts.timeoutMs);
        });

        try {
            const value = await Promise.race([
                call(client, model, controller.signal),
                timeoutPromise,
            ]);
            clearTimeout(timeoutHandle!);
            const elapsed = Date.now() - attemptStart;
            console.log(`[Gemini] ${model} attempt ${attempt + 1}/${opts.maxRetries} OK in ${elapsed}ms`);
            return { ok: true, value };

        } catch (e) {
            clearTimeout(timeoutHandle!);
            lastErr = e;
            const cls = classifyError(e);
            lastClass = cls;
            const elapsed = Date.now() - attemptStart;
            const status = statusOf(e);

            if (cls === 'auth') {
                console.error(
                    `[Gemini] ${model} AUTH ERROR (${status}) after ${elapsed}ms: ${messageOf(e)}` +
                    ` — failing fast, no retry, no model fallback`,
                );
                return {
                    ok: false,
                    error: new GeminiAuthError(messageOf(e), Number(status), model),
                    errorClass: 'auth',
                };
            }

            if (cls === 'invalid_request') {
                console.error(
                    `[Gemini] ${model} INVALID REQUEST (${status}) after ${elapsed}ms: ${messageOf(e)}` +
                    ` — failing fast`,
                );
                return { ok: false, error: e, errorClass: 'invalid_request' };
            }

            if (cls === 'timeout') {
                console.warn(
                    `[Gemini] ${model} attempt ${attempt + 1}/${opts.maxRetries} TIMED OUT` +
                    ` after ${elapsed}ms — skipping remaining retries for this model`,
                );
                return { ok: false, error: e, errorClass: 'timeout' };
            }

            const isLastAttempt = attempt === opts.maxRetries - 1;
            if (isLastAttempt) {
                console.warn(
                    `[Gemini] ${model} attempt ${attempt + 1}/${opts.maxRetries} failed` +
                    ` (${cls}, status=${status}) after ${elapsed}ms: ${messageOf(e)}` +
                    ` — model exhausted`,
                );
            } else {
                const delay = jitteredDelay(attempt, opts.initialDelay, opts.maxDelay);
                console.warn(
                    `[Gemini] ${model} attempt ${attempt + 1}/${opts.maxRetries} failed` +
                    ` (${cls}, status=${status}) after ${elapsed}ms: ${messageOf(e)}` +
                    ` — retrying in ${delay}ms`,
                );
                await sleep(delay);
            }
        }
    }

    return { ok: false, error: lastErr, errorClass: lastClass };
}

// ─── Error classification ─────────────────────────────────────────────────────

function classifyError(e: unknown): ErrorClass {
    const status = Number(statusOf(e));
    const msg = messageOf(e);

    // Explicit HTTP status codes take priority
    if (status === 401 || status === 403) return 'auth';
    if (status === 400) return 'invalid_request';
    if ([429, 500, 502, 503, 504].includes(status)) return 'transient';

    // Network-level codes that indicate transient connectivity issues
    const code = (e as { code?: string }).code;
    if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND') return 'transient';

    // Our own timeout message (from the race above) or an SDK AbortError
    if (/timed out after/i.test(msg)) return 'timeout';
    if ((e as { name?: string }).name === 'AbortError') return 'timeout';

    // Gemini API error messages (no numeric status available)
    if (/resource_exhausted|overloaded|unavailable|deadline_exceeded/i.test(msg)) return 'transient';
    if (/quota|rate.?limit/i.test(msg)) return 'transient';
    if (/\b(503|429|500|502|504)\b/.test(msg)) return 'transient';

    // Invalid-request signals in error message text
    if (/invalid.?(request|argument|parameter|key)|malformed|bad.?request/i.test(msg)) {
        return 'invalid_request';
    }

    // Auth signals in error message text (when no numeric status is present)
    if (/unauthorized|forbidden|permission.?denied|invalid.?api.?key|api.?key.?not.?valid/i.test(msg)) {
        return 'auth';
    }

    return 'unknown';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function statusOf(e: unknown): number | string {
    const any = e as { status?: number; response?: { status?: number }; code?: string | number };
    return any?.status ?? any?.response?.status ?? any?.code ?? 'unknown';
}

function messageOf(e: unknown): string {
    return (e as { message?: string })?.message ?? String(e);
}

function jitteredDelay(attempt: number, initial: number, max: number): number {
    const base = Math.min(initial * Math.pow(2, attempt), max);
    const jitter = Math.floor(Math.random() * base * 0.25);
    return base + jitter;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
