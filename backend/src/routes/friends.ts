/**
 * Mapai Backend — Friends Routes
 * POST /v1/friends/match-contacts — Match phone contacts to Mapai users
 *
 * Friend request CRUD is handled by /v1/social/* routes (social.ts).
 *
 * SCHEMA NOTE — phone matching:
 *   The user_profiles table (migration 003) does not currently have a
 *   `phone` column.  The phone-matching branch below is wired up and
 *   ready; it will silently return zero phone matches until the column
 *   is added.  To enable it, run:
 *
 *     ALTER TABLE public.user_profiles ADD COLUMN phone TEXT UNIQUE;
 *     CREATE INDEX idx_user_profiles_phone ON public.user_profiles (phone);
 *
 *   and update the Clerk webhook handler to populate the field.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { envelope, errorResponse } from '../utils/response.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';

const matchContactsSchema = z.object({
    emails: z.array(z.string().email()).max(500).default([]),
    phoneNumbers: z.array(z.string()).max(500).default([]),
}).refine(
    (d) => d.emails.length > 0 || d.phoneNumbers.length > 0,
    { message: 'Provide at least one email or phone number' },
);

export async function friendRoutes(app: FastifyInstance) {
    /**
     * POST /v1/friends/match-contacts
     *
     * Match a list of emails and/or phone numbers to existing Mapai users.
     * Used by the mobile app to find friends from the device contact list.
     *
     * Request body:
     *   { emails: string[], phoneNumbers?: string[] }
     *
     * Response:
     *   { data: MatchedUser[] }
     *   where MatchedUser = { user_id, display_name, username, avatar_url }
     *
     * Deduplication: if the same user matches on both email and phone they
     * appear only once in the response (keyed by user_id).
     */
    app.post('/match-contacts', {
        preHandler: authMiddleware,
        handler: async (request, reply) => {
            const parsed = matchContactsSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(
                    errorResponse(400, parsed.error.message, 'ValidationError'),
                );
            }

            const callerId = request.user!.id;
            const emails = parsed.data.emails.slice(0, 500);
            const phones = parsed.data.phoneNumbers.slice(0, 500);

            if (!hasDatabase()) {
                app.log.info(
                    `[Mock] Contact match for ${callerId}: ` +
                    `${emails.length} emails, ${phones.length} phones`,
                );
                return reply.send(envelope([]));
            }

            const supabase = getSupabase()!;
            // Accumulate matches, deduped by user_id
            const seen = new Map<string, any>();

            // ── Email matching ────────────────────────────────────────────
            if (emails.length > 0) {
                const { data: emailMatches, error: emailErr } = await (
                    supabase.from('user_profiles') as any
                )
                    .select('user_id, display_name, username, avatar_url')
                    .in('email', emails)
                    .neq('user_id', callerId);

                if (emailErr) {
                    app.log.error(emailErr, 'Failed to match contacts by email');
                    return reply.status(500).send(
                        errorResponse(500, 'Failed to match contacts', 'ServerError'),
                    );
                }

                for (const row of emailMatches ?? []) {
                    seen.set(row.user_id, row);
                }
            }

            // ── Phone matching ────────────────────────────────────────────
            // Requires a `phone` column on user_profiles (see SCHEMA NOTE above).
            // When the column does not exist, Supabase returns a 400-level error;
            // we catch it and log a warning rather than failing the whole request.
            if (phones.length > 0) {
                const { data: phoneMatches, error: phoneErr } = await (
                    supabase.from('user_profiles') as any
                )
                    .select('user_id, display_name, username, avatar_url')
                    .in('phone', phones)
                    .neq('user_id', callerId);

                if (phoneErr) {
                    // Column may not exist yet — warn but do not abort
                    app.log.warn(
                        { err: phoneErr },
                        'Phone matching skipped (user_profiles.phone column may be missing)',
                    );
                } else {
                    for (const row of phoneMatches ?? []) {
                        if (!seen.has(row.user_id)) {
                            seen.set(row.user_id, row);
                        }
                    }
                }
            }

            return reply.send(envelope(Array.from(seen.values())));
        },
    });
}
