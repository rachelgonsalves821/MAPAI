-- ============================================================
-- Mapai — Migration v4: Collaborative Trip Planning
-- Tables: planning_sessions, planning_members, planning_suggestions,
--         planning_votes, planning_messages
-- ============================================================
--
-- ARCHIVED — superseded by the numbered migration sequence.
-- Equivalent coverage:
--   006_planning.sql — rewritten with Clerk TEXT IDs
-- ============================================================

-- ─── planning_sessions ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(100) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'decided', 'archived')),
    decided_place_id VARCHAR(255),
    decided_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── planning_members ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL DEFAULT 'member'
                CHECK (role IN ('creator', 'member')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, user_id)
);

-- ─── planning_suggestions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_suggestions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    suggested_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id        VARCHAR(255) NOT NULL,
    place_name      VARCHAR(255) NOT NULL,
    place_address   VARCHAR(500),
    place_location  JSONB,
    note            TEXT CHECK (char_length(note) <= 300),
    vote_count      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, place_id)
);

-- ─── planning_votes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    suggestion_id   UUID NOT NULL REFERENCES planning_suggestions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, user_id)
);

-- ─── planning_messages ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS planning_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text        TEXT NOT NULL CHECK (char_length(text) <= 500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_planning_members_session_id     ON planning_members(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_members_user_id        ON planning_members(user_id);
CREATE INDEX IF NOT EXISTS idx_planning_suggestions_session_id ON planning_suggestions(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_votes_session_id       ON planning_votes(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_votes_suggestion_id    ON planning_votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_planning_messages_session_id    ON planning_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_planning_messages_created_at    ON planning_messages(session_id, created_at);

-- ─── updated_at trigger ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_planning_sessions_updated_at ON planning_sessions;
CREATE TRIGGER trg_planning_sessions_updated_at
    BEFORE UPDATE ON planning_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ───────────────────────────────────────

ALTER TABLE planning_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_votes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_messages    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_member_read" ON planning_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_sessions.id
              AND planning_members.user_id = auth.uid()
        )
    );

CREATE POLICY "session_creator_write" ON planning_sessions
    FOR ALL
    USING (creator_id = auth.uid());

CREATE POLICY "member_read" ON planning_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members pm2
            WHERE pm2.session_id = planning_members.session_id
              AND pm2.user_id = auth.uid()
        )
    );

CREATE POLICY "member_insert_self" ON planning_members
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "suggestion_member_read" ON planning_suggestions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_suggestions.session_id
              AND planning_members.user_id = auth.uid()
        )
    );

CREATE POLICY "suggestion_member_insert" ON planning_suggestions
    FOR INSERT
    WITH CHECK (
        suggested_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_suggestions.session_id
              AND planning_members.user_id = auth.uid()
        )
    );

CREATE POLICY "suggestion_vote_count_update" ON planning_suggestions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_suggestions.session_id
              AND planning_members.user_id = auth.uid()
        )
    );

CREATE POLICY "vote_member_read" ON planning_votes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_votes.session_id
              AND planning_members.user_id = auth.uid()
        )
    );

CREATE POLICY "vote_member_write" ON planning_votes
    FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "message_member_read" ON planning_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_messages.session_id
              AND planning_members.user_id = auth.uid()
        )
    );

CREATE POLICY "message_member_insert" ON planning_messages
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM planning_members
            WHERE planning_members.session_id = planning_messages.session_id
              AND planning_members.user_id = auth.uid()
        )
    );
