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
