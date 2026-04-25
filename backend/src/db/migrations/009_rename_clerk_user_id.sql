-- ============================================================
-- Migration 009: Rename clerk_user_id → user_id across all tables
-- ============================================================
-- Clerk has been removed from the backend. All tables that used
-- clerk_user_id as the identity anchor now use user_id, which
-- holds the Supabase Auth UUID (JWT "sub" claim).
--
-- RLS policies are also updated to reference auth.uid() instead
-- of the raw JWT claims string, which is the correct Supabase-native
-- approach and is more reliable than parsing JWT claims manually.
--
-- Tables affected:
--   users, user_preferences, visits, surveys (migration 001)
--   user_loved_places, activity_reactions, activity_comments (migration 002)
--   user_profiles (migration 003)
--   place_reviews, points_transactions, reward_redemptions (migration 007)
--   planning_votes, planning_items (migration 006)
-- ============================================================

-- ─── Helper: only rename if the column still has the old name ────────────────

DO $$
BEGIN
  -- users
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='clerk_user_id') THEN
    ALTER TABLE users RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- user_preferences
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='clerk_user_id') THEN
    ALTER TABLE user_preferences RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- visits
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visits' AND column_name='clerk_user_id') THEN
    ALTER TABLE visits RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- surveys
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surveys' AND column_name='clerk_user_id') THEN
    ALTER TABLE surveys RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- user_loved_places
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_loved_places' AND column_name='clerk_user_id') THEN
    ALTER TABLE user_loved_places RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- activity_reactions
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activity_reactions' AND column_name='clerk_user_id') THEN
    ALTER TABLE activity_reactions RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- activity_comments
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activity_comments' AND column_name='clerk_user_id') THEN
    ALTER TABLE activity_comments RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- user_profiles
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='clerk_user_id') THEN
    ALTER TABLE user_profiles RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- place_reviews
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='place_reviews' AND column_name='clerk_user_id') THEN
    ALTER TABLE place_reviews RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- points_transactions
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points_transactions' AND column_name='clerk_user_id') THEN
    ALTER TABLE points_transactions RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- reward_redemptions
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reward_redemptions' AND column_name='clerk_user_id') THEN
    ALTER TABLE reward_redemptions RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- planning_votes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planning_votes' AND column_name='clerk_user_id') THEN
    ALTER TABLE planning_votes RENAME COLUMN clerk_user_id TO user_id;
  END IF;

  -- planning_items
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planning_items' AND column_name='clerk_user_id') THEN
    ALTER TABLE planning_items RENAME COLUMN clerk_user_id TO user_id;
  END IF;
END $$;

-- ─── Update RLS policies to use auth.uid() ───────────────────────────────────
-- Drop old clerk-based policies and replace with Supabase-native auth.uid().

-- users
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can delete own data" ON users;
CREATE POLICY "Users can read own data"   ON users FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (user_id = auth.uid()::text);
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- user_preferences
DROP POLICY IF EXISTS "Users manage own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Users manage own preferences" ON user_preferences FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- visits
DROP POLICY IF EXISTS "Users manage own visits" ON visits;
DROP POLICY IF EXISTS "Users can read own visits" ON visits;
CREATE POLICY "Users manage own visits" ON visits FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- surveys
DROP POLICY IF EXISTS "Users manage own surveys" ON surveys;
CREATE POLICY "Users manage own surveys" ON surveys FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- user_loved_places (manage policy)
DROP POLICY IF EXISTS "Users manage own loved places" ON user_loved_places;
CREATE POLICY "Users manage own loved places" ON user_loved_places FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- activity_reactions
DROP POLICY IF EXISTS "Users manage own reactions" ON activity_reactions;
CREATE POLICY "Users manage own reactions" ON activity_reactions FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- activity_comments
DROP POLICY IF EXISTS "Users manage own comments" ON activity_comments;
CREATE POLICY "Users manage own comments" ON activity_comments FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- user_profiles
DROP POLICY IF EXISTS "Users manage own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users manage own profile" ON user_profiles FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- place_reviews
DROP POLICY IF EXISTS "Users manage own reviews" ON place_reviews;
CREATE POLICY "Users manage own reviews" ON place_reviews FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- points_transactions
DROP POLICY IF EXISTS "Users read own points" ON points_transactions;
CREATE POLICY "Users read own points" ON points_transactions FOR SELECT
  USING (user_id = auth.uid()::text);

-- reward_redemptions
DROP POLICY IF EXISTS "Users manage own redemptions" ON reward_redemptions;
CREATE POLICY "Users manage own redemptions" ON reward_redemptions FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- planning_votes
DROP POLICY IF EXISTS "Members manage own votes" ON planning_votes;
CREATE POLICY "Members manage own votes" ON planning_votes FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- planning_items
DROP POLICY IF EXISTS "Members manage own items" ON planning_items;
CREATE POLICY "Members manage own items" ON planning_items FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ─── Rebuild indexes with new column name ────────────────────────────────────

DROP INDEX IF EXISTS idx_users_clerk_id;
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);

DROP INDEX IF EXISTS idx_user_prefs_clerk_user;
CREATE INDEX IF NOT EXISTS idx_user_prefs_user_id ON user_preferences(user_id);

DROP INDEX IF EXISTS idx_visits_clerk_user;
CREATE INDEX IF NOT EXISTS idx_visits_user_id ON visits(user_id);

DROP INDEX IF EXISTS idx_loved_places_user;
DROP INDEX IF EXISTS idx_loved_places_updated;
CREATE INDEX IF NOT EXISTS idx_loved_places_user    ON user_loved_places(user_id);
CREATE INDEX IF NOT EXISTS idx_loved_places_updated ON user_loved_places(user_id, updated_at DESC);

DROP INDEX IF EXISTS idx_reactions_user;
CREATE INDEX IF NOT EXISTS idx_reactions_user ON activity_reactions(user_id);

DROP INDEX IF EXISTS idx_comments_user;
CREATE INDEX IF NOT EXISTS idx_comments_user ON activity_comments(user_id);

DROP INDEX IF EXISTS idx_reviews_user;
CREATE INDEX IF NOT EXISTS idx_reviews_user ON place_reviews(user_id);

DROP INDEX IF EXISTS idx_points_user;
CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(user_id, created_at DESC);

DROP INDEX IF EXISTS idx_redemptions_user;
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON reward_redemptions(user_id);

DROP INDEX IF EXISTS idx_planning_votes_user;
CREATE INDEX IF NOT EXISTS idx_planning_votes_user ON planning_votes(user_id);
