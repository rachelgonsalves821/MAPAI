-- ================================================================
-- Mapai Database Migration v6 — Chat History + Conversational Memory
-- Run in Supabase SQL Editor after migration-v5
-- ================================================================
--
-- ARCHIVED — superseded by the numbered migration sequence.
-- Equivalent coverage:
--   005_chat_history.sql — clean chat_sessions + chat_messages
--                          with Clerk TEXT IDs from the ground up
-- ================================================================

-- ─── Fix chat_sessions for Clerk-based auth ─────────────────────
-- The original schema used user_id UUID FK → users(id), but the app
-- uses Clerk IDs (text strings). Add clerk_user_id and new columns.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

-- Index for history list query (newest first by user)
CREATE INDEX IF NOT EXISTS idx_chat_sessions_clerk_updated
  ON public.chat_sessions (clerk_user_id, updated_at DESC);

-- ─── Create chat_messages table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    clerk_user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON public.chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON public.chat_messages (clerk_user_id);

-- ─── Fix user_preferences for Clerk-based auth ─────────────────
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_prefs_clerk_dimension_unique'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_prefs_clerk_dimension_unique
      UNIQUE (clerk_user_id, dimension);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_prefs_clerk_user
  ON public.user_preferences (clerk_user_id);

-- ─── 30-day session cleanup function ────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.chat_sessions
  WHERE updated_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  PERFORM cron.schedule('cleanup-old-chats', '0 3 * * *',
    'SELECT public.cleanup_old_chat_sessions()');
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron not available — use backend /v1/admin/cleanup-chats instead';
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_cron not available — use backend /v1/admin/cleanup-chats instead';
END $$;

-- ─── RLS policies for chat_messages ─────────────────────────────
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their messages" ON public.chat_messages;
CREATE POLICY "Users own their messages"
  ON public.chat_messages FOR ALL
  USING (
    clerk_user_id = coalesce(
      current_setting('request.jwt.claims', true)::json ->> 'sub',
      clerk_user_id
    )
  );

DROP POLICY IF EXISTS "Users own their sessions via clerk" ON public.chat_sessions;
CREATE POLICY "Users own their sessions via clerk"
  ON public.chat_sessions FOR ALL
  USING (
    clerk_user_id = coalesce(
      current_setting('request.jwt.claims', true)::json ->> 'sub',
      clerk_user_id
    )
  );
