-- ================================================================
-- Mapai Migration 007 — Loyalty Points & Place Reviews
--
-- Tables: place_reviews, points_transactions, rewards,
--         reward_redemptions
--
-- Also adds columns to users table:
--   points_balance, privacy_loved_places, privacy_activity,
--   allow_friend_requests, deletion_requested_at, deletion_scheduled_at
--
-- All user-referencing columns use TEXT for Clerk IDs.
-- Depends on: 001_foundation.sql (users table for ALTER TABLE)
-- ================================================================

-- ─── users table extensions ──────────────────────────────────────
-- These columns are pre-included in 001_foundation.sql for greenfield
-- installs. The IF NOT EXISTS guards make these safe to run on
-- databases that ran the legacy vN migrations first.

ALTER TABLE users ADD COLUMN IF NOT EXISTS points_balance          INTEGER     DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_loved_places    VARCHAR(20) DEFAULT 'friends';
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_activity        VARCHAR(20) DEFAULT 'friends';
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_friend_requests   BOOLEAN     DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at   TIMESTAMPTZ;

-- ─── place_reviews ───────────────────────────────────────────────
-- Structured star-rating + text review per user per place.

CREATE TABLE IF NOT EXISTS place_reviews (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT         NOT NULL,
    place_id      VARCHAR(255) NOT NULL,
    place_name    VARCHAR(255),
    rating        INTEGER      CHECK (rating >= 1 AND rating <= 5),
    review_text   TEXT         CHECK (char_length(review_text) <= 500),
    visit_date    DATE,
    created_at    TIMESTAMPTZ  DEFAULT now(),
    updated_at    TIMESTAMPTZ  DEFAULT now(),

    UNIQUE (clerk_user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_user  ON place_reviews(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_place ON place_reviews(place_id);

ALTER TABLE place_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reviews" ON place_reviews;
CREATE POLICY "Users manage own reviews"
    ON place_reviews FOR ALL
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Reviews are publicly readable" ON place_reviews;
CREATE POLICY "Reviews are publicly readable"
    ON place_reviews FOR SELECT
    USING (true);

DROP TRIGGER IF EXISTS reviews_updated_at ON place_reviews;
CREATE TRIGGER reviews_updated_at
    BEFORE UPDATE ON place_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── points_transactions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS points_transactions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id    TEXT        NOT NULL,
    points           INTEGER     NOT NULL,
    transaction_type VARCHAR(50) NOT NULL
                     CHECK (transaction_type IN (
                         'survey', 'review', 'check_in',
                         'first_visit', 'referral', 'redemption'
                     )),
    reference_id     VARCHAR(255),
    description      TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(clerk_user_id, created_at DESC);

ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own points" ON points_transactions;
CREATE POLICY "Users can read own points"
    ON points_transactions FOR SELECT
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── rewards ─────────────────────────────────────────────────────
-- Catalog of redeemable rewards (managed by service role / admin).

CREATE TABLE IF NOT EXISTS rewards (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title              VARCHAR(255) NOT NULL,
    description        TEXT,
    points_required    INTEGER      NOT NULL,
    reward_type        VARCHAR(50)
                       CHECK (reward_type IN ('discount', 'free_item', 'experience')),
    terms              TEXT,
    valid_until        DATE,
    quantity_available INTEGER,
    is_active          BOOLEAN      DEFAULT true,
    created_at         TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rewards are publicly readable" ON rewards;
CREATE POLICY "Rewards are publicly readable"
    ON rewards FOR SELECT
    USING (is_active = true);

-- ─── reward_redemptions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reward_redemptions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id    TEXT        NOT NULL,
    reward_id        UUID        NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
    redeemed_at      TIMESTAMPTZ DEFAULT now(),
    status           VARCHAR(20) DEFAULT 'pending'
                     CHECK (status IN ('pending', 'used', 'expired')),
    redemption_code  VARCHAR(50) UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user     ON reward_redemptions(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_reward   ON reward_redemptions(reward_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status   ON reward_redemptions(status);

ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own redemptions" ON reward_redemptions;
CREATE POLICY "Users can view own redemptions"
    ON reward_redemptions FOR SELECT
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Users can create own redemptions" ON reward_redemptions;
CREATE POLICY "Users can create own redemptions"
    ON reward_redemptions FOR INSERT
    WITH CHECK (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));
