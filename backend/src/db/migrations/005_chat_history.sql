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
