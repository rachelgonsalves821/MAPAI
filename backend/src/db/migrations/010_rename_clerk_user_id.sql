-- ================================================================
-- Mapai Migration 009 — Rename clerk_user_id → user_id
--
-- Aligns table column names with the service layer that already
-- uses user_id.  Uses conditional DO blocks so the migration is
-- safe to re-run.
-- ================================================================

-- ─── user_loved_places ───────────────────────────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'user_loved_places' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE user_loved_places RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_loved_places_user;
CREATE INDEX IF NOT EXISTS idx_loved_places_user    ON user_loved_places(user_id);

DROP INDEX IF EXISTS idx_loved_places_updated;
CREATE INDEX IF NOT EXISTS idx_loved_places_updated ON user_loved_places(user_id, updated_at DESC);

-- Unique constraint rename (drop old, add new)
ALTER TABLE user_loved_places DROP CONSTRAINT IF EXISTS user_loved_places_clerk_user_id_place_id_key;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE table_name = 'user_loved_places'
                     AND constraint_name = 'user_loved_places_user_id_place_id_key') THEN
        ALTER TABLE user_loved_places ADD CONSTRAINT user_loved_places_user_id_place_id_key
            UNIQUE (user_id, place_id);
    END IF;
END $$;

-- RLS policies (drop and recreate to reference new column name)
DROP POLICY IF EXISTS "Loved places visibility"        ON user_loved_places;
DROP POLICY IF EXISTS "Users manage own loved places"  ON user_loved_places;

CREATE POLICY "Loved places visibility"
    ON user_loved_places FOR SELECT
    USING (
        user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
        OR visibility = 'public'
        OR (
            visibility = 'friends'
            AND EXISTS (
                SELECT 1 FROM friendships
                WHERE status = 'accepted'
                  AND (
                    (requester_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                     AND addressee_id = user_loved_places.user_id)
                    OR
                    (addressee_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                     AND requester_id = user_loved_places.user_id)
                  )
            )
            AND NOT EXISTS (
                SELECT 1 FROM blocks
                WHERE (blocker_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
                       AND blocked_id = user_loved_places.user_id)
                   OR (blocker_id = user_loved_places.user_id
                       AND blocked_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'))
            )
        )
    );

CREATE POLICY "Users manage own loved places"
    ON user_loved_places FOR ALL
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── place_reviews ───────────────────────────────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'place_reviews' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE place_reviews RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_reviews_user;
CREATE INDEX IF NOT EXISTS idx_reviews_user ON place_reviews(user_id);

ALTER TABLE place_reviews DROP CONSTRAINT IF EXISTS place_reviews_clerk_user_id_place_id_key;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE table_name = 'place_reviews'
                     AND constraint_name = 'place_reviews_user_id_place_id_key') THEN
        ALTER TABLE place_reviews ADD CONSTRAINT place_reviews_user_id_place_id_key
            UNIQUE (user_id, place_id);
    END IF;
END $$;

DROP POLICY IF EXISTS "Users manage own reviews"     ON place_reviews;
DROP POLICY IF EXISTS "Reviews are publicly readable" ON place_reviews;

CREATE POLICY "Users manage own reviews"
    ON place_reviews FOR ALL
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

CREATE POLICY "Reviews are publicly readable"
    ON place_reviews FOR SELECT
    USING (true);

-- ─── points_transactions ─────────────────────────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'points_transactions' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE points_transactions RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_points_user;
CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(user_id, created_at DESC);

DROP POLICY IF EXISTS "Users can read own points" ON points_transactions;
CREATE POLICY "Users can read own points"
    ON points_transactions FOR SELECT
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── reward_redemptions ──────────────────────────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'reward_redemptions' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE reward_redemptions RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_redemptions_user;
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON reward_redemptions(user_id);

DROP POLICY IF EXISTS "Users can view own redemptions"   ON reward_redemptions;
DROP POLICY IF EXISTS "Users can create own redemptions" ON reward_redemptions;

CREATE POLICY "Users can view own redemptions"
    ON reward_redemptions FOR SELECT
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

CREATE POLICY "Users can create own redemptions"
    ON reward_redemptions FOR INSERT
    WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── activity_reactions ──────────────────────────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'activity_reactions' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE activity_reactions RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_reactions_user;
CREATE INDEX IF NOT EXISTS idx_reactions_user ON activity_reactions(user_id);

DROP POLICY IF EXISTS "Users manage own reactions" ON activity_reactions;
CREATE POLICY "Users manage own reactions"
    ON activity_reactions FOR ALL
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── activity_comments ───────────────────────────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'activity_comments' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE activity_comments RENAME COLUMN clerk_user_id TO user_id;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_comments_user;
CREATE INDEX IF NOT EXISTS idx_comments_user ON activity_comments(user_id);

DROP POLICY IF EXISTS "Users manage own comments" ON activity_comments;
CREATE POLICY "Users manage own comments"
    ON activity_comments FOR ALL
    USING (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));
