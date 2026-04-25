-- ============================================================
-- Migration 009: Rename clerk_user_id → user_id across all tables
-- ============================================================
-- Clerk has been removed. All tables that used clerk_user_id as
-- the identity anchor now use user_id (Supabase Auth UUID).
--
-- This migration is fully idempotent and safe to run against any
-- partial schema — every statement is guarded by an existence
-- check so missing tables are silently skipped.
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN

  -- ── 1. Rename clerk_user_id → user_id on every affected table ──────────────

  FOREACH t IN ARRAY ARRAY[
    'users', 'user_preferences', 'visits', 'surveys',
    'user_loved_places', 'activity_reactions', 'activity_comments',
    'user_profiles', 'place_reviews', 'points_transactions',
    'reward_redemptions', 'planning_members', 'planning_votes',
    'planning_messages'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = t
        AND column_name  = 'clerk_user_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN clerk_user_id TO user_id', t);
      RAISE NOTICE 'Renamed clerk_user_id → user_id on table %', t;
    END IF;
  END LOOP;


  -- ── 2. Rebuild RLS policies using auth.uid() ────────────────────────────────
  -- Only operate on tables that exist in the schema.

  -- users
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') THEN
    DROP POLICY IF EXISTS "Users can read own data"   ON users;
    DROP POLICY IF EXISTS "Users can update own data" ON users;
    DROP POLICY IF EXISTS "Users can insert own data" ON users;
    EXECUTE $p$ CREATE POLICY "Users can read own data"   ON users FOR SELECT USING (user_id = auth.uid()::text) $p$;
    EXECUTE $p$ CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (user_id = auth.uid()::text) $p$;
    EXECUTE $p$ CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- user_preferences
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_preferences') THEN
    DROP POLICY IF EXISTS "Users manage own preferences"        ON user_preferences;
    DROP POLICY IF EXISTS "Users can read own preferences"      ON user_preferences;
    DROP POLICY IF EXISTS "Users can update own preferences"    ON user_preferences;
    DROP POLICY IF EXISTS "Users can insert own preferences"    ON user_preferences;
    DROP POLICY IF EXISTS "Users can delete own preferences"    ON user_preferences;
    EXECUTE $p$ CREATE POLICY "Users manage own preferences" ON user_preferences FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- visits
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='visits') THEN
    DROP POLICY IF EXISTS "Users manage own visits"    ON visits;
    DROP POLICY IF EXISTS "Users can read own visits"  ON visits;
    EXECUTE $p$ CREATE POLICY "Users manage own visits" ON visits FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- surveys
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='surveys') THEN
    DROP POLICY IF EXISTS "Users manage own surveys" ON surveys;
    EXECUTE $p$ CREATE POLICY "Users manage own surveys" ON surveys FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- user_loved_places
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_loved_places') THEN
    DROP POLICY IF EXISTS "Users manage own loved places" ON user_loved_places;
    EXECUTE $p$ CREATE POLICY "Users manage own loved places" ON user_loved_places FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- activity_reactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_reactions') THEN
    DROP POLICY IF EXISTS "Users manage own reactions" ON activity_reactions;
    EXECUTE $p$ CREATE POLICY "Users manage own reactions" ON activity_reactions FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- activity_comments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_comments') THEN
    DROP POLICY IF EXISTS "Users manage own comments" ON activity_comments;
    EXECUTE $p$ CREATE POLICY "Users manage own comments" ON activity_comments FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- user_profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
    DROP POLICY IF EXISTS "Users manage own profile"      ON user_profiles;
    DROP POLICY IF EXISTS "Users can update own profile"  ON user_profiles;
    DROP POLICY IF EXISTS "Users can read own profile"    ON user_profiles;
    EXECUTE $p$ CREATE POLICY "Users manage own profile" ON user_profiles FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- place_reviews
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='place_reviews') THEN
    DROP POLICY IF EXISTS "Users manage own reviews" ON place_reviews;
    EXECUTE $p$ CREATE POLICY "Users manage own reviews" ON place_reviews FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- points_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='points_transactions') THEN
    DROP POLICY IF EXISTS "Users read own points" ON points_transactions;
    EXECUTE $p$ CREATE POLICY "Users read own points" ON points_transactions FOR SELECT USING (user_id = auth.uid()::text) $p$;
  END IF;

  -- reward_redemptions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reward_redemptions') THEN
    DROP POLICY IF EXISTS "Users manage own redemptions" ON reward_redemptions;
    EXECUTE $p$ CREATE POLICY "Users manage own redemptions" ON reward_redemptions FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- planning_members
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='planning_members') THEN
    DROP POLICY IF EXISTS "Members manage own membership" ON planning_members;
    EXECUTE $p$ CREATE POLICY "Members manage own membership" ON planning_members FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- planning_votes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='planning_votes') THEN
    DROP POLICY IF EXISTS "Members manage own votes" ON planning_votes;
    EXECUTE $p$ CREATE POLICY "Members manage own votes" ON planning_votes FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- planning_messages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='planning_messages') THEN
    DROP POLICY IF EXISTS "Members manage own messages" ON planning_messages;
    EXECUTE $p$ CREATE POLICY "Members manage own messages" ON planning_messages FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;


  -- ── 3. Rebuild indexes with new column name ─────────────────────────────────

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') THEN
    DROP INDEX IF EXISTS idx_users_clerk_id;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_preferences') THEN
    DROP INDEX IF EXISTS idx_user_prefs_clerk_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_prefs_user_id ON user_preferences(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='visits') THEN
    DROP INDEX IF EXISTS idx_visits_clerk_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_visits_user_id ON visits(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_loved_places') THEN
    DROP INDEX IF EXISTS idx_loved_places_user;
    DROP INDEX IF EXISTS idx_loved_places_updated;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_loved_places_user    ON user_loved_places(user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_loved_places_updated ON user_loved_places(user_id, updated_at DESC)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_reactions') THEN
    DROP INDEX IF EXISTS idx_reactions_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reactions_user ON activity_reactions(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_comments') THEN
    DROP INDEX IF EXISTS idx_comments_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_comments_user ON activity_comments(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='place_reviews') THEN
    DROP INDEX IF EXISTS idx_reviews_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reviews_user ON place_reviews(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='points_transactions') THEN
    DROP INDEX IF EXISTS idx_points_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(user_id, created_at DESC)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reward_redemptions') THEN
    DROP INDEX IF EXISTS idx_redemptions_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_redemptions_user ON reward_redemptions(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='planning_votes') THEN
    DROP INDEX IF EXISTS idx_planning_votes_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_planning_votes_user ON planning_votes(user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='planning_members') THEN
    DROP INDEX IF EXISTS idx_planning_members_user_id;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_planning_members_user_id ON planning_members(user_id)';
  END IF;

  RAISE NOTICE 'Migration 009 complete.';

END $$;
