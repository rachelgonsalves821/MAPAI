-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008 — Activity Views & Recent Places
--
-- Adds:
--   1. recent_places_viewed  — per-user table of the last 50 places a user has
--                              opened the detail screen for. Powers the "Recently
--                              Viewed" section in the Social / Profile tab.
--   2. Expands the activity_events.activity_type CHECK constraint to include
--      'place_viewed' so the activity feed can surface view events.
--   3. Fixes activity_reactions.clerk_user_id → user_id column name mismatch
--      (the service writes 'user_id' but the table was created with 'clerk_user_id').
--   4. Adds a composite unique index on recent_places_viewed so upsert works.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. recent_places_viewed ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recent_places_viewed (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT         NOT NULL,
    place_id     VARCHAR(255) NOT NULL,
    place_name   VARCHAR(255),
    -- Cached lat/lng so the map can render pins without a Places API call
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    -- Category for icon rendering (e.g. 'restaurant', 'cafe')
    category     VARCHAR(100),
    view_count   INTEGER      NOT NULL DEFAULT 1,
    first_viewed_at TIMESTAMPTZ DEFAULT now(),
    last_viewed_at  TIMESTAMPTZ DEFAULT now()
);

-- Composite unique so upsert on (user_id, place_id) works
CREATE UNIQUE INDEX IF NOT EXISTS idx_recent_views_user_place
    ON recent_places_viewed(user_id, place_id);

-- Index for fast per-user lookups ordered by recency
CREATE INDEX IF NOT EXISTS idx_recent_views_user_recent
    ON recent_places_viewed(user_id, last_viewed_at DESC);

-- Keep the table lean — only the 50 most recent rows per user matter.
-- A trigger prunes older rows automatically after each insert/update.
CREATE OR REPLACE FUNCTION prune_recent_views() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM recent_places_viewed
    WHERE user_id = NEW.user_id
      AND id NOT IN (
          SELECT id FROM recent_places_viewed
          WHERE user_id = NEW.user_id
          ORDER BY last_viewed_at DESC
          LIMIT 50
      );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prune_recent_views ON recent_places_viewed;
CREATE TRIGGER trg_prune_recent_views
    AFTER INSERT OR UPDATE ON recent_places_viewed
    FOR EACH ROW EXECUTE FUNCTION prune_recent_views();

-- RLS — users can only see and write their own rows
ALTER TABLE recent_places_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own recent views" ON recent_places_viewed;
CREATE POLICY "Users manage own recent views"
    ON recent_places_viewed FOR ALL
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── 2. Expand activity_events activity_type CHECK ───────────────────────────
-- PostgreSQL does not support ALTER CONSTRAINT directly; we drop and recreate.
ALTER TABLE activity_events
    DROP CONSTRAINT IF EXISTS activity_events_activity_type_check;

ALTER TABLE activity_events
    ADD CONSTRAINT activity_events_activity_type_check
    CHECK (activity_type IN (
        'place_visited',
        'place_loved',
        'place_viewed',
        'review_posted',
        'place_shared'
    ));

-- ─── 3. Fix activity_reactions column name mismatch ──────────────────────────
-- The social-service.ts writes { user_id: ... } but the table was created with
-- clerk_user_id. Rename the column so the service works without code changes.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activity_reactions'
          AND column_name = 'clerk_user_id'
    ) THEN
        ALTER TABLE activity_reactions RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

-- Recreate the index with the correct column name
DROP INDEX IF EXISTS idx_reactions_user;
CREATE INDEX IF NOT EXISTS idx_reactions_user ON activity_reactions(user_id);

-- Update the RLS policy to use the renamed column
ALTER TABLE activity_reactions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own reactions" ON activity_reactions;
ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reactions"
    ON activity_reactions FOR ALL
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── 4. Add composite index on user_loved_places for fast per-user queries ────
-- Note: the column is clerk_user_id (not user_id) — this matches migration 002.
CREATE INDEX IF NOT EXISTS idx_loved_places_user_updated
    ON user_loved_places(clerk_user_id, updated_at DESC);
