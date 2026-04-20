---
status: fixing
trigger: "Social tab shows 0 faves, 0 friends, 0 activity despite backend having data"
created: 2026-03-25T20:58:00Z
updated: 2026-03-25T21:00:00Z
---

## Current Focus

hypothesis: Two bugs — (1) SocialTab uses raw fetch() instead of apiClient for feed/friends, missing auth in production; (2) In-memory fallback stores have no seed data, so all social endpoints return empty arrays in dev without Supabase
test: Verified backend returns empty arrays, confirmed SUPABASE_URL is empty, confirmed in-memory stores start empty
expecting: After seeding in-memory stores and fixing fetch calls, social data appears
next_action: Add in-memory seed data to social-service.ts and fix SocialTab fetch calls

## Symptoms

expected: Social tab shows loved places, friends, and activity feed data
actual: Social tab shows 0 faves, 0 friends, 0 activity. "Want to Go" section works (shows 3 items) because it uses MOCK_WANT_TO_TRY hardcoded data.
errors: No visible errors - all failures silently swallowed by catch blocks
reproduction: Open profile screen, switch to Social tab
started: Since social tab was implemented

## Eliminated

- hypothesis: Auth middleware rejecting unauthenticated requests
  evidence: Auth middleware falls back to DEV_USER when NODE_ENV !== 'production' and no auth header present (line 40 of auth.ts). curl confirms 200 responses.
  timestamp: 2026-03-25T20:59:00Z

- hypothesis: BACKEND_URL not accessible in SocialTab
  evidence: BACKEND_URL is defined as module-level const at line 30 of profile.tsx, accessible to all components in the file
  timestamp: 2026-03-25T20:59:00Z

## Evidence

- timestamp: 2026-03-25T20:58:30Z
  checked: Backend endpoints via curl (no auth headers)
  found: All three endpoints return 200 with empty arrays - loved-places: {places:[], count:0}, feed: {items:[], count:0}, friends: {friends:[], count:0}
  implication: Backend is running and auth works (dev fallback), but data stores are empty

- timestamp: 2026-03-25T20:59:00Z
  checked: .env file for Supabase configuration
  found: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are empty strings
  implication: hasDatabase() returns false, all services use in-memory fallback stores

- timestamp: 2026-03-25T20:59:10Z
  checked: social-service.ts in-memory stores
  found: inMemoryLovedPlaces, inMemoryActivity, inMemoryBlocks are all initialized as empty Maps
  implication: No seed data exists for in-memory mode - every query returns []

- timestamp: 2026-03-25T20:59:20Z
  checked: seed.ts
  found: Seed script requires Supabase connection, does nothing without it. No in-memory seed path exists.
  implication: Dev environment without Supabase has zero social data

- timestamp: 2026-03-25T20:59:30Z
  checked: SocialTab fetch calls (lines 585-599)
  found: Uses raw fetch() not apiClient for /v1/social/feed and /v1/social/friends. Works in dev (auth middleware fallback) but will fail in production (no auth token attached).
  implication: Secondary bug - will cause 401 errors in production

- timestamp: 2026-03-25T20:59:40Z
  checked: "Want to Go" section working
  found: wantToTry state initialized with MOCK_WANT_TO_TRY (hardcoded at line 1031), never fetched from backend
  implication: Confirms the pattern - only hardcoded mock data appears, all backend-fetched data is empty

## Resolution

root_cause: Two issues causing empty Social tab: (1) PRIMARY - Backend social-service.ts in-memory fallback stores start empty and have no seed data. With SUPABASE_URL unset, hasDatabase() returns false, so all social queries use empty Maps. (2) SECONDARY - SocialTab uses raw fetch() instead of apiClient for feed and friends endpoints, which won't attach auth tokens in production.
fix: (1) Added in-memory seed data to social-service.ts for loved places, activity feed, and friendships so dev mode without Supabase has working data. (2) Changed /friends route to use social.getFriends() service method instead of returning empty array when no DB. (3) Changed SocialTab in profile.tsx to use apiClient (with auth interceptor) instead of raw fetch() for feed and friends endpoints.
verification: All three endpoints verified via curl - loved-places returns 3 places, feed returns 2 activity items, friends returns 1 friend. TypeScript compiles cleanly.
files_changed: [backend/src/services/social-service.ts, backend/src/routes/social.ts, mobile-app/app/profile.tsx]
