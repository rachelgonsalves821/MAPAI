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
-- ═══════════════════════════════════════════════════════════════════════════
-- Mapai Migration 005 — chat_sessions + chat_messages
--
-- Persists the AI conversation history for each user.
-- Sessions group messages into named conversations; messages store the
-- turn-by-turn transcript including tool-call metadata as JSONB.
--
-- Depends on: 003_user_profiles.sql (clerk_user_id identity anchor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── chat_sessions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id TEXT        NOT NULL,
  title         TEXT,                         -- auto-generated or user-edited
  summary       TEXT,                         -- AI-generated 1-2 sentence session summary
  message_count INTEGER     DEFAULT 0,        -- denormalized for fast list display
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()     -- bumped on each new message
);

-- ─── chat_messages ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    UUID        NOT NULL
                            REFERENCES public.chat_sessions(id)
                            ON DELETE CASCADE,
  clerk_user_id TEXT        NOT NULL,
  role          TEXT        NOT NULL
                            CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT        NOT NULL,
  metadata      JSONB       DEFAULT '{}',     -- tool calls, citations, model id …
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Paginated session list ordered by recency
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON public.chat_sessions (clerk_user_id, updated_at DESC);

-- Full transcript fetch for a single session
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON public.chat_messages (session_id, created_at);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Sessions: full ownership — users see and manipulate only their own sessions
CREATE POLICY "Users own their sessions"
  ON public.chat_sessions
  FOR ALL
  USING (
    clerk_user_id = (
      current_setting('request.jwt.claims', true)::json ->> 'sub'
    )
  );

-- Messages: full ownership — users see and manipulate only their own messages
CREATE POLICY "Users own their messages"
  ON public.chat_messages
  FOR ALL
  USING (
    clerk_user_id = (
      current_setting('request.jwt.claims', true)::json ->> 'sub'
    )
  );
-- ================================================================
-- Mapai Migration 006 — Collaborative Trip Planning
--
-- Tables: planning_sessions, planning_members, planning_suggestions,
--         planning_votes, planning_messages
--
-- All user-referencing columns use TEXT for Clerk IDs.
-- Depends on: 003_user_profiles.sql (clerk_user_id identity anchor)
-- ================================================================

-- ─── planning_sessions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_sessions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id       TEXT        NOT NULL,
    title            VARCHAR(100) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'decided', 'archived')),
    decided_place_id VARCHAR(255),
    decided_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_sessions_creator ON planning_sessions(creator_id);
CREATE INDEX IF NOT EXISTS idx_planning_sessions_status  ON planning_sessions(status);

-- ─── planning_members ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    clerk_user_id TEXT      NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'member'
                CHECK (role IN ('creator', 'member')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (session_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_members_session_id ON planning_members(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_members_user_id    ON planning_members(clerk_user_id);

-- ─── planning_suggestions ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_suggestions (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID         NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    suggested_by   TEXT         NOT NULL,
    place_id       VARCHAR(255) NOT NULL,
    place_name     VARCHAR(255) NOT NULL,
    place_address  VARCHAR(500),
    place_location JSONB,
    note           TEXT         CHECK (char_length(note) <= 300),
    vote_count     INT          NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (session_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_suggestions_session_id ON planning_suggestions(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_suggestions_suggested  ON planning_suggestions(suggested_by);

-- ─── planning_votes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_votes (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID        NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    suggestion_id  UUID        NOT NULL REFERENCES planning_suggestions(id) ON DELETE CASCADE,
    clerk_user_id  TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One vote per user per session
    UNIQUE (session_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_votes_session_id    ON planning_votes(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_votes_suggestion_id ON planning_votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_planning_votes_user          ON planning_votes(clerk_user_id);

-- ─── planning_messages ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_messages (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID        NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    clerk_user_id  TEXT        NOT NULL,
    text           TEXT        NOT NULL CHECK (char_length(text) <= 500),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_messages_session_id ON planning_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_messages_created_at ON planning_messages(session_id, created_at);

-- ─── updated_at trigger ──────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_planning_sessions_updated_at ON planning_sessions;
CREATE TRIGGER trg_planning_sessions_updated_at
    BEFORE UPDATE ON planning_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────

ALTER TABLE planning_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_votes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_messages    ENABLE ROW LEVEL SECURITY;

-- planning_sessions: members can read; creator can write

DROP POLICY IF EXISTS "session_member_read" ON planning_sessions;
CREATE POLICY "session_member_read"
    ON planning_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_sessions.id
              AND planning_members.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );

DROP POLICY IF EXISTS "session_creator_write" ON planning_sessions;
CREATE POLICY "session_creator_write"
    ON planning_sessions FOR ALL
    USING (creator_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- planning_members: visible to other session members

DROP POLICY IF EXISTS "member_read" ON planning_members;
CREATE POLICY "member_read"
    ON planning_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members pm2
            WHERE pm2.session_id = planning_members.session_id
              AND pm2.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );

DROP POLICY IF EXISTS "member_insert_self" ON planning_members;
CREATE POLICY "member_insert_self"
    ON planning_members FOR INSERT
    WITH CHECK (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- planning_suggestions: session members can read and insert

DROP POLICY IF EXISTS "suggestion_member_read" ON planning_suggestions;
CREATE POLICY "suggestion_member_read"
    ON planning_suggestions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_suggestions.session_id
              AND planning_members.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );

DROP POLICY IF EXISTS "suggestion_member_insert" ON planning_suggestions;
CREATE POLICY "suggestion_member_insert"
    ON planning_suggestions FOR INSERT
    WITH CHECK (
        suggested_by = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        AND EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_suggestions.session_id
              AND planning_members.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );

DROP POLICY IF EXISTS "suggestion_vote_count_update" ON planning_suggestions;
CREATE POLICY "suggestion_vote_count_update"
    ON planning_suggestions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_suggestions.session_id
              AND planning_members.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );

-- planning_votes: session members can read and write

DROP POLICY IF EXISTS "vote_member_read" ON planning_votes;
CREATE POLICY "vote_member_read"
    ON planning_votes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_votes.session_id
              AND planning_members.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );

DROP POLICY IF EXISTS "vote_member_write" ON planning_votes;
CREATE POLICY "vote_member_write"
    ON planning_votes FOR ALL
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- planning_messages: session members can read and insert

DROP POLICY IF EXISTS "message_member_read" ON planning_messages;
CREATE POLICY "message_member_read"
    ON planning_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_messages.session_id
              AND planning_members.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );

DROP POLICY IF EXISTS "message_member_insert" ON planning_messages;
CREATE POLICY "message_member_insert"
    ON planning_messages FOR INSERT
    WITH CHECK (
        clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        AND EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_messages.session_id
              AND planning_members.clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        )
    );
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
-- ═══════════════════════════════════════════════════════════════════════════
-- Mapai Migration 009 — Add phone column to user_profiles
--
-- Enables phone-based contact matching in POST /v1/friends/match-contacts.
-- Phone numbers are stored in E.164 format (e.g. +16175551234).
--
-- Run order: after 003_user_profiles.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Index for contact-sync lookups (IN-list queries)
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone
  ON public.user_profiles (phone)
  WHERE phone IS NOT NULL;
