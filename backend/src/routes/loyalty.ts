/**
 * Mapai Backend — Loyalty Routes
 * GET  /v1/loyalty/balance              — points balance
 * GET  /v1/loyalty/history              — paginated transaction history
 * GET  /v1/loyalty/rewards              — available rewards catalog
 * POST /v1/loyalty/rewards/:id/redeem   — redeem a reward
 * POST /v1/loyalty/check-in/:placeId    — QR-verified check-in (3 pts + first-visit bonus)
 * POST /v1/loyalty/qr-code/:placeId     — generate / retrieve QR code for a venue
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { LoyaltyService } from '../services/loyalty-service.js';
import { SurveyService } from '../services/survey-service.js';
import { QRService } from '../services/qr-service.js';
import { config, isDev } from '../config.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const historyQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    cursor: z.string().optional(),
});

const checkInBodySchema = z.object({
    place_name: z.string().max(255).optional().default(''),
    qr_data: z.string().max(500),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function loyaltyRoutes(app: FastifyInstance) {
    const loyalty = new LoyaltyService();
    const surveyService = new SurveyService();
    const qrService = new QRService(config.qrSigningSecret || undefined);

    /**
     * GET /v1/loyalty/balance
     */
    app.get('/balance', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const userId = request.user!.id;
            const balance = await loyalty.getBalance(userId);
            const history = await loyalty.getHistory(userId, 100);
            const lifetimeEarned = history.transactions
                .filter((t: any) => t.points > 0)
                .reduce((sum: number, t: any) => sum + t.points, 0);

            // Tier calculation
            const tiers = [
                { id: 'regular', name: 'Regular', min: 0, color: '#6B7280' },
                { id: 'insider', name: 'Insider', min: 500, color: '#3B82F6' },
                { id: 'vip', name: 'VIP', min: 2000, color: '#8B5CF6' },
                { id: 'elite', name: 'Elite', min: 5000, color: '#F59E0B' },
            ];
            const currentTier = [...tiers].reverse().find(t => lifetimeEarned >= t.min) || tiers[0];
            const nextTier = tiers[tiers.indexOf(currentTier) + 1] || null;
            const ptsToNextTier = nextTier ? nextTier.min - lifetimeEarned : 0;
            const tierProgress = nextTier
                ? ((lifetimeEarned - currentTier.min) / (nextTier.min - currentTier.min)) * 100
                : 100;

            // Weekly earned (sum of positive transactions in last 7 days)
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const weeklyEarned = history.transactions
                .filter((t: any) => t.points > 0 && t.created_at >= weekAgo)
                .reduce((sum: number, t: any) => sum + t.points, 0);

            return envelope({
                balance,
                lifetime_earned: lifetimeEarned,
                tier: currentTier,
                next_tier: nextTier,
                pts_to_next_tier: ptsToNextTier,
                tier_progress_pct: Math.round(tierProgress),
                weekly_earned: weeklyEarned,
                streak_days: 8, // TODO: compute from check-in history
                redemption_threshold: 50,
            });
        },
    });

    /**
     * GET /v1/loyalty/history?limit=20&cursor=<iso-timestamp>
     */
    app.get('/history', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = historyQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Invalid query parameters', 'ValidationError')
                );
            }
            const userId = request.user!.id;
            const { limit, cursor } = parsed.data;
            const result = await loyalty.getHistory(userId, limit, cursor);
            return envelope(result);
        },
    });

    /**
     * GET /v1/loyalty/rewards
     */
    app.get('/rewards', {
        preHandler: authMiddleware,
        handler: async (request) => {
            const userId = request.user!.id;
            const [rewards, balance] = await Promise.all([
                loyalty.getRewards(),
                loyalty.getBalance(userId),
            ]);
            return envelope({ rewards, balance, count: rewards.length });
        },
    });

    /**
     * POST /v1/loyalty/rewards/:id/redeem
     */
    app.post<{ Params: { id: string } }>('/rewards/:id/redeem', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;
            const rewardId = request.params.id;

            try {
                const result = await loyalty.redeemReward(userId, rewardId);
                return envelope(result);
            } catch (err: any) {
                const msg: string = err?.message ?? 'Redemption failed';
                if (msg.includes('Insufficient')) {
                    return reply.status(402).send(
                        errorResponse(402, msg, 'InsufficientPointsError')
                    );
                }
                if (msg.includes('not found') || msg.includes('inactive')) {
                    return reply.status(404).send(
                        errorResponse(404, msg, 'NotFoundError')
                    );
                }
                if (msg.includes('out of stock')) {
                    return reply.status(409).send(
                        errorResponse(409, msg, 'OutOfStockError')
                    );
                }
                return reply.status(500).send(
                    errorResponse(500, msg, 'ServerError')
                );
            }
        },
    });

    /**
     * POST /v1/loyalty/check-in/:placeId
     *
     * QR-verified check-in.  The client must supply the raw QR code payload in
     * `qr_data`.  The server parses it, verifies the HMAC-SHA256 signature,
     * guards against same-day duplicate check-ins, inserts the visit row, awards
     * 3 check-in points (+ 10 first-visit bonus if applicable), and creates an
     * arrival survey.
     *
     * Body: { qr_data: string, place_name?: string }
     *
     * Error codes:
     *   400 — missing / invalid body
     *   403 — bad QR format, wrong venue, or invalid signature
     *   409 — already checked in today
     */
    app.post<{ Params: { placeId: string } }>('/check-in/:placeId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;
            const { placeId } = request.params;

            // ── 1. Parse + validate the request body ─────────────────────────
            const bodyParsed = checkInBodySchema.safeParse(request.body ?? {});
            if (!bodyParsed.success) {
                return reply.status(400).send(
                    errorResponse(400, 'Request body must include qr_data', 'ValidationError')
                );
            }
            const { place_name: placeName, qr_data: qrData } = bodyParsed.data;

            // ── 2. Parse the QR payload ───────────────────────────────────────
            const parsed = qrService.parse(qrData);
            if (!parsed) {
                return reply.status(403).send(
                    errorResponse(403, 'Invalid QR code format', 'InvalidQRCodeError')
                );
            }

            // ── 3. Confirm the QR code is for THIS venue ──────────────────────
            if (parsed.placeId !== placeId) {
                return reply.status(403).send(
                    errorResponse(403, 'QR code does not match this venue', 'InvalidQRCodeError')
                );
            }

            // ── 4. Verify the HMAC signature ──────────────────────────────────
            if (!qrService.verify(parsed.placeId, parsed.signature)) {
                return reply.status(403).send(
                    errorResponse(403, 'Invalid QR code signature', 'InvalidQRCodeError')
                );
            }

            // ── 5. Duplicate check (one check-in per user per venue per day) ──
            const alreadyCheckedIn = await loyalty.hasCheckedInToday(userId, placeId);
            if (alreadyCheckedIn) {
                return reply.status(409).send(
                    errorResponse(409, 'Already checked in today', 'DuplicateCheckInError')
                );
            }

            // ── 6. Record the visit in Supabase (if available) ────────────────
            if (hasDatabase()) {
                const supabase = getSupabase()!;

                // Resolve internal UUID for this place
                let placeUuid: string | null = null;
                const { data: placeRow } = await (supabase.from('places') as any)
                    .select('id')
                    .eq('google_place_id', placeId)
                    .maybeSingle();
                placeUuid = placeRow?.id ?? null;

                if (!placeUuid) {
                    // Create a placeholder place row so FK constraints are satisfied
                    const { data: newPlace } = await (supabase.from('places') as any)
                        .insert({
                            google_place_id: placeId,
                            name: placeName || placeId,
                            latitude: 0,
                            longitude: 0,
                        })
                        .select('id')
                        .single();
                    placeUuid = newPlace?.id ?? null;
                }

                if (placeUuid) {
                    const { error: visitErr } = await (supabase.from('visits') as any)
                        .insert({
                            clerk_user_id: userId,
                            place_id: placeUuid,
                            status: 'visited',
                            visit_date: new Date().toISOString(),
                            qr_verified: true,
                        });

                    if (visitErr) {
                        // A unique constraint violation means a concurrent request
                        // already inserted the same check-in for today — treat as
                        // duplicate rather than surfacing a 500.
                        if (visitErr.code === '23505') {
                            return reply.status(409).send(
                                errorResponse(409, 'Already checked in today', 'DuplicateCheckInError')
                            );
                        }
                        // Log but don't fail — points can still be awarded
                        console.warn(
                            `[CheckIn] Visit insert failed for user ${userId} at ${placeId}: ${visitErr.message}`
                        );
                    }
                }
            }

            // ── 7. Award points ───────────────────────────────────────────────
            await loyalty.awardForFirstVisit(userId, placeId);
            await loyalty.awardForCheckIn(userId, placeId);
            const balance = await loyalty.getBalance(userId);

            // ── 8. Create arrival survey (non-fatal) ──────────────────────────
            let survey: any = null;
            try {
                survey = await surveyService.createSurveyForCheckIn(userId, placeId, placeName);
            } catch (err: any) {
                console.warn(
                    `[CheckIn] Could not create survey for user ${userId} at ${placeId}: ${err?.message}`
                );
            }

            return envelope({ balance, checked_in: true, survey });
        },
    });

    /**
     * POST /v1/loyalty/qr-code/:placeId
     *
     * Generate (or retrieve) the permanent QR code for a venue.  The QR encodes
     * a signed check-in URL.  Works in dev even when Supabase is unavailable —
     * the image is generated on-the-fly and the audit row is skipped gracefully.
     *
     * Response: { place_id, qr_url, qr_image, signature }
     *   qr_url   — the URL encoded in the QR (also useful for deep-linking)
     *   qr_image — base64-encoded PNG data URI, ready for <Image source={{ uri }} />
     *   signature — the raw HMAC hex, in case the caller wants to construct URLs
     */
    app.post<{ Params: { placeId: string } }>('/qr-code/:placeId', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const userId = request.user!.id;
            const { placeId } = request.params;

            // Build the signed URL that will be embedded in the QR image
            const qrUrl = qrService.buildURL(placeId);
            const signature = qrService.sign(placeId);

            // Generate base64 PNG — works without Supabase
            let qrImage: string;
            try {
                qrImage = await QRCode.toDataURL(qrUrl, { width: 400, margin: 2 });
            } catch (err: any) {
                console.error(`[QRCode] Image generation failed for ${placeId}: ${err?.message}`);
                return reply.status(500).send(
                    errorResponse(500, 'Failed to generate QR code image', 'QRGenerationError')
                );
            }

            // Optionally store audit record — skip gracefully when DB is unavailable
            if (hasDatabase()) {
                const supabase = getSupabase()!;
                const { error: auditErr } = await (supabase.from('venue_qr_codes') as any)
                    .upsert(
                        {
                            place_id: placeId,
                            signature,
                            generated_by: userId,
                        },
                        { onConflict: 'place_id,signature', ignoreDuplicates: true }
                    );

                if (auditErr) {
                    // Non-fatal — the QR code is still valid even if the audit write fails
                    console.warn(
                        `[QRCode] Audit record write failed for ${placeId}: ${auditErr.message}`
                    );
                }
            } else if (!isDev) {
                // In a non-dev environment without a database, log clearly
                console.warn(`[QRCode] No database — audit record skipped for place ${placeId}`);
            }

            return envelope({ place_id: placeId, qr_url: qrUrl, qr_image: qrImage, signature });
        },
    });
}
