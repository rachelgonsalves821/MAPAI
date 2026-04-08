-- Mapai DB Migration v5 — Loyalty Points & Place Reviews
-- Run this against your Supabase project SQL editor or psql.
--
-- ARCHIVED — superseded by the numbered migration sequence.
-- Equivalent coverage:
--   007_loyalty_reviews.sql — rewritten with Clerk TEXT IDs
-- ──────────────────────────────────────────────────────────────

-- ─── Place Reviews ────────────────────────────────────────────────────────────
-- Separate from loved places: structured star-rating + text per visit.

CREATE TABLE IF NOT EXISTS place_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id VARCHAR(255) NOT NULL,
    place_name VARCHAR(255),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT CHECK (char_length(review_text) <= 500),
    visit_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON place_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_place ON place_reviews(place_id);

-- ─── Points Transactions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS points_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL
        CHECK (transaction_type IN ('survey','review','check_in','first_visit','referral','redemption')),
    reference_id VARCHAR(255),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(user_id, created_at DESC);

-- ─── Rewards Catalog ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL,
    reward_type VARCHAR(50) CHECK (reward_type IN ('discount','free_item','experience')),
    terms TEXT,
    valid_until DATE,
    quantity_available INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Reward Redemptions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reward_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES rewards(id),
    redeemed_at TIMESTAMPTZ DEFAULT now(),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending','used','expired')),
    redemption_code VARCHAR(50) UNIQUE
);

-- ─── Users Table Extensions ───────────────────────────────────────────────────

-- Loyalty balance column (denormalized for fast reads)
ALTER TABLE users ADD COLUMN IF NOT EXISTS points_balance INTEGER DEFAULT 0;

-- Privacy settings
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_loved_places VARCHAR(20) DEFAULT 'friends';
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_activity VARCHAR(20) DEFAULT 'friends';
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_friend_requests BOOLEAN DEFAULT true;

-- Account deletion scheduling
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE place_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;

-- ─── Triggers ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS reviews_updated_at ON place_reviews;
CREATE TRIGGER reviews_updated_at
    BEFORE UPDATE ON place_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
