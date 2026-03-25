-- ═══════════════════════════════════════════════════════════════════════════
-- Mapai Migration 003 — user_profiles
--
-- Stores the public-facing profile for every Mapai user, keyed by the
-- Clerk subject claim (clerk_user_id = JWT "sub" field).
--
-- Run order: must run after Clerk is configured as the JWT issuer in
--            Supabase → Auth → JWT Settings.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id  TEXT        NOT NULL UNIQUE,
  display_name   TEXT        NOT NULL,
  username       TEXT        NOT NULL UNIQUE,
  avatar_url     TEXT,
  bio            TEXT        DEFAULT '',
  is_onboarded   BOOLEAN     DEFAULT FALSE,
  mfa_enabled    BOOLEAN     DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Constraints ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD CONSTRAINT username_format
  CHECK (username ~ '^[a-z0-9_]{3,30}$');

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Exact-match lookups on the public @username route
CREATE INDEX IF NOT EXISTS idx_user_profiles_username
  ON public.user_profiles (username);

-- JWT-claim join (most frequent internal lookup)
CREATE INDEX IF NOT EXISTS idx_user_profiles_clerk_id
  ON public.user_profiles (clerk_user_id);

-- Full-text search on display_name (people-search feature)
CREATE INDEX IF NOT EXISTS idx_user_profiles_name_search
  ON public.user_profiles
  USING GIN (to_tsvector('english', display_name));

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Public read: profiles are visible to everyone (social discovery)
CREATE POLICY "Anyone can read profiles"
  ON public.user_profiles
  FOR SELECT
  USING (true);

-- Authenticated write: users may only update their own row
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (
    clerk_user_id = (
      current_setting('request.jwt.claims', true)::json ->> 'sub'
    )
  );

-- Authenticated insert: users may only create a row for themselves
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (
    clerk_user_id = (
      current_setting('request.jwt.claims', true)::json ->> 'sub'
    )
  );
