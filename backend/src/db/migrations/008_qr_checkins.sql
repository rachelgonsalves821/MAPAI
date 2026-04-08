-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008 — QR Code Check-Ins
-- Adds duplicate-prevention, a qr_verified flag on visits, and an audit table
-- that tracks every QR code ever generated for a venue.
-- ─────────────────────────────────────────────────────────────────────────────

-- Prevent duplicate check-ins: one per user per venue per calendar day.
-- The expression index on (visit_date::date) means two rows with timestamps on
-- the same calendar day (UTC) are treated as duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_one_per_day
    ON visits (clerk_user_id, place_id, (visit_date::date))
    WHERE status = 'visited';

-- Track which check-ins were validated by a real QR scan.
-- Existing rows default to false; new check-in inserts should pass the flag.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS qr_verified BOOLEAN DEFAULT false;

-- Audit trail for every QR code generated for a venue.
-- place_id here is the Google Place ID (TEXT), matching the rest of the app.
-- generated_by is the Clerk user ID of whoever triggered the generation
-- (venue owner, admin, or automatic on first check-in).
-- revoked_at allows codes to be invalidated without deletion.
CREATE TABLE IF NOT EXISTS venue_qr_codes (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id     TEXT         NOT NULL,
    signature    TEXT         NOT NULL,
    generated_by TEXT,
    created_at   TIMESTAMPTZ  DEFAULT now(),
    revoked_at   TIMESTAMPTZ,
    UNIQUE (place_id, signature)
);

CREATE INDEX IF NOT EXISTS idx_venue_qr_place ON venue_qr_codes (place_id);
