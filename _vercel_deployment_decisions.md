# Vercel Deployment Decisions Log

## Architecture
- **Frontend:** Expo web export (SPA) served as static files from `mobile-app/dist/`
- **Backend:** Fastify app wrapped in Vercel serverless function at `/api/index.ts`
- **Routing:** `/api/*` routes to serverless backend, everything else falls through to SPA

## Key Decisions

### 1. Fastify instead of Express
The backend uses Fastify, not Express. The serverless wrapper uses Fastify's built-in `app.server.emit('request', req, res)` to handle incoming requests without `app.listen()`.

### 2. API prefix stripping
Vercel routes `/api/*` to the serverless function. The wrapper strips the `/api` prefix so Fastify routes (e.g., `/v1/chat/message`) match correctly. Frontend should set `EXPO_PUBLIC_BACKEND_URL=/api` on Vercel.

### 3. Web output mode: `single`
Changed `app.json` web output from `static` to `single` for proper SPA routing (all paths serve `index.html`).

### 4. react-native-map-clustering web stub
Created `mocks/react-native-map-clustering.web.tsx` — delegates to the existing `react-native-maps` web stub (iframe Google Maps). Clustering props are accepted but ignored on web.

### 5. @expo/metro-runtime installed
Required by Expo's web bundler for HMR and runtime bootstrap. Was missing.

## Files Created
- `api/index.ts` — Vercel serverless wrapper for Fastify backend
- `vercel.json` — Vercel deployment config (build command, rewrites, functions)
- `.env.vercel.example` — Template for Vercel environment variables
- `mocks/react-native-map-clustering.web.tsx` — Web stub for map clustering
- `_vercel_deployment_decisions.md` — This file

## Files Modified
- `backend/src/server.ts` — Exported `buildApp()`, conditional `app.listen()` (skipped when `VERCEL=1`)
- `mobile-app/app.json` — Web output changed to `single`
- `mobile-app/metro.config.js` — Added web stub for `react-native-map-clustering`

## Features Disabled/Degraded on Web
| Feature | Status | Notes |
|---------|--------|-------|
| QR check-in | Disabled | Camera not available on web; scanner modal gracefully degrades |
| Map clustering | Degraded | Shows iframe Google Maps without clustering |
| Map markers/pins | Degraded | No interactive markers on web (iframe limitation) |
| Secure token storage | Degraded | Falls back to no persistence; sessions won't survive page refresh |
| Apple Sign-In button | Works | Shown on web via Clerk redirect flow |
| Push notifications | Disabled | Web push not configured |

## Environment Variables for Vercel Dashboard
These must be set in Vercel Project Settings before deploying:

### Frontend (bundled into JS)
- `EXPO_PUBLIC_BACKEND_URL` = `/api`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key
- `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` = your Google API key
- `EXPO_PUBLIC_GOOGLE_MAPS_SDK_KEY` = your Google Maps SDK key
- `EXPO_PUBLIC_SUPABASE_URL` = your Supabase URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key

### Backend (server-side only)
- `NODE_ENV` = `production`
- `VERCEL` = `1`
- `CLERK_SECRET_KEY` = your Clerk secret key
- `SUPABASE_URL` = your Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key
- `LLM_PROVIDER` = `gemini`
- `GOOGLE_GEMINI_API_KEY` = your Gemini API key
- `GOOGLE_PLACES_API_KEY` = your Google Places API key
- `QR_SIGNING_SECRET` = a secure random string
- `CORS_ORIGIN` = your Vercel deployment URL (e.g., `https://mapai.vercel.app`)
