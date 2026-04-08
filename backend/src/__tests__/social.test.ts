/**
 * Social feature integration tests.
 * Uses Fastify's app.inject() — no HTTP server needed.
 *
 * Auth: NODE_ENV=development (set in setup.ts) makes isDev=true, so
 * unauthenticated inject() calls automatically receive DEV_USER
 * (id: 'dev-user-001') via the permissive-dev fallback in authMiddleware.
 *
 * Database: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are absent in CI, so
 * hasDatabase() would return false and all service methods would no-op.
 * We mock both `../db/supabase-client.js` and `../services/user-search-service.js`
 * to give each test precise control over the data returned by the DB layer.
 *
 * Schema notes (actual production schema, not the older git-tracked version):
 *  - friendships(requester_id, addressee_id, status)  ← single-edge, no friend_requests table
 *  - user_profiles(clerk_user_id, username, display_name, avatar_url)  ← for search
 *  - blocks(blocker_id, blocked_id)
 *  - activity_events(actor_id, activity_type, place_id, ...)
 *  - user_loved_places(user_id, place_id, rating, visibility, ...)
 *  - place_reviews(user_id, place_id, rating, review_text, ...)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/test-app.js';

// ─── Hoist mock functions ─────────────────────────────────────────────────────
//
// vi.hoisted() runs before vi.mock() factories so we can reference these
// inside the factory closures and mutate them per-test in beforeEach.

const mockHasDatabase = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockGetSupabase = vi.hoisted(() => vi.fn());
const mockSearchUsers = vi.hoisted(() => vi.fn());
const mockAwardForReview = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../db/supabase-client.js', () => ({
    hasDatabase: mockHasDatabase,
    getSupabase: mockGetSupabase,
}));

vi.mock('../services/user-search-service.js', () => ({
    searchUsers: mockSearchUsers,
}));

vi.mock('../services/loyalty-service.js', () => ({
    LoyaltyService: vi.fn(() => ({
        awardForReview: mockAwardForReview,
        awardPoints: vi.fn(),
    })),
}));

// ─── Query-builder factory ────────────────────────────────────────────────────
//
// Mimics the chainable Supabase query builder API. Every method (select, eq,
// or, neq, in, limit, order, lt, update, insert, upsert, delete, single,
// maybeSingle, etc.) returns the same proxy object.  The proxy is thenable:
// `await chain` resolves to the `terminal` result.
//
// Methods `single()` and `maybeSingle()` explicitly resolve to the terminal
// so the `.single()` / `.maybeSingle()` call-pattern also works.

type TerminalResult = { data?: any; error?: any; count?: number };

function makeQueryBuilder(terminal: TerminalResult | (() => TerminalResult)) {
    const resolve = (): TerminalResult =>
        typeof terminal === 'function' ? terminal() : terminal;

    const thenable: any = {
        then(onFulfilled: (v: TerminalResult) => any) {
            return Promise.resolve(resolve()).then(onFulfilled);
        },
        single:      () => Promise.resolve(resolve()),
        maybeSingle: () => Promise.resolve(resolve()),
    };

    const chain: any = new Proxy(thenable, {
        get(target, prop: string) {
            if (prop in target) return target[prop];
            // Every unknown property is a builder method that returns the chain
            return (..._args: any[]) => chain;
        },
    });

    return chain;
}

/** Build a minimal Supabase stub routing each table to its preset result. */
function stubSupabase(
    tableResults: Record<string, TerminalResult | (() => TerminalResult)>,
) {
    return {
        from: (table: string) =>
            makeQueryBuilder(tableResults[table] ?? { data: [], error: null }),
    };
}

// ─── Shared constants ─────────────────────────────────────────────────────────

const DEV_USER_ID = 'dev-user-001';   // injected by auth middleware in dev mode
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FRIENDSHIP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLACE_ID      = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/social/search — user search flow
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /v1/social/search — user search flow', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('query shorter than 2 chars returns empty results immediately', async () => {
        // The route short-circuits before calling searchUsers when q.length < 2
        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/search?q=a',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.users).toEqual([]);
        expect(mockSearchUsers).not.toHaveBeenCalled();
    });

    it('missing query parameter returns empty results', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/search',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.users).toEqual([]);
        expect(mockSearchUsers).not.toHaveBeenCalled();
    });

    it('valid query delegates to searchUsers and returns matching users by username', async () => {
        mockSearchUsers.mockResolvedValue([
            { id: 'dev-user-002', display_name: 'Alex Chen', username: 'alexchen', avatar_url: null },
        ]);

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/search?q=alex',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.users).toHaveLength(1);
        expect(body.data.users[0].username).toBe('alexchen');
        expect(mockSearchUsers).toHaveBeenCalledWith('alex', DEV_USER_ID, 20);
    });

    it('valid query delegates to searchUsers and returns matching users by display name', async () => {
        mockSearchUsers.mockResolvedValue([
            { id: 'dev-user-003', display_name: 'Maya Lin', username: 'mayalin', avatar_url: null },
        ]);

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/search?q=Maya',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.users[0].display_name).toBe('Maya Lin');
    });

    it('query that matches nothing returns empty array', async () => {
        mockSearchUsers.mockResolvedValue([]);

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/search?q=zzz',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.users).toEqual([]);
    });

    it('searchUsers error → 500 ServerError (no stack leak)', async () => {
        mockSearchUsers.mockRejectedValue(new Error('DB connection failed'));

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/search?q=alex',
        });

        expect(response.statusCode).toBe(500);
        expect(response.json().error.type).toBe('ServerError');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Friend request flow
// ─────────────────────────────────────────────────────────────────────────────

describe('Friend request flow', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    // ── POST /v1/social/request ──────────────────────────────────────────────

    it('POST /request — valid UUID target → 200 with status ok and new request (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const insertedEdge = {
            id: FRIENDSHIP_ID,
            requester_id: DEV_USER_ID,
            addressee_id: OTHER_USER_ID,
            status: 'pending',
        };

        // First from() call: existence check via .maybeSingle() → no existing edge
        // Second from() call: insert new edge via .select().single()
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ data: null, error: null });
                return makeQueryBuilder({ data: insertedEdge, error: null });
            },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/request',
            payload: { to_user_id: OTHER_USER_ID },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.status).toBe('ok');
        expect(body.data.request.id).toBe(FRIENDSHIP_ID);
    });

    it('POST /request — missing to_user_id → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/request',
            payload: {},
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('POST /request — non-UUID to_user_id → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/request',
            payload: { to_user_id: 'not-a-uuid' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('POST /request — duplicate edge returns already_exists (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);
        // Existence check finds an existing edge
        mockGetSupabase.mockReturnValue(
            stubSupabase({
                friendships: { data: { id: FRIENDSHIP_ID, status: 'pending' }, error: null },
            })
        );

        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/request',
            payload: { to_user_id: OTHER_USER_ID },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.status).toBe('already_exists');
        expect(body.data.request_id).toBe(FRIENDSHIP_ID);
    });

    it('POST /request — DB insert error → 500 ServerError', async () => {
        mockHasDatabase.mockReturnValue(true);

        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ data: null, error: null }); // no existing
                return makeQueryBuilder({ data: null, error: { message: 'unique violation' } });
            },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/request',
            payload: { to_user_id: OTHER_USER_ID },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json().error.type).toBe('ServerError');
    });

    it('POST /request — no DB → 200 ok (permissive dev mode)', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/request',
            payload: { to_user_id: OTHER_USER_ID },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('ok');
    });

    // ── GET /v1/social/requests ──────────────────────────────────────────────

    it('GET /requests — returns incoming and outgoing lists (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const incomingEdge = {
            id: FRIENDSHIP_ID,
            status: 'pending',
            created_at: '2026-03-01T00:00:00Z',
            requester: { id: OTHER_USER_ID, username: 'alexchen', display_name: 'Alex Chen', avatar_url: null },
        };

        // First from() call: incoming query; second: outgoing query
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ data: [incomingEdge], error: null });
                return makeQueryBuilder({ data: [], error: null });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/requests',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.incoming).toHaveLength(1);
        expect(body.data.incoming[0].id).toBe(FRIENDSHIP_ID);
        expect(body.data.outgoing).toEqual([]);
    });

    it('GET /requests — no DB → 200 with empty lists', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/requests',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.incoming).toEqual([]);
        expect(body.data.outgoing).toEqual([]);
    });

    // ── PUT /v1/social/request/:id ───────────────────────────────────────────

    it('PUT /request/:id — accept → 200, status accepted (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const pendingEdge = {
            id: FRIENDSHIP_ID,
            requester_id: OTHER_USER_ID,
            addressee_id: DEV_USER_ID,
            status: 'pending',
        };

        // First from() call: fetch the pending edge via .single()
        // Subsequent calls: update the row
        let fetchDone = false;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                if (!fetchDone) {
                    fetchDone = true;
                    return makeQueryBuilder({ data: pendingEdge, error: null });
                }
                return makeQueryBuilder({ data: null, error: null });
            },
        });

        const response = await app.inject({
            method: 'PUT',
            url: `/v1/social/request/${FRIENDSHIP_ID}`,
            payload: { status: 'accepted' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('accepted');
    });

    it('PUT /request/:id — reject → 200, status rejected, row deleted (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const pendingEdge = {
            id: FRIENDSHIP_ID,
            requester_id: OTHER_USER_ID,
            addressee_id: DEV_USER_ID,
            status: 'pending',
        };

        let fetchDone = false;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                if (!fetchDone) {
                    fetchDone = true;
                    return makeQueryBuilder({ data: pendingEdge, error: null });
                }
                return makeQueryBuilder({ data: null, error: null });
            },
        });

        const response = await app.inject({
            method: 'PUT',
            url: `/v1/social/request/${FRIENDSHIP_ID}`,
            payload: { status: 'rejected' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('rejected');
    });

    it('PUT /request/:id — edge not found (wrong addressee) → 404 NotFoundError', async () => {
        mockHasDatabase.mockReturnValue(true);
        // .single() on a nonexistent row returns null
        mockGetSupabase.mockReturnValue(
            stubSupabase({
                friendships: { data: null, error: null },
            })
        );

        const response = await app.inject({
            method: 'PUT',
            url: `/v1/social/request/${FRIENDSHIP_ID}`,
            payload: { status: 'accepted' },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json().error.type).toBe('NotFoundError');
    });

    it('PUT /request/:id — invalid status value → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'PUT',
            url: `/v1/social/request/${FRIENDSHIP_ID}`,
            payload: { status: 'maybe' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('PUT /request/:id — no DB → 200 reflecting status', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'PUT',
            url: `/v1/social/request/${FRIENDSHIP_ID}`,
            payload: { status: 'accepted' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('accepted');
    });

    // ── GET /v1/social/friends — post-acceptance friend list ─────────────────

    it('GET /friends — returns friends after acceptance (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        // getFriends() queries friendships then users
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (table: string) => {
                callIndex++;
                if (callIndex === 1) {
                    // friendships query
                    return makeQueryBuilder({
                        data: [{ requester_id: DEV_USER_ID, addressee_id: OTHER_USER_ID, created_at: '2026-03-01T00:00:00Z' }],
                        error: null,
                    });
                }
                // users query
                return makeQueryBuilder({
                    data: [{ id: OTHER_USER_ID, display_name: 'Alex Chen', username: 'alexchen', avatar_url: null }],
                    error: null,
                });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/friends',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.count).toBe(1);
        expect(body.data.friends[0].username).toBe('alexchen');
        expect(body.data.friends[0].friends_since).toBe('2026-03-01T00:00:00Z');
    });

    it('GET /friends — no friends → empty list (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);
        mockGetSupabase.mockReturnValue(
            stubSupabase({ friendships: { data: [], error: null } })
        );

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/friends',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.friends).toEqual([]);
        expect(body.data.count).toBe(0);
    });

    it('GET /friends — no DB → 200 with empty list', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/friends',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.friends).toEqual([]);
        expect(body.data.count).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Friendship status — GET /v1/social/status/:targetId
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /v1/social/status/:targetId — friendship status', () => {
    let app: FastifyInstance;

    const TARGET_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

    beforeEach(async () => {
        vi.clearAllMocks();
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('no DB returns "none"', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/status/${TARGET_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('none');
    });

    it('returns "friends" when an accepted edge exists (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        // getFriendshipStatus calls: 1) isBlocked (blocks table), 2) edge lookup (friendships)
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) {
                    // isBlocked → count=0 (not blocked)
                    return makeQueryBuilder({ count: 0, data: [], error: null });
                }
                // friendships edge → accepted
                return makeQueryBuilder({
                    data: { id: FRIENDSHIP_ID, status: 'accepted', requester_id: DEV_USER_ID, addressee_id: TARGET_ID },
                    error: null,
                });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/status/${TARGET_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('friends');
    });

    it('returns "pending_outgoing" when current user sent the request', async () => {
        mockHasDatabase.mockReturnValue(true);

        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ count: 0, data: [], error: null }); // isBlocked
                // edge with DEV_USER as requester → pending_outgoing
                return makeQueryBuilder({
                    data: { id: FRIENDSHIP_ID, status: 'pending', requester_id: DEV_USER_ID, addressee_id: TARGET_ID },
                    error: null,
                });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/status/${TARGET_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('pending_outgoing');
    });

    it('returns "pending_incoming" when current user received the request', async () => {
        mockHasDatabase.mockReturnValue(true);

        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ count: 0, data: [], error: null }); // isBlocked
                // edge with TARGET as requester → pending_incoming
                return makeQueryBuilder({
                    data: { id: FRIENDSHIP_ID, status: 'pending', requester_id: TARGET_ID, addressee_id: DEV_USER_ID },
                    error: null,
                });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/status/${TARGET_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('pending_incoming');
    });

    it('returns "none" when no edge exists', async () => {
        mockHasDatabase.mockReturnValue(true);

        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ count: 0, data: [], error: null }); // isBlocked
                return makeQueryBuilder({ data: null, error: null }); // no edge
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/status/${TARGET_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('none');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Data visibility — loved places, reviews, and the activity feed
// ─────────────────────────────────────────────────────────────────────────────

describe('Data visibility — loved places, reviews, activity feed', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockAwardForReview.mockResolvedValue(undefined);
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it("GET /social/loved-places/:userId — friend can see owner's loved places (DB path)", async () => {
        mockHasDatabase.mockReturnValue(true);

        const lovedPlace = {
            id: 'lp-1',
            user_id: OTHER_USER_ID,
            place_id: PLACE_ID,
            visibility: 'friends',
            rating: 5,
        };

        mockGetSupabase.mockReturnValue(
            stubSupabase({ user_loved_places: { data: [lovedPlace], error: null } })
        );

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/loved-places/${OTHER_USER_ID}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.count).toBe(1);
        expect(body.data.places[0].place_id).toBe(PLACE_ID);
    });

    it('GET /social/loved-places/:userId — no DB → 200 with empty list', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/loved-places/${OTHER_USER_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.places).toEqual([]);
    });

    it('GET /reviews/places/:placeId/friends — returns friends-only reviews (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const friendReview = {
            id: 'rev-1',
            user_id: OTHER_USER_ID,
            place_id: PLACE_ID,
            rating: 4,
            review_text: 'Great spot!',
            reviewer: { id: OTHER_USER_ID, display_name: 'Alex Chen', username: 'alexchen', avatar_url: null },
        };

        // getFriendReviews calls: 1) friendships (resolve friend IDs),
        //                         2) blocks (getBlockedIds),
        //                         3) place_reviews (actual reviews)
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) {
                    // friendships → DEV_USER and OTHER_USER are friends
                    return makeQueryBuilder({
                        data: [{ user_id: DEV_USER_ID, friend_id: OTHER_USER_ID }],
                        error: null,
                    });
                }
                if (callIndex === 2) {
                    // blocks → no blocks
                    return makeQueryBuilder({ data: [], error: null });
                }
                // place_reviews
                return makeQueryBuilder({ data: [friendReview], error: null });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: `/v1/reviews/places/${PLACE_ID}/friends`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.count).toBe(1);
        expect(body.data.reviews[0].reviewer.username).toBe('alexchen');
    });

    it('GET /reviews/places/:placeId/friends — no friends → empty list (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        mockGetSupabase.mockReturnValue(
            stubSupabase({ friendships: { data: [], error: null } })
        );

        const response = await app.inject({
            method: 'GET',
            url: `/v1/reviews/places/${PLACE_ID}/friends`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.reviews).toEqual([]);
    });

    it('GET /social/feed — shows activity from friends (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const activityItem = {
            id: 'act-1',
            actor_id: OTHER_USER_ID,
            activity_type: 'place_loved',
            place_id: PLACE_ID,
            place_name: 'Blue Bottle Coffee',
            created_at: '2026-03-20T10:00:00Z',
        };

        // getFriendFeed calls: 1) _getAcceptedFriendIds (friendships),
        //                      2) getBlockedIds (blocks),
        //                      3) activity_events
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) {
                    // _getAcceptedFriendIds → friendships
                    return makeQueryBuilder({
                        data: [{ requester_id: DEV_USER_ID, addressee_id: OTHER_USER_ID }],
                        error: null,
                    });
                }
                if (callIndex === 2) {
                    // getBlockedIds → no blocks
                    return makeQueryBuilder({ data: [], error: null });
                }
                // activity_events
                return makeQueryBuilder({ data: [activityItem], error: null });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/feed',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.count).toBe(1);
        expect(body.data.items[0].activity_type).toBe('place_loved');
        expect(body.data.next_cursor).toBe('2026-03-20T10:00:00Z');
    });

    it('GET /social/feed — no friends → empty feed (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        mockGetSupabase.mockReturnValue(
            stubSupabase({ friendships: { data: [], error: null } })
        );

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/feed',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.items).toEqual([]);
        expect(body.data.next_cursor).toBeNull();
    });

    it('GET /social/feed — no DB → 200 with empty list', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/feed',
        });

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.json().data.items)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block flow
// ─────────────────────────────────────────────────────────────────────────────

describe('Block flow', () => {
    let app: FastifyInstance;

    const TARGET_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    beforeEach(async () => {
        vi.clearAllMocks();
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('POST /social/block — blocks user and returns blocked: true (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);
        mockGetSupabase.mockReturnValue(
            stubSupabase({
                blocks: { data: null, error: null },
                friendships: { data: null, error: null },
            })
        );

        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/block',
            payload: { target_user_id: TARGET_ID },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.blocked).toBe(true);
    });

    it('POST /social/block — missing target_user_id → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/block',
            payload: {},
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('GET /social/status/:targetId — returns "blocked" after block (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        // getFriendshipStatus calls isBlocked first → count > 0 → blocked
        mockGetSupabase.mockReturnValue(
            stubSupabase({
                blocks: { data: [{ id: 'blk-1' }], error: null, count: 1 },
            })
        );

        const response = await app.inject({
            method: 'GET',
            url: `/v1/social/status/${TARGET_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.status).toBe('blocked');
    });

    it('GET /social/feed — blocked friend activity is excluded (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        // TARGET_ID is a friend but also blocked.
        // getFriendFeed: 1) _getAcceptedFriendIds → TARGET_ID in friends
        //                2) getBlockedIds → TARGET_ID is blocked
        // validFriendIds is empty → no activity fetched → returns []
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) {
                    return makeQueryBuilder({
                        data: [{ requester_id: DEV_USER_ID, addressee_id: TARGET_ID }],
                        error: null,
                    });
                }
                if (callIndex === 2) {
                    // blocked_id list includes TARGET_ID
                    return makeQueryBuilder({
                        data: [{ blocked_id: TARGET_ID }],
                        error: null,
                    });
                }
                // Should never reach activity_events — validFriendIds is empty
                return makeQueryBuilder({ data: [{ id: 'should-not-appear' }], error: null });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: '/v1/social/feed',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.items).toEqual([]);
    });

    it('POST /social/unblock — unblocks user and returns unblocked: true (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);
        mockGetSupabase.mockReturnValue(
            stubSupabase({ blocks: { data: null, error: null } })
        );

        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/unblock',
            payload: { target_user_id: TARGET_ID },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.unblocked).toBe(true);
    });

    it('POST /social/unblock — missing target_user_id → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/social/unblock',
            payload: {},
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/friends/match-contacts
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /v1/friends/match-contacts — contact matching', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('valid emails list → 200 in dev-mode (no DB)', async () => {
        mockHasDatabase.mockReturnValue(false);

        const response = await app.inject({
            method: 'POST',
            url: '/v1/friends/match-contacts',
            payload: { emails: ['alice@example.com', 'bob@example.com'] },
        });

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.json().data)).toBe(true);
    });

    it('valid emails list → 200 with matched users (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);
        mockGetSupabase.mockReturnValue(
            stubSupabase({
                user_profiles: {
                    data: [
                        { clerk_user_id: 'user-abc', display_name: 'Alice', username: 'alice', avatar_url: null },
                    ],
                    error: null,
                },
            })
        );

        const response = await app.inject({
            method: 'POST',
            url: '/v1/friends/match-contacts',
            payload: { emails: ['alice@example.com'] },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].username).toBe('alice');
    });

    it('empty emails array → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/friends/match-contacts',
            payload: { emails: [] },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('invalid email in list → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/friends/match-contacts',
            payload: { emails: ['not-an-email'] },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('missing emails key → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/friends/match-contacts',
            payload: {},
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review routes
// ─────────────────────────────────────────────────────────────────────────────

describe('Review routes', () => {
    let app: FastifyInstance;

    const REVIEW_PLACE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    beforeEach(async () => {
        vi.clearAllMocks();
        mockAwardForReview.mockResolvedValue(undefined);
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('POST /reviews/places/:placeId — creates review and returns 201 (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const savedReview = {
            id: 'rev-1',
            user_id: DEV_USER_ID,
            place_id: REVIEW_PLACE_ID,
            rating: 4,
            review_text: 'Really good espresso.',
            place_name: 'Render Coffee',
            visit_date: null,
            created_at: '2026-03-26T12:00:00Z',
            updated_at: '2026-03-26T12:00:00Z',
        };

        // createReview calls: 1) getReview (check if existing) → null,
        //                     2) upsert (save review)
        //                     3) activity_events insert (fire-and-forget)
        //                     4) awardForReview (mocked via LoyaltyService)
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) {
                    // getReview → no existing
                    return makeQueryBuilder({ data: null, error: null });
                }
                if (callIndex === 2) {
                    // upsert → saved review
                    return makeQueryBuilder({ data: savedReview, error: null });
                }
                // activity_events → fire-and-forget
                return makeQueryBuilder({ data: null, error: null });
            },
        });

        const response = await app.inject({
            method: 'POST',
            url: `/v1/reviews/places/${REVIEW_PLACE_ID}`,
            payload: {
                rating: 4,
                review_text: 'Really good espresso.',
                place_name: 'Render Coffee',
            },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.data.place_id).toBe(REVIEW_PLACE_ID);
        expect(body.data.rating).toBe(4);
        expect(body.data.review_text).toBe('Really good espresso.');
    });

    it('POST /reviews/places/:placeId — rating out of range → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: `/v1/reviews/places/${REVIEW_PLACE_ID}`,
            payload: { rating: 6 },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('POST /reviews/places/:placeId — rating below minimum → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: `/v1/reviews/places/${REVIEW_PLACE_ID}`,
            payload: { rating: 0 },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('POST /reviews/places/:placeId — review_text over 500 chars → 400 ValidationError', async () => {
        const response = await app.inject({
            method: 'POST',
            url: `/v1/reviews/places/${REVIEW_PLACE_ID}`,
            payload: { review_text: 'x'.repeat(501) },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.type).toBe('ValidationError');
    });

    it('GET /reviews/places/:placeId — returns all reviews (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const review = {
            id: 'rev-1',
            user_id: DEV_USER_ID,
            place_id: REVIEW_PLACE_ID,
            rating: 3,
            review_text: 'Decent place.',
            created_at: '2026-03-01T00:00:00Z',
        };

        // getPlaceReviews calls: 1) getBlockedIds (blocks), 2) place_reviews
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ data: [], error: null }); // no blocks
                return makeQueryBuilder({ data: [review], error: null });
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: `/v1/reviews/places/${REVIEW_PLACE_ID}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.count).toBe(1);
        expect(body.data.reviews[0].place_id).toBe(REVIEW_PLACE_ID);
    });

    it('GET /reviews/user/:userId — returns reviews by a user (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const review = {
            id: 'rev-2',
            user_id: DEV_USER_ID,
            place_id: REVIEW_PLACE_ID,
            rating: 5,
            review_text: 'Loved it!',
            created_at: '2026-03-10T00:00:00Z',
        };

        mockGetSupabase.mockReturnValue(
            stubSupabase({ place_reviews: { data: [review], error: null } })
        );

        const response = await app.inject({
            method: 'GET',
            url: `/v1/reviews/user/${DEV_USER_ID}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.count).toBe(1);
        expect(body.data.reviews[0].user_id).toBe(DEV_USER_ID);
    });

    it('DELETE /reviews/places/:placeId — deletes own review (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        const existingReview = {
            id: 'rev-3',
            user_id: DEV_USER_ID,
            place_id: REVIEW_PLACE_ID,
            rating: 2,
        };

        // DELETE calls: 1) getReview (check existence), 2) deleteReview
        let callIndex = 0;
        mockGetSupabase.mockReturnValue({
            from: (_table: string) => {
                callIndex++;
                if (callIndex === 1) return makeQueryBuilder({ data: existingReview, error: null }); // exists
                return makeQueryBuilder({ data: null, error: null }); // delete
            },
        });

        const response = await app.inject({
            method: 'DELETE',
            url: `/v1/reviews/places/${REVIEW_PLACE_ID}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.deleted).toBe(true);
    });

    it('DELETE /reviews/places/:placeId — review not found → 404 NotFoundError (DB path)', async () => {
        mockHasDatabase.mockReturnValue(true);

        mockGetSupabase.mockReturnValue(
            stubSupabase({ place_reviews: { data: null, error: null } })
        );

        const response = await app.inject({
            method: 'DELETE',
            url: `/v1/reviews/places/${REVIEW_PLACE_ID}`,
        });

        expect(response.statusCode).toBe(404);
        expect(response.json().error.type).toBe('NotFoundError');
    });
});
