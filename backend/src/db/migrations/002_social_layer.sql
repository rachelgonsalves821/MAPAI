-- ================================================================
-- Mapai Migration 002 — Social Layer
--
-- Tables: blocks, reports, invite_links, user_loved_places,
--         activity_events, activity_reactions, activity_comments
--
-- All user-referencing columns use TEXT for Clerk IDs.
-- Depends on: 001_foundation.sql (places table for loved_places)
-- ================================================================

-- ─── visibility enum (idempotent) ────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_enum') THEN
        CREATE TYPE visibility_enum AS ENUM ('public', 'friends', 'private');
    END IF;
END $$;

-- ─── blocks ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blocks (
    id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id  TEXT  NOT NULL,
    blocked_id  TEXT  NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),

    UNIQUE (blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own blocks" ON blocks;
CREATE POLICY "Users manage own blocks"
    ON blocks FOR ALL
    USING (blocker_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── reports ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id  TEXT        NOT NULL,
    reported_id  TEXT        NOT NULL,
    report_type  VARCHAR(50) NOT NULL
                 CHECK (report_type IN ('spam', 'harassment', 'inappropriate', 'fake_account', 'other')),
    details      TEXT,
    status       VARCHAR(20) DEFAULT 'pending'
                 CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at   TIMESTAMPTZ DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reports" ON reports;
CREATE POLICY "Users can create reports"
    ON reports FOR INSERT
    WITH CHECK (reporter_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Users can view own reports" ON reports;
CREATE POLICY "Users can view own reports"
    ON reports FOR SELECT
    USING (reporter_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── invite_links ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invite_links (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id  TEXT         NOT NULL,
    token       VARCHAR(32)  UNIQUE NOT NULL,
    max_uses    INT          DEFAULT 1,
    use_count   INT          DEFAULT 0,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_links_token      ON invite_links(token);
CREATE INDEX IF NOT EXISTS idx_invite_links_creator_id ON invite_links(creator_id);

ALTER TABLE invite_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own invite links" ON invite_links;
CREATE POLICY "Users manage own invite links"
    ON invite_links FOR ALL
    USING (creator_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Invite links are publicly readable by token" ON invite_links;
CREATE POLICY "Invite links are publicly readable by token"
    ON invite_links FOR SELECT
    USING (true);

-- ─── user_loved_places ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_loved_places (
    id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id    TEXT             NOT NULL,
    place_id         VARCHAR(255)     NOT NULL,  -- Google Place ID

    -- Interaction data
    rating           SMALLINT         CHECK (rating BETWEEN 1 AND 5),
    is_pinned        BOOLEAN          DEFAULT false,
    visit_count      INT              DEFAULT 1,
    first_visited_at TIMESTAMPTZ      DEFAULT now(),
    last_visited_at  TIMESTAMPTZ      DEFAULT now(),

    -- Survey scores (1-5 scale)
    score_speed      SMALLINT         CHECK (score_speed  BETWEEN 1 AND 5),
    score_value      SMALLINT         CHECK (score_value  BETWEEN 1 AND 5),
    score_quality    SMALLINT         CHECK (score_quality BETWEEN 1 AND 5),

    -- Content
    personal_note    TEXT             CHECK (char_length(personal_note) <= 500),
    one_line_review  VARCHAR(140),

    -- Privacy
    visibility       visibility_enum  DEFAULT 'friends',

    -- Metadata
    created_at       TIMESTAMPTZ      DEFAULT now(),
    updated_at       TIMESTAMPTZ      DEFAULT now(),

    UNIQUE (clerk_user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_loved_places_user    ON user_loved_places(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_loved_places_place   ON user_loved_places(place_id);
CREATE INDEX IF NOT EXISTS idx_loved_places_updated ON user_loved_places(clerk_user_id, updated_at DESC);

ALTER TABLE user_loved_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Loved places visibility" ON user_loved_places;
CREATE POLICY "Loved places visibility"
    ON user_loved_places FOR SELECT
    USING (
        clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        OR visibility = 'public'
        OR (
            visibility = 'friends'
            AND EXISTS (
                SELECT 1 FROM friendships
                WHERE status = 'accepted'
                  AND (
                    (requester_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                     AND addressee_id = user_loved_places.clerk_user_id)
                    OR
                    (addressee_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                     AND requester_id = user_loved_places.clerk_user_id)
                  )
            )
            AND NOT EXISTS (
                SELECT 1 FROM blocks
                WHERE (blocker_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                       AND blocked_id = user_loved_places.clerk_user_id)
                   OR (blocker_id = user_loved_places.clerk_user_id
                       AND blocked_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'))
            )
        )
    );

DROP POLICY IF EXISTS "Users manage own loved places" ON user_loved_places;
CREATE POLICY "Users manage own loved places"
    ON user_loved_places FOR ALL
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP TRIGGER IF EXISTS loved_places_updated_at ON user_loved_places;
CREATE TRIGGER loved_places_updated_at
    BEFORE UPDATE ON user_loved_places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── activity_events ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_events (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id       TEXT        NOT NULL,
    activity_type  VARCHAR(50) NOT NULL
                   CHECK (activity_type IN ('place_visited', 'place_loved', 'review_posted', 'place_shared')),
    place_id       VARCHAR(255) NOT NULL,
    place_name     VARCHAR(255),
    metadata       JSONB        DEFAULT '{}',
    created_at     TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_actor   ON activity_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events(created_at DESC);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity visible to friends" ON activity_events;
CREATE POLICY "Activity visible to friends"
    ON activity_events FOR SELECT
    USING (
        actor_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        OR (
            EXISTS (
                SELECT 1 FROM friendships
                WHERE status = 'accepted'
                  AND (
                    (requester_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                     AND addressee_id = activity_events.actor_id)
                    OR
                    (addressee_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                     AND requester_id = activity_events.actor_id)
                  )
            )
            AND NOT EXISTS (
                SELECT 1 FROM blocks
                WHERE (blocker_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                       AND blocked_id = activity_events.actor_id)
                   OR (blocker_id = activity_events.actor_id
                       AND blocked_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'))
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert own activity" ON activity_events;
CREATE POLICY "Users can insert own activity"
    ON activity_events FOR INSERT
    WITH CHECK (actor_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── activity_reactions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_reactions (
    activity_id   UUID        NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
    clerk_user_id TEXT        NOT NULL,
    reaction      VARCHAR(20) NOT NULL
                  CHECK (reaction IN ('heart', 'fire', 'clap', 'drool', 'bookmark', 'question')),
    created_at    TIMESTAMPTZ DEFAULT now(),

    PRIMARY KEY (activity_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_activity ON activity_reactions(activity_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user     ON activity_reactions(clerk_user_id);

ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reactions" ON activity_reactions;
CREATE POLICY "Users manage own reactions"
    ON activity_reactions FOR ALL
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── activity_comments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_comments (
    id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id    UUID  NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
    clerk_user_id  TEXT  NOT NULL,
    text           TEXT  NOT NULL CHECK (char_length(text) <= 500),
    reply_to       UUID  REFERENCES activity_comments(id),
    deleted_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_activity ON activity_comments(activity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user     ON activity_comments(clerk_user_id);

ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own comments" ON activity_comments;
CREATE POLICY "Users manage own comments"
    ON activity_comments FOR ALL
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Friends can read comments" ON activity_comments;
CREATE POLICY "Friends can read comments"
    ON activity_comments FOR SELECT
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM activity_events ae
            WHERE ae.id = activity_comments.activity_id
        )
    );
