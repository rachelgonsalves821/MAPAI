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
