/**
 * Run migration via Supabase REST SQL endpoint.
 * Uses the service role key to authenticate.
 */
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MIGRATION_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    onboarding_complete BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dimension VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.50,
    source VARCHAR(20) DEFAULT 'inferred' CHECK (source IN ('explicit', 'inferred', 'behavioral')),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated TIMESTAMPTZ DEFAULT now(),
    decay_weight DECIMAL(3,2) DEFAULT 1.0
  )`,

  `CREATE INDEX IF NOT EXISTS idx_user_prefs_user_id ON user_preferences(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_prefs_dimension ON user_preferences(dimension)`,

  `CREATE TABLE IF NOT EXISTS places (
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
    photos TEXT[] DEFAULT ARRAY[]::TEXT[],
    website TEXT,
    phone_number TEXT,
    open_now BOOLEAN,
    seed_category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_places_google_id ON places(google_place_id)`,
  `CREATE INDEX IF NOT EXISTS idx_places_neighborhood ON places(neighborhood)`,
  `CREATE INDEX IF NOT EXISTS idx_places_category ON places(category)`,
  `CREATE INDEX IF NOT EXISTS idx_places_location ON places(latitude, longitude)`,

  `CREATE TABLE IF NOT EXISTS social_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    source VARCHAR(20) NOT NULL CHECK (source IN ('reddit', 'google', 'instagram')),
    quote TEXT NOT NULL,
    author TEXT,
    post_date TEXT,
    sentiment VARCHAR(10) DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    highlighted_attributes TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
  )`,

  `CREATE INDEX IF NOT EXISTS idx_signals_place_id ON social_signals(place_id)`,
  `CREATE INDEX IF NOT EXISTS idx_signals_source ON social_signals(source)`,
  `CREATE INDEX IF NOT EXISTS idx_signals_expires ON social_signals(expires_at)`,

  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON chat_sessions(user_id)`,

  // RLS
  `ALTER TABLE users ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE places ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE social_signals ENABLE ROW LEVEL SECURITY`,

  // Policies
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own profile') THEN CREATE POLICY "Users can read own profile" ON users FOR SELECT USING (auth.uid() = id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile') THEN CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own preferences') THEN CREATE POLICY "Users can read own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own preferences') THEN CREATE POLICY "Users can insert own preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own preferences') THEN CREATE POLICY "Users can update own preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own preferences') THEN CREATE POLICY "Users can delete own preferences" ON user_preferences FOR DELETE USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own sessions') THEN CREATE POLICY "Users can read own sessions" ON chat_sessions FOR SELECT USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own sessions') THEN CREATE POLICY "Users can insert own sessions" ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own sessions') THEN CREATE POLICY "Users can update own sessions" ON chat_sessions FOR UPDATE USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Places are publicly readable') THEN CREATE POLICY "Places are publicly readable" ON places FOR SELECT USING (true); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Signals are publicly readable') THEN CREATE POLICY "Signals are publicly readable" ON social_signals FOR SELECT USING (true); END IF; END $$`,

  // Triggers
  `CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS users_updated_at ON users`,
  `CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
  `DROP TRIGGER IF EXISTS places_updated_at ON places`,
  `CREATE TRIGGER places_updated_at BEFORE UPDATE ON places FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
  `DROP TRIGGER IF EXISTS chat_sessions_updated_at ON chat_sessions`,
  `CREATE TRIGGER chat_sessions_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
];

async function runSQL(sql: string): Promise<{ ok: boolean; error?: string }> {
  // Use Supabase's pg-meta REST endpoint to execute SQL
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text };
  }
  return { ok: true };
}

async function main() {
  console.log('🗄️  Mapai Database Migration');
  console.log(`   Target: ${SUPABASE_URL}`);
  console.log('');

  let successes = 0;
  let failures = 0;

  for (let i = 0; i < MIGRATION_STATEMENTS.length; i++) {
    const sql = MIGRATION_STATEMENTS[i];
    const label = sql.trim().split('\n')[0].slice(0, 60);
    
    const result = await runSQL(sql);
    if (result.ok) {
      console.log(`  ✅ [${i + 1}/${MIGRATION_STATEMENTS.length}] ${label}`);
      successes++;
    } else {
      console.log(`  ❌ [${i + 1}/${MIGRATION_STATEMENTS.length}] ${label}`);
      console.log(`     Error: ${result.error?.slice(0, 200)}`);
      failures++;
    }
  }

  console.log('');
  console.log(`Done: ${successes} succeeded, ${failures} failed out of ${MIGRATION_STATEMENTS.length} statements`);
}

main().catch(console.error);
