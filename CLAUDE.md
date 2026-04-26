# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mapai is an AI-powered local discovery app for Boston. The repo is a monorepo with three packages:

- `backend/` — Fastify + TypeScript API server
- `mobile-app/` — Expo React Native app (iOS/Android)
- `api/` — Thin Vercel serverless wrapper around the Fastify backend

## Commands

All commands run from the respective subdirectory unless noted.

### Backend (`cd backend/`)

```bash
npm run dev          # Hot-reload dev server (tsx watch)
npm run build        # Compile TypeScript → dist/
npm run start        # Production server (node dist/server.js)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint on src/
npm test             # Vitest (single run)
npm run test:watch   # Vitest interactive
npm run test:coverage
npm run migrate      # Apply pending SQL migrations
npm run migrate:status
npm run seed         # Populate test places + admin users
```

### Mobile (`cd mobile-app/`)

```bash
npx expo start       # Expo dev server
npx expo start --tunnel  # Via ngrok (for remote device testing)
npx expo run:ios
npx expo run:android
```

## Architecture

### Authentication

Auth uses **Supabase JWT** (ES256, verified via JWKS). The backend middleware (`backend/src/middleware/auth.ts`) supports three modes:

- `supabase-jwt` — production mode, validates Bearer token against Supabase JWKS
- `dev-token` — dev fallback for hardcoded tokens
- `dev-user` — permissive mode when `SKIP_AUTH=true` in `.env`

On mobile, `context/AuthContext.tsx` manages Supabase session state. The Axios client in `services/api/client.ts` attaches the cached session token as Bearer on every request, with async-safe token caching to avoid LockManager contention.

### API Layer (Mobile → Backend)

- **Axios** client with exponential backoff retry (3 retries; 1 for LLM endpoints)
- **React Query** hooks in `services/api/hooks.ts` wrap all Axios calls — use these hooks in components, not raw Axios
- Backend exposes RESTful routes under `/v1/` prefix (13 route groups registered in `server.ts`)
- WebSocket support exists on Fly.io but is skipped on Vercel

### State Management (Mobile)

**Zustand** stores for client-side state:

| Store | Owns |
|---|---|
| `authStore` | User profile + synced preferences |
| `chatStore` | Chat session history |
| `locationStore` | Current device location |
| `mapStore` | Map viewport + markers |
| `uiStore` | UI toggles |
| `onboardingStore` | Onboarding flow progress |
| `permissionStore` | Device permission status |
| `surveyPrefsStore` | Survey preference answers |

AuthContext handles Supabase session lifecycle; Zustand handles local preference caching.

### Navigation (Mobile)

Expo Router (file-based, like Next.js App Router):

- `app/(auth)/` — login, MFA, onboarding gate
- `app/(tabs)/` — bottom tabs: Map, Discover, Search, Social
- `app/(onboarding)/` — first-run onboarding flow
- `app/place/`, `app/planning/`, `app/u/`, `app/transport/` — feature screens

Auth guard lives in the root `_layout.tsx` — redirects to `(auth)` when not authenticated/onboarded.

### Backend Route Structure

Routes registered in `backend/src/server.ts` under `/v1/`:

- `chat`, `places`, `navigation`, `social`, `loyalty`, `surveys`, `users`, `preferences`, `memory`, `transport`, `admin`, `pipeline`, `health`

Business logic lives in `backend/src/services/` (PlacesService, ChatService, MemoryService, AiOrchestrator, etc.).

### Database

Supabase PostgreSQL. Schema managed via ordered SQL migrations in `backend/src/db/migrations/`. Run `npm run migrate` to apply. The migration runner (`backend/src/db/migration-runner.ts`) tracks applied migrations in a `schema_migrations` table.

### LLM Integration

Backend uses Google Gemini (primary) with Anthropic as fallback. The `AiOrchestrator` service in `backend/src/services/` handles model selection. Gemini model is configured in `backend/src/config.ts` — currently `gemini-2.5-flash-lite` with exponential-backoff retry and optional fallback model.

## Deployment

| Target | Platform | Config |
|---|---|---|
| Backend | Fly.io | `backend/fly.toml` |
| Mobile (iOS/Android) | EAS Build | `mobile-app/eas.json` |
| API wrapper | Vercel | `vercel.json` + `api/index.ts` |

CI runs on GitHub Actions: `.github/workflows/backend-ci.yml` runs typecheck → lint → test on push/PR to main.

## Path Aliases

- **Backend**: `@/*` → `src/*` (configured in `backend/tsconfig.json`)
- **Mobile**: `@/*` → repo root (configured in `mobile-app/tsconfig.json` + Babel module resolver)

## Environment

Copy `.env.example` to `.env` in each package. Set `SKIP_AUTH=true` in `backend/.env` for local dev without Supabase credentials. Mobile env vars must use `EXPO_PUBLIC_` prefix to be bundled into the app — no secrets in mobile env files.
