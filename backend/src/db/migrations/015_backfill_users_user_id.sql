-- ============================================================
-- Migration 015: Backfill users.user_id for rows created before
--                identity-service was updated to write user_id.
--
-- Before this fix, identity-service.ts inserted rows with
-- id = <supabase_auth_sub> but left user_id NULL.
-- loyalty-service.ts queries by user_id, so those rows were
-- invisible to balance lookups.
--
-- This backfill sets user_id = id for any row where user_id IS NULL,
-- since identity-service always set id to the Supabase auth sub.
-- Fully idempotent.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'user_id'
  ) THEN
    UPDATE public.users
    SET user_id = id::text
    WHERE user_id IS NULL;
    RAISE NOTICE 'Backfilled users.user_id from id for % rows', (SELECT COUNT(*) FROM public.users WHERE user_id IS NOT NULL);
  END IF;
END $$;
