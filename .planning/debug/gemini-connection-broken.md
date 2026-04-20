---
status: investigating
trigger: 500 error with message "Gememni connection still broken" (likely "Gemini" connection)
created: 2026-04-08T00:00:00Z
updated: 2026-04-08T00:00:00Z
---

## Current Focus
hypothesis: GOOGLE_GEMINI_API_KEY is NOT set in Vercel production environment, causing the code to fall back to using GOOGLE_PLACES_API_KEY (as of commit 8ca994b this fallback was FIXED, but prior to that it was a bug)
test: Check if Vercel has GOOGLE_GEMINI_API_KEY configured as an environment variable
expecting: Find that env var is missing in Vercel, confirming root cause
next_action: Verify Vercel environment variables are set correctly

## Symptoms
expected: Gemini API calls succeed and return valid responses
actual: 500 error with message "Gememni connection still broken" (appears to be typo/corruption of actual error)
errors: ["Gememni connection still broken"]
reproduction: Likely in production/Vercel after recent deployment
started: Recent deployment - after commit 8ca994b attempted to fix fallback issue

## Eliminated
- hypothesis: Error is explicitly in ai-orchestrator.ts
  evidence: No "Gememni connection still broken" string found in source. Error handling uses generic messages
  timestamp: 2026-04-08

- hypothesis: Typo is in source code
  evidence: Searched all .ts files, error message "still broken" not found anywhere
  timestamp: 2026-04-08

## Evidence
- timestamp: 2026-04-08
  checked: Recent git history - commit 8ca994b
  found: Commit message states "Fix Gemini API key fallback (was silently using Places API key)"
  implication: BUG EXISTED: old config.ts had `gemini.apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_PLACES_API_KEY || ''`. If GOOGLE_GEMINI_API_KEY missing, it silently used GOOGLE_PLACES_API_KEY

- timestamp: 2026-04-08
  checked: Old config.ts (commit 8ca994b~1)
  found: Line 46 shows fallback: `apiKey: process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_PLACES_API_KEY || ''`
  implication: If Vercel production env has GOOGLE_PLACES_API_KEY but NOT GOOGLE_GEMINI_API_KEY, Gemini client would be initialized with Places API key (WRONG)

- timestamp: 2026-04-08
  checked: Current config.ts (after fix)
  found: Line 67 now reads: `apiKey: process.env.GOOGLE_GEMINI_API_KEY || ''` (no fallback to Places key)
  implication: Fix removes the bad fallback, but if GOOGLE_GEMINI_API_KEY is still missing, SDK is now initialized with empty string

- timestamp: 2026-04-08
  checked: Local backend/.env
  found: GOOGLE_GEMINI_API_KEY=AIzaSyC6kNi-OaRKl4dvTp_-mLYStHu51x6A6fI (key IS present locally)
  implication: Local dev works fine. Production (Vercel) likely missing this env var

- timestamp: 2026-04-08
  checked: Error message "Gememni connection still broken" origin
  found: NOT in source code anywhere. Possibly Google SDK error or corrupted error text from network/logging
  implication: Error is likely a garbled version of the actual API error when using invalid/missing key

## Resolution
root_cause: GOOGLE_GEMINI_API_KEY environment variable is NOT configured in Vercel production deployment. The .env.vercel.example template shows the variable should be set (line 28: `GOOGLE_GEMINI_API_KEY=`), but it's missing from actual Vercel dashboard configuration. Without this key, the Gemini SDK either initializes with an empty string or fails to authenticate API calls, resulting in 500 error. Recent commit 8ca994b removed the fallback to GOOGLE_PLACES_API_KEY (which was the bug), making this missing variable a critical issue.

fix: 
1. Obtain your Google Generative AI API key from https://aistudio.google.com/app/apikey
2. Add GOOGLE_GEMINI_API_KEY to Vercel Project Settings → Environment Variables (Production environment)
3. Value: Your actual Google Generative AI API key (same format as local: AIzaSy...)
4. Redeploy the Vercel project for changes to take effect

verification:
- Confirm GOOGLE_GEMINI_API_KEY is set in Vercel dashboard
- Trigger a new chat message in the deployed app
- Verify the chat response succeeds without 500 error
- Check that "Gemini" (not "Gememni") provider is being used in backend logs

files_changed: []
files_to_configure: .env.vercel (via Vercel dashboard)
