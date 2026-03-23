/**
 * Chat & Health route integration tests.
 * Uses Fastify's app.inject() — no HTTP server needed.
 * All external service calls are mocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/test-app.js';

// ─── Mock setup (hoisted before imports) ────────────────────────────────────

const mockAiChat = vi.hoisted(() => vi.fn());
const mockPlacesSearch = vi.hoisted(() => vi.fn());
const mockGetUserContext = vi.hoisted(() => vi.fn());
const mockLearnFromInsights = vi.hoisted(() => vi.fn());

vi.mock('../services/ai-orchestrator.js', () => ({
    AiOrchestrator: vi.fn(() => ({
        chat: mockAiChat,
    })),
}));

vi.mock('../services/places-service.js', () => ({
    PlacesService: vi.fn(() => ({
        search: mockPlacesSearch,
    })),
}));

vi.mock('../services/memory-service.js', () => ({
    MemoryService: vi.fn(() => ({
        getUserContext: mockGetUserContext,
        learnFromInsights: mockLearnFromInsights,
    })),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /v1/health', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('returns 200 with status ok', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/health',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.status).toBe('ok');
        expect(body.meta.timestamp).toBeDefined();
    });
});

describe('POST /v1/chat/message', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        // Default happy-path mocks
        mockGetUserContext.mockResolvedValue({
            cuisineLikes: [],
            cuisineDislikes: [],
            priceRange: { min: 1, max: 3 },
            speedSensitivity: 'moderate',
            ambiancePreferences: [],
            dietaryRestrictions: [],
        });
        mockPlacesSearch.mockResolvedValue([]);
        mockLearnFromInsights.mockResolvedValue(undefined);
        mockAiChat.mockResolvedValue({
            text: 'Here are some great spots!',
            searchQuery: undefined,
            discoveryIntent: undefined,
            preferenceInsights: [],
            sessionId: 'test-session-abc',
        });

        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
        vi.clearAllMocks();
    });

    it('valid body → 200 with reply, places, and session_id', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/chat/message',
            payload: { message: 'Find me a good coffee shop' },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.reply).toBe('Here are some great spots!');
        expect(body.data.places).toEqual([]);
        expect(body.data.session_id).toBe('test-session-abc');
    });

    it('empty message → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/chat/message',
            payload: { message: '' },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error.type).toBe('ValidationError');
    });

    it('message over 2000 chars → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/chat/message',
            payload: { message: 'x'.repeat(2001) },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error.type).toBe('ValidationError');
    });

    it('Claude API error → 200 with fallback message (no 500 leak)', async () => {
        // AiOrchestrator catches Claude errors internally and returns a fallback
        mockAiChat.mockResolvedValue({
            text: "I'm having trouble right now. Could you try again?",
            preferenceInsights: [],
            sessionId: 'fallback-session',
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/chat/message',
            payload: { message: 'Find me dinner' },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.reply).toContain("having trouble");
        expect(body.data.session_id).toBe('fallback-session');
    });
});
