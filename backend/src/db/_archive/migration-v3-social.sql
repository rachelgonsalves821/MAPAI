-- ================================================================
-- Mapai Database Migration v3 — Social Layer (Phase 1 MVP)
-- Run in Supabase SQL Editor after migration-v2-identity.sql
-- ================================================================
--
-- ARCHIVED — superseded by the numbered migration sequence.
-- Equivalent coverage:
--   002_social_layer.sql — rewritten with Clerk TEXT IDs
-- ================================================================

-- ─── Blocks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

-- ─── Reports ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL
        CHECK (report_type IN ('spam', 'harassment', 'inappropriate', 'fake_account', 'other')),
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- ─── Invite Links ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(32) UNIQUE NOT NULL,
    max_uses INT DEFAULT 1,
    use_count INT DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_links_token ON invite_links(token);

-- ─── Loved Places ────────────────────────────────────────────────
CREATE TYPE visibility_enum AS ENUM ('public', 'friends', 'private');

CREATE TABLE IF NOT EXISTS user_loved_places (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id VARCHAR(255) NOT NULL,  -- Google Place ID (e.g. ChIJ...)

    -- Interaction data
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    is_pinned BOOLEAN DEFAULT false,
    visit_count INT DEFAULT 1,
    first_visited_at TIMESTAMPTZ DEFAULT now(),
    last_visited_at TIMESTAMPTZ DEFAULT now(),

    -- Survey scores (1-5 scale)
    score_speed SMALLINT CHECK (score_speed BETWEEN 1 AND 5),
    score_value SMALLINT CHECK (score_value BETWEEN 1 AND 5),
    score_quality SMALLINT CHECK (score_quality BETWEEN 1 AND 5),

    -- Content
    personal_note TEXT CHECK (char_length(personal_note) <= 500),
    one_line_review VARCHAR(140),

    -- Privacy
    visibility visibility_enum DEFAULT 'friends',

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_loved_places_user ON user_loved_places(user_id);
CREATE INDEX IF NOT EXISTS idx_loved_places_place ON user_loved_places(place_id);
CREATE INDEX IF NOT EXISTS idx_loved_places_updated ON user_loved_places(user_id, updated_at DESC);

-- ─── Activity Events ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL
        CHECK (activity_type IN ('place_visited', 'place_loved', 'review_posted', 'place_shared')),
    place_id VARCHAR(255) NOT NULL,
    place_name VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events(created_at DESC);

-- ─── Activity Reactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_reactions (
    activity_id UUID NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction VARCHAR(20) NOT NULL
        CHECK (reaction IN ('heart', 'fire', 'clap', 'drool', 'bookmark', 'question')),
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (activity_id, user_id)
);

-- ─── Activity Comments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (char_length(text) <= 500),
    reply_to UUID REFERENCES activity_comments(id),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_activity ON activity_comments(activity_id, created_at);

-- ─── RLS Policies ────────────────────────────────────────────────

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_loved_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

-- Blocks: users see their own blocks only
DROP POLICY IF EXISTS "Users manage own blocks" ON blocks;
CREATE POLICY "Users manage own blocks" ON blocks
    FOR ALL USING (auth.uid() = blocker_id);

-- Loved places: respect visibility + blocks
DROP POLICY IF EXISTS "Loved places visibility" ON user_loved_places;
CREATE POLICY "Loved places visibility" ON user_loved_places
    FOR SELECT USING (
        user_id = auth.uid()
        OR visibility = 'public'
        OR (
            visibility = 'friends'
            AND EXISTS (
                SELECT 1 FROM friendships
                WHERE (user_id = auth.uid() AND friend_id = user_loved_places.user_id)
                   OR (friend_id = auth.uid() AND user_id = user_loved_places.user_id)
            )
            AND NOT EXISTS (
                SELECT 1 FROM blocks
                WHERE (blocker_id = auth.uid() AND blocked_id = user_loved_places.user_id)
                   OR (blocker_id = user_loved_places.user_id AND blocked_id = auth.uid())
            )
        )
    );

DROP POLICY IF EXISTS "Users manage own loved places" ON user_loved_places;
CREATE POLICY "Users manage own loved places" ON user_loved_places
    FOR ALL USING (user_id = auth.uid());

-- Activity events: visible to friends, excluding blocks
DROP POLICY IF EXISTS "Activity visible to friends" ON activity_events;
CREATE POLICY "Activity visible to friends" ON activity_events
    FOR SELECT USING (
        actor_id = auth.uid()
        OR (
            EXISTS (
                SELECT 1 FROM friendships
                WHERE (user_id = auth.uid() AND friend_id = activity_events.actor_id)
                   OR (friend_id = auth.uid() AND user_id = activity_events.actor_id)
            )
            AND NOT EXISTS (
                SELECT 1 FROM blocks
                WHERE (blocker_id = auth.uid() AND blocked_id = activity_events.actor_id)
                   OR (blocker_id = activity_events.actor_id AND blocked_id = auth.uid())
            )
        )
    );

-- Triggers
DROP TRIGGER IF EXISTS loved_places_updated_at ON user_loved_places;
CREATE TRIGGER loved_places_updated_at
    BEFORE UPDATE ON user_loved_places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Friendship limit (500 max) ──────────────────────────────────
CREATE OR REPLACE FUNCTION check_friendship_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM friendships WHERE user_id = NEW.user_id OR friend_id = NEW.user_id) >= 500 THEN
        RAISE EXCEPTION 'Friend limit reached (500 max)';
    END IF;
    IF (SELECT COUNT(*) FROM friendships WHERE user_id = NEW.friend_id OR friend_id = NEW.friend_id) >= 500 THEN
        RAISE EXCEPTION 'Target user has reached friend limit (500 max)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_friendship_limit ON friendships;
CREATE TRIGGER enforce_friendship_limit
    BEFORE INSERT ON friendships
    FOR EACH ROW EXECUTE FUNCTION check_friendship_limit();
