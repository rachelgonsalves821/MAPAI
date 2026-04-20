/**
 * Mapai Backend — Gemini call retry wrapper
 *
 * Wraps a Gemini SDK call with:
 *  - Exponential backoff + jitter on transient errors (429/500/502/503/504,
 *    network errors, "overloaded"/"UNAVAILABLE" messages).
 *  - A model-level fallback: if config.gemini.fallbackModel is set and the
 *    primary model is still erroring after all attempts, the callback is
 *    re-run against the fallback model with a fresh attempt budget.
 *
 * The provider-level Gemini → Claude fallback already exists in
 * ai-orchestrator.processMessage; this helper sits underneath it so a single
 * 503 doesn't force us out of Gemini entirely.
 */

import type { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

export type GeminiCall<T> = (
    client: GoogleGenerativeAI,
    modelName: string
) => Promise<T>;

export interface RetryOptions {
    attempts?: number;       // default 3
    initialDelayMs?: number; // default 500
    maxDelayMs?: number;     // default 4000
}

export async function withGeminiRetry<T>(
    client: GoogleGenerativeAI,
    call: GeminiCall<T>,
    options: RetryOptions = {}
): Promise<T> {
    const attempts = options.attempts ?? 3;
    const initial = options.initialDelayMs ?? 500;
    const max = options.maxDelayMs ?? 4000;

    const runWithModel = async (modelName: string): Promise<T> => {
        let lastErr: unknown;
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                return await call(client, modelName);
            } catch (e) {
                lastErr = e;
                const retryable = isRetryable(e);
                if (!retryable || attempt === attempts - 1) throw e;
                const base = Math.min(initial * Math.pow(2, attempt), max);
                const jitter = Math.floor(Math.random() * base * 0.25);
                const delay = base + jitter;
                console.warn(
                    `[Gemini] ${modelName} attempt ${attempt + 1}/${attempts} failed ` +
                    `(status=${statusOf(e)}): ${messageOf(e)}; retrying in ${delay}ms`
                );
                await sleep(delay);
            }
        }
        throw lastErr;
    };

    const primary = config.gemini.model;
    const fallback = config.gemini.fallbackModel;

    try {
        return await runWithModel(primary);
    } catch (primaryErr) {
        if (fallback && fallback !== primary && isRetryable(primaryErr)) {
            console.warn(
                `[Gemini] Primary model ${primary} exhausted; falling back to ${fallback}`
            );
            return await runWithModel(fallback);
        }
        throw primaryErr;
    }
}

function statusOf(e: unknown): number | string {
    const any = e as { status?: number; response?: { status?: number }; code?: string | number };
    return any?.status ?? any?.response?.status ?? any?.code ?? 'unknown';
}

function messageOf(e: unknown): string {
    const any = e as { message?: string };
    return any?.message ?? String(e);
}

/**
 * A transient error worth retrying. Explicit timeouts are NOT considered
 * retryable — retrying a slow call compounds latency and the provider-level
 * fallback in ai-orchestrator handles sustained outages.
 */
function isRetryable(e: unknown): boolean {
    const status = Number(statusOf(e));
    if ([429, 500, 502, 503, 504].includes(status)) return true;

    const code = (e as { code?: string }).code;
    if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND') {
        return true;
    }

    const msg = messageOf(e);
    if (/timed out after/i.test(msg)) return false;
    if (/\b(503|429|500|overloaded|unavailable|resource_exhausted)\b/i.test(msg)) {
        return true;
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
