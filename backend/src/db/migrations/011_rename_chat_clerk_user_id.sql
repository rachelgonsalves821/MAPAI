-- ============================================================
-- Migration 011: Rename clerk_user_id → user_id on chat tables
-- ============================================================
-- Migrations 009 and 010 omitted chat_sessions and chat_messages.
-- This migration completes the rename for those two tables and
-- rebuilds their RLS policies to use auth.uid() (Supabase Auth).
--
-- Fully idempotent — every statement is guarded by a column/table
-- existence check so it is safe to re-run.
-- ============================================================

DO $$
BEGIN

  -- ── 1. chat_sessions: rename column ───────────────────────────────────────

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_sessions'
      AND column_name  = 'clerk_user_id'
  ) THEN
    ALTER TABLE public.chat_sessions RENAME COLUMN clerk_user_id TO user_id;
    RAISE NOTICE 'Renamed clerk_user_id → user_id on chat_sessions';
  END IF;

  -- ── 2. chat_messages: rename column ───────────────────────────────────────

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'clerk_user_id'
  ) THEN
    ALTER TABLE public.chat_messages RENAME COLUMN clerk_user_id TO user_id;
    RAISE NOTICE 'Renamed clerk_user_id → user_id on chat_messages';
  END IF;

  -- ── 3. Rebuild RLS policies ────────────────────────────────────────────────

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_sessions') THEN
    DROP POLICY IF EXISTS "Users own their sessions" ON public.chat_sessions;
    EXECUTE $p$ CREATE POLICY "Users own their sessions" ON public.chat_sessions FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_messages') THEN
    DROP POLICY IF EXISTS "Users own their messages" ON public.chat_messages;
    EXECUTE $p$ CREATE POLICY "Users own their messages" ON public.chat_messages FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text) $p$;
  END IF;

  -- ── 4. Rebuild index on chat_sessions ─────────────────────────────────────

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_sessions') THEN
    DROP INDEX IF EXISTS public.idx_chat_sessions_user;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON public.chat_sessions (user_id, updated_at DESC)';
  END IF;

  RAISE NOTICE 'Migration 011 complete.';

END $$;
