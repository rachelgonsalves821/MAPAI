# Mapai Overnight Decisions Log
> Session: 2026-03-23 — Onboarding + Identity + Social Graph Foundation

## Architecture Adaptations

### DECISION: Expo/React Native (not Next.js)
- **Context**: Spec assumed Next.js with `/pages/api/` routes
- **Choice**: Adapted all implementations to Expo Router + Fastify backend
- **Why**: Project is React Native/Expo, not Next.js. Must work within existing architecture.
- **Risk**: Low — additive changes only

### DECISION: Auth Store is additive, not replacement
- **Context**: Spec requested Zustand auth store. Project already uses React Context for auth.
- **Choice**: Create Zustand `authStore` as a lightweight mirror for preference/profile data. Keep `AuthContext` as the source of truth for session/login.
- **Why**: Replacing AuthContext would break existing auth flow (Google OAuth, guest mode, route guards).
- **Risk**: Low — two stores are complementary, not conflicting.

### DECISION: Onboarding preferences expansion via new screen
- **Context**: Spec wants 4-step onboarding with preferences. Current onboarding has 3 screens (welcome, interests, profile).
- **Choice**: Add a new `preferences.tsx` screen between interests and profile for price/ambiance/speed selection.
- **Why**: Adding a screen is less disruptive than rewriting existing screens.
- **Risk**: Low — existing flow preserved, new screen inserted.

### DECISION: Username stored in existing users table (ALTER TABLE)
- **Context**: Spec shows a new `users` table creation. Table already exists.
- **Choice**: Use ALTER TABLE to add `username`, `preferences`, `social` columns.
- **Why**: Dropping and recreating would lose data.
- **Risk**: Low — additive column changes only.

### DECISION: Social API on Fastify backend (not Next.js API routes)
- **Context**: Spec shows `/pages/api/social/` routes (Next.js convention).
- **Choice**: Create Fastify route at `/v1/social/friends` and `/v1/social/request`.
- **Why**: Backend is Fastify. No Next.js API routes exist.
- **Risk**: Low — follows existing pattern.

### DECISION: Public profile uses backend endpoint + mobile screen
- **Context**: Spec shows `/app/u/[username]/page.tsx` (Next.js).
- **Choice**: Create Expo Router screen at `app/u/[username].tsx` + backend `GET /v1/user/public/:username`.
- **Why**: Expo Router file-based routing. Deep linking enables URL-accessible profiles.
- **Risk**: Low

### DECISION: LLM context already injected server-side
- **Context**: Spec wants frontend `buildUserContext` function.
- **Choice**: Create frontend utility AND ensure backend already uses it (it does via MemoryService.getUserContext).
- **Why**: Backend already injects user memory into Claude prompt. Frontend utility provides convenience for direct chat requests.
- **Risk**: Low — redundant safety net.

---

> Session: 2026-03-23 — Emergency Security Hardening

## Decision: CORS origin list format
- **Context**: Original config had a single string `corsOrigin`. Fastify CORS plugin accepts `string | string[] | RegExp | boolean`.
- **Choice**: Changed to `corsOrigins: string[]` parsed from comma-separated env var. Defaults to localhost origins in dev, mapai.app in production.
- **Why**: Array format lets us support multiple origins without wildcards. Comma-separated env var is the simplest format that works everywhere.
- **Risk**: If a developer sets `CORS_ORIGIN=*` in their .env, `parseCorsOrigins()` will return `['*']` which Fastify treats as wildcard. This is acceptable for local dev but not production.

## Decision: Supabase config fields remain optional (empty string fallback)
- **Context**: `config.supabase.url` etc. fallback to `''` instead of using `requireEnv()`.
- **Choice**: Kept optional because the codebase has a graceful degradation pattern (`hasDatabase()` checks, in-memory fallbacks) that would break if we threw on missing Supabase vars.
- **Why**: Many developers run without Supabase during local dev. Forcing it would break the existing dev workflow.
- **Risk**: In production, missing Supabase vars mean silent fallback to in-memory stores. Mitigated by adding production-specific warnings in `validateConfig()`.

## Decision: Removed console.log debug lines from config.ts
- **Context**: Config had `console.log('ANTHROPIC_API_KEY:', ...)` debug statements.
- **Choice**: Removed entirely. Config validation warnings serve the same purpose without logging env var names.
- **Why**: Even `Found/MISSING` logging reveals which env vars the system uses, which is information leakage.
- **Risk**: None. `validateConfig()` warnings cover the same use case.

## Decision: run-migration-pg.ts credentials moved to env vars
- **Context**: File had hardcoded `host`, `password` for direct Postgres connection.
- **Choice**: Added `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_PASSWORD` env vars. Updated .env.example.
- **Why**: These credentials must never be in source code.
- **Risk**: Developers who were running migrations with the old hardcoded values will need to set these env vars. Documented in .env.example.

## Decision: test-connection.ts no longer logs partial key
- **Context**: File logged `key.slice(0, 12)...` which exposes first 12 chars of the service role key.
- **Choice**: Removed key logging entirely. Only URL is logged.
- **Why**: Even partial keys reduce the search space for attackers.
- **Risk**: None. Connection success/failure is sufficient feedback.

---

> Session: 2026-03-23 — Emergency Fix: Chat Pipeline + Map Overlay

## Root Cause Analysis
- **Primary failure**: `ANTHROPIC_API_KEY` empty in backend/.env — Claude API call throws immediately, returns fallback "I'm having trouble" text
- **Secondary failure**: `GOOGLE_PLACES_API_KEY` empty — even if LLM worked, places search would return empty
- **Result**: No real AI response, no search query extracted, no places fetched, no map markers

## Decision: Show explicit config errors to user in dev mode
- **Context**: LLM errors were silently swallowed, returning generic "I'm having trouble" message
- **Choice**: Return actual error messages in response text (e.g., "ANTHROPIC_API_KEY is not set")
- **Why**: In dev mode, showing the real error lets the developer fix it immediately instead of debugging blind
- **Risk**: Only shown in dev. Production should never have empty keys.

## Decision: Guard against missing Google Places key
- **Context**: If LLM returns a search_query but GOOGLE_PLACES_API_KEY is empty, the fetch to Google fails silently
- **Choice**: Check `config.google.placesApiKey` before calling Google API, log a warning
- **Why**: Prevents confusing silent failures

## Decision: Removed user_context from chat request body
- **Context**: Frontend sent `user_context: buildUserContext()` but backend schema doesn't expect it — field was silently ignored
- **Choice**: Removed from request. Backend already builds user context server-side via MemoryService
- **Why**: Dead code that adds confusion. Server-side memory is the source of truth.

## Decision: Fixed place data mapping for map markers
- **Context**: Frontend filtered places by `p.location?.latitude` but chat.tsx PlaceResult type had `location?: { latitude, longitude }` — correct field names from backend
- **Choice**: Ensured consistent mapping and added default values for required Place type fields (socialSignals, isLoyalty, visitCount)
- **Why**: Missing required fields could cause runtime errors when Place objects hit components expecting full type

## Pipeline Logging Added
- Backend: ai-orchestrator.ts prints full PIPELINE TRACE
- Backend: chat.ts logs incoming message, places count
- Frontend: chat.tsx logs request, response, places, map markers
- Frontend: ExploreView.tsx handles undefined matchScore safely

---

> Session: 2026-03-24 — Map/Chat UI Fix + Place Detail + Transport Options

## Decision: Map always-visible with chat bottom sheet
- **Context**: PRD §8.3.1-2 requires map as permanent base layer, chat as overlay
- **Old state**: home.tsx had social feed layout, chat was full-screen modal
- **Choice**: Rewrote home.tsx to map-dominant layout with ChatOverlay bottom sheet
- **Why**: Map context must never be lost during conversation

## Decision: Reanimated for bottom sheet animation
- **Context**: Spec calls for spring animation (damping 0.7, stiffness 300)
- **Choice**: Used react-native-reanimated (already installed) with useSharedValue/withSpring
- **Why**: Smoother than RN Animated, runs on UI thread

## Decision: Chat overlay height 62% of screen
- **Context**: PRD §8.3.2 says chat expands upward, map visible at 30% opacity
- **Choice**: EXPANDED_HEIGHT = screen height * 0.62, map dims via black overlay at 70% opacity
- **Why**: Matches spec exactly, keeps geographic context visible

## Decision: Transport options as new Expo Router modal
- **Context**: No transport screen existed
- **Choice**: Created app/transport/[placeId].tsx as slide-from-bottom modal
- **Why**: Matches existing place detail pattern, Expo Router file-based routing

## Decision: Rideshare shows "Open app for price"
- **Context**: Uber/Lyft Ride Request API requires partner approval
- **Choice**: Deep link only, no live pricing
- **Why**: Conservative fallback, honest UI

## Decision: Google Directions API for walk/drive/transit
- **Context**: Need real ETA and distance for transport comparison
- **Choice**: Fetch walking, driving, transit in parallel via Google Directions API
- **Why**: Real data beats mock data

## Decision: Kept chat.tsx modal as fallback
- **Context**: New ChatOverlay is the primary chat entry, but chat.tsx still exists
- **Choice**: Did not delete chat.tsx, it still works as a separate modal route
- **Why**: Zero risk, users who navigate there still get a working chat

---

> Session: 2026-03-24 — Location-Aware Results + 20-Minute Walk Default

## Decision: Proximity weight = 20% of composite score
- **Context**: Need to balance distance vs. preference matching
- **Choice**: 80% preference score + 20% proximity score
- **Why**: Distance matters but shouldn't override a great preference match

## Decision: Haversine straight-line, not routing distance
- **Context**: Walking time estimate uses straight-line km × walking pace (4.8 km/h)
- **Choice**: Haversine formula, not Google Directions API per-place
- **Why**: Calling Directions API for every place result would be too slow and expensive. Haversine is accurate enough for Boston's grid at the distances involved (~1-2 km).

## Decision: Location fallback = Boston city center (42.3601, -71.0589)
- **Context**: Need a location even before GPS permission is granted
- **Choice**: Boston default set immediately on init, real GPS replaces it when available
- **Why**: Never blocks UI. Boston is the v1 launch market.

## Decision: No radius hard-filter yet
- **Context**: Spec called for filtering places outside 20-min walk radius
- **Choice**: Proximity scoring only (no hard filter) — farther places score lower but still appear
- **Why**: Hard filtering could return zero results if Google Places returns distant matches. Scoring achieves the same ranking effect without empty states. Can add hard filter in next iteration.

## Decision: travel_willingness added to LLM intent schema
- **Context**: Need to detect "nearby"/"flexible"/"specific" travel intent
- **Choice**: Added to mapai_intent JSON block that LLM emits
- **Why**: Allows future radius adjustments based on user's stated preference

---

> Session: 2026-03-23 — Onboarding UI/UX Implementation (Identity + Social Flow)

## Decision: Replaced preference-collection onboarding with identity-focused flow
- **Old flow**: Welcome → Interests → Preferences → Profile (4 steps)
- **New flow**: Welcome → Create ID → Find Friends → Complete (4 steps)
- **Why**: New flow focuses on identity + social graph per updated mockups. Preference collection can be reintroduced post-onboarding.

## Decision: Progress dots use pill shape for active step
- Active step renders as a wider pill (24px) rather than just a larger dot
- **Why**: Modern pattern common in iOS/Android onboarding. Cleaner visual hierarchy.

## Decision: Username validation is client-side mock
- `checkUsernameAvailability` uses simulated delay + hardcoded "taken" list
- **Why**: No backend endpoint yet. Structured as drop-in replacement for real API.

## Decision: Find Friends uses mock data
- Suggested users are hardcoded. "Sync contacts" is a no-op.
- **Why**: Social graph backend not built yet. UI is production-ready; data layer is stubbed.

## Decision: Buttons use full-width pill shape (borderRadius: 999)
- All primary CTAs use `BorderRadius.full` instead of `BorderRadius.lg`
- **Why**: Matches spec's "rounded/pill shape" requirement.

## Decision: Welcome screen uses Ionicons instead of welcome.png
- Used `Ionicons navigate` in a rounded square container
- **Why**: Spec calls for "centered icon" with "rounded square container". Icon is crisper and resolution-independent.

## Decision: AuthContext User type extended with optional `username`
- Added `username?: string` to User interface
- **Why**: Needed to persist username. Optional to avoid breaking existing users.

## Decision: Completion screen backend save is fire-and-forget
- POST to `/v1/user/onboarding` failure doesn't block user from entering app
- **Why**: Same pattern as previous implementation. UX > persistence on first run.
