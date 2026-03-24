-- ═══════════════════════════════════════════════════════
-- Mapai Database Migration v2 — Identity + Social Graph
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- Add username column (unique, for public profiles)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Add preferences jsonb (onboarding selections)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Add social jsonb (friend counts, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS social JSONB DEFAULT '{"friends_count":0,"mutuals":0}'::jsonb;

-- Index for username lookups (public profile route)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ─── Friend Requests ────────────────────────────────────
-- Tracks friend connections between users.
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);

-- ─── Friendships (materialized from accepted requests) ──
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);

-- ─── Row Level Security for new tables ──────────────────

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Friend requests: users can see their own sent/received
DROP POLICY IF EXISTS "Users can view own friend requests" ON friend_requests;
CREATE POLICY "Users can view own friend requests"
    ON friend_requests FOR SELECT
    USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

DROP POLICY IF EXISTS "Users can send friend requests" ON friend_requests;
CREATE POLICY "Users can send friend requests"
    ON friend_requests FOR INSERT
    WITH CHECK (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "Users can update own friend requests" ON friend_requests;
CREATE POLICY "Users can update own friend requests"
    ON friend_requests FOR UPDATE
    USING (auth.uid() = to_user_id);

-- Friendships: users can see their own friends
DROP POLICY IF EXISTS "Users can view own friendships" ON friendships;
CREATE POLICY "Users can view own friendships"
    ON friendships FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Public profile: allow reading username + display_name for any user
DROP POLICY IF EXISTS "Public profiles are readable" ON users;
CREATE POLICY "Public profiles are readable"
    ON users FOR SELECT
    USING (true);

-- Updated-at triggers for new tables
DROP TRIGGER IF EXISTS friend_requests_updated_at ON friend_requests;
CREATE TRIGGER friend_requests_updated_at
    BEFORE UPDATE ON friend_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
