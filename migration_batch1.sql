-- ================================================================
-- Mapai Migration 001 — Foundation Schema
--
-- Core tables: users, user_preferences, places, social_signals,
--              visits, surveys, navigation_logs
--
-- All user-referencing columns use TEXT for Clerk IDs.
-- chat_sessions / chat_messages are handled in 005_chat_history.sql
-- ================================================================

-- ─── Shared helper function ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── users ───────────────────────────────────────────────────────
-- Legacy compatibility table. New code should use user_profiles
-- (migration 003) as the primary identity anchor.

CREATE TABLE IF NOT EXISTS users (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id            TEXT        UNIQUE,          -- Clerk "sub" claim
    email                    TEXT        UNIQUE,
    display_name             TEXT,
    avatar_url               TEXT,
    username                 TEXT        UNIQUE,
    onboarding_complete      BOOLEAN     DEFAULT false,
    preferences              JSONB       DEFAULT '{}'::jsonb,
    social                   JSONB       DEFAULT '{"friends_count":0,"mutuals":0}'::jsonb,
    -- loyalty / privacy columns (added in v5, kept here for greenfield installs)
    points_balance           INTEGER     DEFAULT 0,
    privacy_loved_places     VARCHAR(20) DEFAULT 'friends',
    privacy_activity         VARCHAR(20) DEFAULT 'friends',
    allow_friend_requests    BOOLEAN     DEFAULT true,
    deletion_requested_at    TIMESTAMPTZ,
    deletion_scheduled_at    TIMESTAMPTZ,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_id  ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are readable" ON users;
CREATE POLICY "Public profiles are readable"
    ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (
        clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')
    );

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── user_preferences ────────────────────────────────────────────
-- Stores inferred and explicit preference facts per user.

CREATE TABLE IF NOT EXISTS user_preferences (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id  TEXT        NOT NULL,
    dimension      VARCHAR(100) NOT NULL,
    value          TEXT        NOT NULL,
    confidence     DECIMAL(3,2) DEFAULT 0.50,
    source         VARCHAR(20)  DEFAULT 'inferred'
                   CHECK (source IN ('explicit', 'inferred', 'behavioral')),
    created_at     TIMESTAMPTZ  DEFAULT now(),
    last_updated   TIMESTAMPTZ  DEFAULT now(),
    decay_weight   DECIMAL(3,2) DEFAULT 1.0,

    CONSTRAINT user_prefs_clerk_dimension_unique UNIQUE (clerk_user_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_clerk_user ON user_preferences(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_prefs_dimension   ON user_preferences(dimension);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences"
    ON user_preferences FOR SELECT
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences"
    ON user_preferences FOR INSERT
    WITH CHECK (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences"
    ON user_preferences FOR UPDATE
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Users can delete own preferences"
    ON user_preferences FOR DELETE
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── places ──────────────────────────────────────────────────────
-- Seeded from Google Places API; enriched with social signals.

CREATE TABLE IF NOT EXISTS places (
    id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    google_place_id  TEXT             UNIQUE NOT NULL,
    name             TEXT             NOT NULL,
    address          TEXT,
    latitude         DOUBLE PRECISION NOT NULL,
    longitude        DOUBLE PRECISION NOT NULL,
    neighborhood     TEXT,
    category         TEXT             DEFAULT 'restaurant',
    rating           DOUBLE PRECISION DEFAULT 0,
    rating_count     INTEGER          DEFAULT 0,
    price_level      INTEGER          DEFAULT 2,
    photos           TEXT[]           DEFAULT '{}',
    website          TEXT,
    phone_number     TEXT,
    open_now         BOOLEAN,
    seed_category    TEXT,
    created_at       TIMESTAMPTZ      DEFAULT now(),
    updated_at       TIMESTAMPTZ      DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_places_google_id    ON places(google_place_id);
CREATE INDEX IF NOT EXISTS idx_places_neighborhood ON places(neighborhood);
CREATE INDEX IF NOT EXISTS idx_places_category     ON places(category);
CREATE INDEX IF NOT EXISTS idx_places_location     ON places(latitude, longitude);

ALTER TABLE places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Places are publicly readable" ON places;
CREATE POLICY "Places are publicly readable"
    ON places FOR SELECT USING (true);

DROP TRIGGER IF EXISTS places_updated_at ON places;
CREATE TRIGGER places_updated_at
    BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── social_signals ──────────────────────────────────────────────
-- Reddit / Google / Instagram mentions linked to places.

CREATE TABLE IF NOT EXISTS social_signals (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id              UUID        NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    source                VARCHAR(20) NOT NULL
                          CHECK (source IN ('reddit', 'google', 'instagram')),
    quote                 TEXT        NOT NULL,
    author                TEXT,
    post_date             TEXT,
    sentiment             VARCHAR(10) DEFAULT 'neutral'
                          CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    highlighted_attributes TEXT[]     DEFAULT '{}',
    created_at            TIMESTAMPTZ DEFAULT now(),
    expires_at            TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_signals_place_id ON social_signals(place_id);
CREATE INDEX IF NOT EXISTS idx_signals_source   ON social_signals(source);
CREATE INDEX IF NOT EXISTS idx_signals_expires  ON social_signals(expires_at);

ALTER TABLE social_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signals are publicly readable" ON social_signals;
CREATE POLICY "Signals are publicly readable"
    ON social_signals FOR SELECT USING (true);

-- ─── visits ──────────────────────────────────────────────────────
-- Tracks when a user visits a place (or intends to).

CREATE TABLE IF NOT EXISTS visits (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT       NOT NULL,
    place_id     UUID        NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    status       VARCHAR(20) DEFAULT 'planned'
                 CHECK (status IN ('planned', 'visited', 'cancelled')),
    visit_date   TIMESTAMPTZ DEFAULT now(),
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_clerk_user ON visits(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_visits_place_id   ON visits(place_id);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own visits" ON visits;
CREATE POLICY "Users can manage own visits"
    ON visits FOR ALL
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── surveys ─────────────────────────────────────────────────────
-- AI-generated surveys for visit feedback.

CREATE TABLE IF NOT EXISTS surveys (
    id             UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id       UUID     NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    clerk_user_id  TEXT     NOT NULL,
    question_text  TEXT     NOT NULL,
    response_text  TEXT,
    rating         INTEGER  CHECK (rating >= 1 AND rating <= 5),
    processed      BOOLEAN  DEFAULT false,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_visit_id    ON surveys(visit_id);
CREATE INDEX IF NOT EXISTS idx_surveys_clerk_user  ON surveys(clerk_user_id);

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own surveys" ON surveys;
CREATE POLICY "Users can manage own surveys"
    ON surveys FOR ALL
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- ─── navigation_logs ─────────────────────────────────────────────
-- Tracks route requests for multi-modal navigation.

CREATE TABLE IF NOT EXISTS navigation_logs (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id       TEXT             NOT NULL,
    place_id            UUID             NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    mode                VARCHAR(20)      NOT NULL
                        CHECK (mode IN ('walking', 'transit', 'driving', 'cycling')),
    origin_lat          DOUBLE PRECISION NOT NULL,
    origin_lng          DOUBLE PRECISION NOT NULL,
    travel_time_seconds INTEGER,
    distance_meters     INTEGER,
    created_at          TIMESTAMPTZ      DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nav_logs_clerk_user ON navigation_logs(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_nav_logs_place_id   ON navigation_logs(place_id);

ALTER TABLE navigation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own navigation logs" ON navigation_logs;
CREATE POLICY "Users can read own navigation logs"
    ON navigation_logs FOR SELECT
    USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));

DROP POLICY IF EXISTS "Users can insert own navigation logs" ON navigation_logs;
CREATE POLICY "Users can insert own navigation logs"
    ON navigation_logs FOR INSERT
    WITH CHECK (clerk_user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub'));
