# Mapai — Secrets & Environment Configuration

> **Read this before touching any environment config or API keys.**

## Key Classification

### BACKEND-ONLY keys (NEVER in the mobile bundle)

These keys grant privileged access. They must only exist in the backend `.env` file
and in EAS Secrets for server builds. If any of these appear in the JS bundle,
it is a critical security vulnerability.

| Key | Why it's dangerous |
|-----|--------------------|
| `GOOGLE_PLACES_API_KEY` | Unrestricted server key — can make unlimited API calls |
| `GOOGLE_GEMINI_API_KEY` | LLM access — costs money per request |
| `ANTHROPIC_API_KEY` | LLM access — costs money per request |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses all RLS — full database admin access |
| `SUPABASE_JWT_SECRET` | Can forge auth tokens for any user |
| `SUPABASE_DB_PASSWORD` | Direct PostgreSQL access |

### CLIENT-SAFE keys (OK to include in mobile bundle)

These keys are designed for client-side use and are restricted by platform:

| Key | Env var | Restriction |
|-----|---------|-------------|
| Supabase anon key | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | RLS enforced — can only access user's own data |
| Google Maps SDK key | `EXPO_PUBLIC_GOOGLE_MAPS_SDK_KEY` | Restricted to iOS bundle ID `app.mapai.mobile` in Google Cloud Console |
| Segment write key | `EXPO_PUBLIC_SEGMENT_WRITE_KEY` | Write-only — cannot read analytics data |
| Sentry DSN | `EXPO_PUBLIC_SENTRY_DSN` | Write-only — cannot read crash reports |

## Environment Files

All `.env*` files are gitignored. Never commit them.

```
mobile-app/.env.development   — local dev (test/dummy keys OK)
mobile-app/.env.staging       — TestFlight builds (real keys, non-prod endpoints)
mobile-app/.env.production    — App Store builds (production keys only)

backend/.env                  — backend server (all server-only keys)
```

## Setting Up

### Local development
```bash
cp mobile-app/.env.example mobile-app/.env.development
# Fill in your dev keys
```

### EAS builds (staging/production)
Set secrets via EAS CLI — they are encrypted and never stored in the repo:
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxx.supabase.co" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --scope project
eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_SDK_KEY --value "AIza..." --scope project
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://xxx@sentry.io/xxx" --scope project
```

## Verification

After a production build, verify no secrets leaked into the JS bundle:
```bash
strings Mapai.app/main.jsbundle | grep -E "AIza|sk-ant|service_role|supabase_jwt"
# Must return nothing
```

## Google Cloud Console Setup

The `EXPO_PUBLIC_GOOGLE_MAPS_SDK_KEY` must be restricted in Google Cloud Console:
1. Go to APIs & Services → Credentials
2. Select the Maps SDK key
3. Under "Application restrictions", select "iOS apps"
4. Add bundle ID: `app.mapai.mobile`
5. Under "API restrictions", select "Maps SDK for iOS" only
