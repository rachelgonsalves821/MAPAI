# Mapai — TestFlight Deploy Checklist

Complete these steps in order. Items marked **[YOU]** require your manual action. Items marked **[CLAUDE]** will be done by Claude once you provide credentials.

---

## Phase 1: Accounts & Credentials (do all 3 in parallel)

### 1A. Apple Developer Account [YOU]
- [ ] Enroll at https://developer.apple.com/programs/enroll ($99/year)
- [ ] Wait for activation (24-48h)
- [ ] Create app in App Store Connect: name `Mapai`, bundle ID `app.mapai.mobile`, SKU `mapai-mobile`
- [ ] Note your **Apple ID email**, **Team ID** (developer.apple.com/account → Membership), **ASC App ID** (App Store Connect → App Information)

### 1B. Supabase Credentials [YOU]
Go to your Supabase project dashboard and collect:
- [ ] `SUPABASE_URL` — Settings → API → Project URL
- [ ] `SUPABASE_ANON_KEY` — Settings → API → anon public key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Settings → API → service_role secret key
- [ ] `SUPABASE_JWT_SECRET` — Settings → API → JWT Secret
- [ ] `DATABASE_URL` — Settings → Database → Connection string (URI format)

### 1C. Google Maps API Keys [YOU]
From your Google Cloud Console project:
- [ ] **Server key**: Places API + Directions API enabled (no restriction needed)
- [ ] **iOS key**: Maps SDK for iOS enabled, restricted to bundle ID `app.mapai.mobile`
- [ ] (Can be the same key if all APIs are enabled on it)

---

## Phase 2: Database Setup [CLAUDE]

Once you provide Supabase credentials, Claude will:
- [ ] Run all 9 database migrations
- [ ] Verify all tables are created
- [ ] Update `backend/.env` with Supabase credentials

---

## Phase 3: Backend Deployment

### 3A. Install Fly CLI [YOU]
```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### 3B. Create Fly.io App [YOU]
```bash
fly auth login
cd backend
fly launch --no-deploy
# When prompted: use existing fly.toml, select Boston (bos) region
```

### 3C. Set Secrets [YOU]
Replace placeholders with your real values:
```bash
fly secrets set \
  CLERK_SECRET_KEY="your-clerk-secret-key" \
  CLERK_WEBHOOK_SECRET="your-webhook-secret" \
  SUPABASE_URL="https://xxx.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  SUPABASE_ANON_KEY="eyJ..." \
  SUPABASE_JWT_SECRET="your-jwt-secret" \
  LLM_PROVIDER="gemini" \
  GOOGLE_GEMINI_API_KEY="your-gemini-key" \
  GEMINI_MODEL="gemini-2.5-flash" \
  ANTHROPIC_API_KEY="your-anthropic-key" \
  CLAUDE_MODEL="claude-sonnet-4-6" \
  GOOGLE_PLACES_API_KEY="your-places-key" \
  QR_SIGNING_SECRET="$(openssl rand -hex 32)" \
  CORS_ORIGIN="https://mapai-api.fly.dev,exp://,https://*.expo.dev"
```

### 3D. Deploy [YOU]
```bash
fly deploy
```

### 3E. Verify [YOU]
```bash
curl https://mapai-api.fly.dev/v1/health
# Should return: {"data":{"status":"ok",...}}
```

---

## Phase 4: Clerk Webhook [YOU]
- [ ] Go to https://dashboard.clerk.com → Webhooks → Add Endpoint
- [ ] URL: `https://mapai-api.fly.dev/v1/webhooks/clerk`
- [ ] Events: `user.created`, `user.updated`, `user.deleted`
- [ ] Copy the new signing secret → update Fly.io: `fly secrets set CLERK_WEBHOOK_SECRET="whsec_new..."`

---

## Phase 5: Mobile App Config [CLAUDE]

Once all credentials are ready, Claude will:
- [ ] Update `eas.json` with your Apple credentials
- [ ] Fill in `.env.staging` with real values
- [ ] Set EAS secrets (you'll need to run the commands)

### Set EAS Secrets [YOU]
```bash
cd mobile-app
eas secret:create --name EXPO_PUBLIC_BACKEND_URL --value "https://mapai-api.fly.dev" --scope project
eas secret:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "your-clerk-key" --scope project
eas secret:create --name EXPO_PUBLIC_GOOGLE_PLACES_API_KEY --value "your-key" --scope project
eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_SDK_KEY --value "your-key" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "your-url" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-key" --scope project
```

---

## Phase 6: Build & Submit [YOU]

### Build for TestFlight
```bash
cd mobile-app
eas build --platform ios --profile staging
```
Wait ~10-15 min for build to complete.

### Submit to TestFlight
```bash
eas submit --platform ios --profile staging
```
Apple reviews the first build in 24-48h, then it appears in TestFlight.

---

## Phase 7: Smoke Test [YOU]

On a real iOS device via TestFlight:
- [ ] App opens to landing screen
- [ ] Google sign-in works → onboarding completes
- [ ] Map renders with Boston pins
- [ ] Chat: "coffee near me" returns recommendations
- [ ] Place detail shows match score + "Why this?" works
- [ ] Compare 2 places works
- [ ] Transport shows Uber/Lyft price estimates
- [ ] Social tab: can search friends
- [ ] Chat history: search works
- [ ] Settings: survey toggle works
