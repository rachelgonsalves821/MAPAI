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
-- ═══════════════════════════════════════════════════════════════════════════
-- Mapai Migration 004 — friendships
--
-- Directed-edge friendship graph keyed by Clerk subject claims.
-- Status lifecycle: pending → accepted | blocked
--
-- Depends on: 003_user_profiles.sql (clerk_user_id is the identity anchor)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.friendships (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id TEXT        NOT NULL,
  addressee_id TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate edges in the same direction
  UNIQUE (requester_id, addressee_id),

  -- Self-friendship guard
  CHECK (requester_id != addressee_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- "All pending/accepted requests I sent"
CREATE INDEX IF NOT EXISTS idx_friendships_requester
  ON public.friendships (requester_id, status);

-- "All pending/accepted requests I received"
CREATE INDEX IF NOT EXISTS idx_friendships_addressee
  ON public.friendships (addressee_id, status);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Either party can see the edge
CREATE POLICY "Users can see own friendships"
  ON public.friendships
  FOR SELECT
  USING (
    requester_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
    OR
    addressee_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
  );

-- Only the requester may create a new edge
CREATE POLICY "Users can send friend requests"
  ON public.friendships
  FOR INSERT
  WITH CHECK (
    requester_id = (
      current_setting('request.jwt.claims', true)::json ->> 'sub'
    )
  );

-- Only the addressee may respond (accept / block)
CREATE POLICY "Addressee can respond to requests"
  ON public.friendships
  FOR UPDATE
  USING (
    addressee_id = (
      current_setting('request.jwt.claims', true)::json ->> 'sub'
    )
  );
