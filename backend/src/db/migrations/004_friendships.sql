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
