/**
 * Mapai Backend — Database Migration
 * Creates all tables in Supabase/PostgreSQL.
 * Run: npx tsx src/db/migrate.ts
 *
 * This uses raw SQL via Supabase's rpc or direct PostgreSQL.
 * Alternatively, paste the SQL below into Supabase SQL Editor.
 */

import 'dotenv/config';
import { getSupabase } from './supabase-client.js';

// ─── Migration SQL ───────────────────────────────────────

export const MIGRATION_SQL = `
-- ═══════════════════════════════════════════════════════
-- Mapai Database Schema v1
-- ═══════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ─────────────────────────────────────────────
-- Synced from Supabase Auth; stores profile data.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    onboarding_complete BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── User Preferences (Memory Engine) ─────────────────
-- Stores inferred and explicit preference facts per user.
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dimension VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.50,
    source VARCHAR(20) DEFAULT 'inferred'
        CHECK (source IN ('explicit', 'inferred', 'behavioral')),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated TIMESTAMPTZ DEFAULT now(),
    decay_weight DECIMAL(3,2) DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prefs_dimension ON user_preferences(dimension);

-- ─── Places ────────────────────────────────────────────
-- Seeded from Google Places; enriched with social signals.
CREATE TABLE IF NOT EXISTS places (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_place_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    neighborhood TEXT,
    category TEXT DEFAULT 'restaurant',
    rating DOUBLE PRECISION DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    price_level INTEGER DEFAULT 2,
    photos TEXT[] DEFAULT '{}',
    website TEXT,
    phone_number TEXT,
    open_now BOOLEAN,
    seed_category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_places_google_id ON places(google_place_id);
CREATE INDEX IF NOT EXISTS idx_places_neighborhood ON places(neighborhood);
CREATE INDEX IF NOT EXISTS idx_places_category ON places(category);
CREATE INDEX IF NOT EXISTS idx_places_location ON places(latitude, longitude);

-- ─── Social Signals ───────────────────────────────────
-- Reddit/Google/Instagram mentions linked to places.
CREATE TABLE IF NOT EXISTS social_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    source VARCHAR(20) NOT NULL
        CHECK (source IN ('reddit', 'google', 'instagram')),
    quote TEXT NOT NULL,
    author TEXT,
    post_date TEXT,
    sentiment VARCHAR(10) DEFAULT 'neutral'
        CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    highlighted_attributes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_signals_place_id ON social_signals(place_id);
CREATE INDEX IF NOT EXISTS idx_signals_source ON social_signals(source);
CREATE INDEX IF NOT EXISTS idx_signals_expires ON social_signals(expires_at);

-- ─── Chat Sessions ────────────────────────────────────
-- Persistent chat history per user session.
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON chat_sessions(user_id);

-- ─── Visits & Feedback Loop ──────────────────────────
-- Tracks when a user visits a place (or intends to).
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'planned'
        CHECK (status IN ('planned', 'visited', 'cancelled')),
    visit_date TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated surveys for visit feedback.
CREATE TABLE IF NOT EXISTS surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    response_text TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Navigation Logs ──────────────────────────────────
-- Tracks route requests for multi-modal navigation.
CREATE TABLE IF NOT EXISTS navigation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL
        CHECK (mode IN ('walking', 'transit', 'driving', 'cycling')),
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    travel_time_seconds INTEGER,
    distance_meters INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_user_id ON visits(user_id);
CREATE INDEX IF NOT EXISTS idx_surveys_visit_id ON surveys(visit_id);
CREATE INDEX IF NOT EXISTS idx_nav_logs_user_id ON navigation_logs(user_id);

-- ─── Row Level Security ──────────────────────────────
-- Users can only read/write their own data.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigation_logs ENABLE ROW LEVEL SECURITY;

-- ... Existing policies ...

-- Visits, Surveys, Nav logs: user-scoped CRUD
DROP POLICY IF EXISTS "Users can manage own visits" ON visits;
CREATE POLICY "Users can manage own visits"
    ON visits FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own surveys" ON surveys;
CREATE POLICY "Users can manage own surveys"
    ON surveys FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own navigation logs" ON navigation_logs;
CREATE POLICY "Users can read own navigation logs"
    ON navigation_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own navigation logs" ON navigation_logs;
CREATE POLICY "Users can insert own navigation logs"
    ON navigation_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users: can read/update own row
DROP POLICY IF EXISTS "Users can read own profile" ON users;
CREATE POLICY "Users can read own profile"
    ON users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE USING (auth.uid() = id);

-- Preferences: user-scoped CRUD
DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences"
    ON user_preferences FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences"
    ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences"
    ON user_preferences FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Users can delete own preferences"
    ON user_preferences FOR DELETE USING (auth.uid() = user_id);

-- Chat sessions: user-scoped
DROP POLICY IF EXISTS "Users can read own sessions" ON chat_sessions;
CREATE POLICY "Users can read own sessions"
    ON chat_sessions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON chat_sessions;
CREATE POLICY "Users can insert own sessions"
    ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON chat_sessions;
CREATE POLICY "Users can update own sessions"
    ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Places + signals: public read, service role write
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Places are publicly readable" ON places;
CREATE POLICY "Places are publicly readable"
    ON places FOR SELECT USING (true);

DROP POLICY IF EXISTS "Signals are publicly readable" ON social_signals;
CREATE POLICY "Signals are publicly readable"
    ON social_signals FOR SELECT USING (true);

-- ─── Updated-at triggers ──────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS places_updated_at ON places;
CREATE TRIGGER places_updated_at
    BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`;

// ─── Runner ──────────────────────────────────────────

async function main() {
    console.log('🗄️  Mapai Database Migration');
    console.log('');

    const supabase = getSupabase();
    if (!supabase) {
        console.log('⚠️  No Supabase credentials configured.');
        console.log('');
        console.log('To run this migration:');
        console.log('  1. Create a Supabase project at https://supabase.com');
        console.log('  2. Copy the credentials to backend/.env');
        console.log('  3. Run: npx tsx src/db/migrate.ts');
        console.log('');
        console.log('Alternatively, paste the SQL below into the Supabase SQL Editor:');
        console.log('─'.repeat(50));
        console.log(MIGRATION_SQL);
        return;
    }

    // Execute migration via Supabase SQL
    const { error } = await (supabase as any).rpc('exec_sql', { sql: MIGRATION_SQL });

    if (error) {
        // If rpc doesn't exist, suggest using the SQL editor
        console.log('⚠️  Could not run migration via RPC (this is normal for new projects).');
        console.log('');
        console.log('Paste the following SQL into your Supabase SQL Editor:');
        console.log('  Dashboard → SQL Editor → New Query → Paste → Run');
        console.log('─'.repeat(50));
        console.log(MIGRATION_SQL);
        return;
    }

    console.log('✅ Migration complete! Tables created:');
    console.log('   - users');
    console.log('   - user_preferences');
    console.log('   - places');
    console.log('   - social_signals');
    console.log('   - chat_sessions');
}

main().catch(console.error);
