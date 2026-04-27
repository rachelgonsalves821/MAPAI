/**
 * Unit tests for the Gemini multi-model retry / waterfall (gemini-retry.ts).
 *
 * Strategy: mock config to use three short model names and zero/tiny backoff
 * delays so tests are fast without fake timers. Real setTimeout is used so
 * async/await works naturally.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { withGeminiRetry, GeminiAuthError } from '../lib/gemini-retry.js';
import type { GoogleGenerativeAI } from '@google/generative-ai';

vi.mock('../config.js', () => ({
    config: {
        gemini: {
            models: ['model-a', 'model-b', 'model-c'],
            timeoutMs: 5_000,
            maxRetriesPerModel: 2,
        },
    },
}));

// We never call actual Gemini SDK methods in these tests.
const fakeClient = {} as GoogleGenerativeAI;

afterEach(() => {
    vi.clearAllMocks();
});

// ─── Success paths ────────────────────────────────────────────────────────────

describe('success paths', () => {
    it('resolves on first attempt with the primary model', async () => {
        const call = vi.fn().mockResolvedValue('result');

        const value = await withGeminiRetry(fakeClient, call);

        expect(value).toBe('result');
        expect(call).toHaveBeenCalledTimes(1);
        expect(call).toHaveBeenCalledWith(fakeClient, 'model-a', expect.any(AbortSignal));
    });

    it('uses a custom model list from overrides', async () => {
        const call = vi.fn().mockResolvedValue('custom');

        const value = await withGeminiRetry(fakeClient, call, { models: ['special-model'] });

        expect(value).toBe('custom');
        expect(call).toHaveBeenCalledWith(fakeClient, 'special-model', expect.any(AbortSignal));
    });
});

// ─── Within-model retry ───────────────────────────────────────────────────────

describe('within-model retry', () => {
    it('retries on 429 and succeeds on the second attempt of the same model', async () => {
        const err429 = Object.assign(new Error('Too many requests'), { status: 429 });
        const call = vi.fn()
            .mockRejectedValueOnce(err429)
            .mockResolvedValue('ok');

        const value = await withGeminiRetry(fakeClient, call, { initialDelayMs: 0, maxDelayMs: 0 });

        expect(value).toBe('ok');
        expect(call).toHaveBeenCalledTimes(2);
        expect(call.mock.calls[0][1]).toBe('model-a');
        expect(call.mock.calls[1][1]).toBe('model-a');
    });

    it('retries on 503 with text "Service unavailable"', async () => {
        const err503 = Object.assign(new Error('Service unavailable'), { status: 503 });
        const call = vi.fn()
            .mockRejectedValueOnce(err503)
            .mockResolvedValue('recovered');

        const value = await withGeminiRetry(fakeClient, call, { initialDelayMs: 0, maxDelayMs: 0 });

        expect(value).toBe('recovered');
        expect(call).toHaveBeenCalledTimes(2);
    });

    it('retries when the error message contains "resource_exhausted"', async () => {
        const err = new Error('RESOURCE_EXHAUSTED: quota exceeded');
        const call = vi.fn()
            .mockRejectedValueOnce(err)
            .mockResolvedValue('ok');

        const value = await withGeminiRetry(fakeClient, call, { initialDelayMs: 0, maxDelayMs: 0 });

        expect(value).toBe('ok');
        expect(call).toHaveBeenCalledTimes(2);
    });
});

// ─── Model-level waterfall ────────────────────────────────────────────────────

describe('model-level waterfall', () => {
    it('moves to the second model when the first is exhausted (maxRetriesPerModel=2)', async () => {
        const err503 = Object.assign(new Error('Overloaded'), { status: 503 });
        const call = vi.fn()
            .mockRejectedValueOnce(err503)  // model-a attempt 1
            .mockRejectedValueOnce(err503)  // model-a attempt 2 (exhausted)
            .mockResolvedValue('from-model-b'); // model-b attempt 1

        const value = await withGeminiRetry(fakeClient, call, {
            initialDelayMs: 0,
            maxDelayMs: 0,
            maxRetriesPerModel: 2,
        });

        expect(value).toBe('from-model-b');
        expect(call).toHaveBeenCalledTimes(3);
        expect(call.mock.calls[0][1]).toBe('model-a');
        expect(call.mock.calls[1][1]).toBe('model-a');
        expect(call.mock.calls[2][1]).toBe('model-b');
    });

    it('falls through all three models and succeeds on the third', async () => {
        const err503 = Object.assign(new Error('Overloaded'), { status: 503 });
        const call = vi.fn()
            // model-a: 2 failures
            .mockRejectedValueOnce(err503)
            .mockRejectedValueOnce(err503)
            // model-b: 2 failures
            .mockRejectedValueOnce(err503)
            .mockRejectedValueOnce(err503)
            // model-c: success
            .mockResolvedValue('from-model-c');

        const value = await withGeminiRetry(fakeClient, call, {
            initialDelayMs: 0,
            maxDelayMs: 0,
            maxRetriesPerModel: 2,
        });

        expect(value).toBe('from-model-c');
        expect(call).toHaveBeenCalledTimes(5);
        expect(call.mock.calls[4][1]).toBe('model-c');
    });

    it('throws the last error when all models are exhausted', async () => {
        const err503 = Object.assign(new Error('Consistently down'), { status: 503 });
        const call = vi.fn().mockRejectedValue(err503);

        await expect(
            withGeminiRetry(fakeClient, call, { initialDelayMs: 0, maxDelayMs: 0 }),
        ).rejects.toThrow('Consistently down');

        // 3 models × 2 retries = 6 total attempts
        expect(call).toHaveBeenCalledTimes(6);
    });
});

// ─── Auth error fast-fail (401 / 403) ────────────────────────────────────────

describe('auth error fast-fail', () => {
    it('throws GeminiAuthError on 401 without retrying or trying other models', async () => {
        const err401 = Object.assign(new Error('Unauthorized — invalid API key'), { status: 401 });
        const call = vi.fn().mockRejectedValue(err401);

        await expect(withGeminiRetry(fakeClient, call)).rejects.toBeInstanceOf(GeminiAuthError);

        // Exactly one attempt — no retries, no model fallback
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('throws GeminiAuthError on 403 without retrying or trying other models', async () => {
        const err403 = Object.assign(new Error('Forbidden — insufficient permissions'), { status: 403 });
        const call = vi.fn().mockRejectedValue(err403);

        await expect(withGeminiRetry(fakeClient, call)).rejects.toBeInstanceOf(GeminiAuthError);
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('GeminiAuthError carries the model name and HTTP status', async () => {
        const err401 = Object.assign(new Error('Invalid key'), { status: 401 });
        const call = vi.fn().mockRejectedValue(err401);

        const caught = await withGeminiRetry(fakeClient, call).catch((e) => e);

        expect(caught).toBeInstanceOf(GeminiAuthError);
        expect((caught as GeminiAuthError).status).toBe(401);
        expect((caught as GeminiAuthError).model).toBe('model-a');
    });

    it('detects auth error from message text when no numeric status is present', async () => {
        const err = new Error('API key not valid. Please provide a valid API key.');
        const call = vi.fn().mockRejectedValue(err);

        await expect(withGeminiRetry(fakeClient, call)).rejects.toBeInstanceOf(GeminiAuthError);
        expect(call).toHaveBeenCalledTimes(1);
    });
});

// ─── Invalid-request fast-fail (400) ─────────────────────────────────────────

describe('invalid-request fast-fail', () => {
    it('throws immediately on 400 without retrying or trying other models', async () => {
        const err400 = Object.assign(new Error('Bad request — invalid parameter'), { status: 400 });
        const call = vi.fn().mockRejectedValue(err400);

        await expect(withGeminiRetry(fakeClient, call)).rejects.toThrow('Bad request');

        // Only one attempt — a bad payload won't work on another model either
        expect(call).toHaveBeenCalledTimes(1);
    });
});

// ─── Timeout behaviour ────────────────────────────────────────────────────────

describe('timeout behaviour', () => {
    it('moves to the next model immediately on timeout (no within-model retry)', async () => {
        // model-a hangs until its AbortSignal fires; model-b resolves quickly.
        const call = vi.fn().mockImplementation((_client, model, signal: AbortSignal) => {
            if (model === 'model-a') {
                return new Promise<string>((_, reject) => {
                    signal.addEventListener('abort', () => {
                        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
                    });
                });
            }
            return Promise.resolve('from-model-b');
        });

        const value = await withGeminiRetry(fakeClient, call, {
            timeoutMs: 60,           // short real timeout so the test runs in ~60ms
            maxRetriesPerModel: 3,   // would do 3 retries, but timeout skips them all
        });

        expect(value).toBe('from-model-b');
        // model-a tried once (timed out, no retries), model-b tried once (success)
        expect(call).toHaveBeenCalledTimes(2);
        expect(call.mock.calls[0][1]).toBe('model-a');
        expect(call.mock.calls[1][1]).toBe('model-b');
    }, 10_000 /* generous Vitest timeout */);

    it('passes an AbortSignal to the callback on each attempt', async () => {
        const receivedSignals: AbortSignal[] = [];
        const call = vi.fn().mockImplementation((_client, _model, signal: AbortSignal) => {
            receivedSignals.push(signal);
            return Promise.resolve('ok');
        });

        await withGeminiRetry(fakeClient, call);

        expect(receivedSignals).toHaveLength(1);
        expect(receivedSignals[0]).toBeInstanceOf(AbortSignal);
    });
});
