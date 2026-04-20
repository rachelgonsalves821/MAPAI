---
status: investigating
trigger: "Conversational chat interface is not responding"
created: 2026-03-26T00:00:00Z
updated: 2026-03-26T00:00:00Z
---

## Current Focus

hypothesis: CORS blocks requests from localhost:8090; the default allowed origins are only localhost:3000 and localhost:8081
test: Check config.ts DEFAULT_ORIGINS
expecting: localhost:8090 is NOT in the allowed origins list
next_action: Confirm CORS is the primary blocker, then check for secondary issues

## Symptoms

expected: User types a message in the search tab chat, gets an AI response
actual: No response appears — interface appears broken
errors: Unknown (need to check browser console)
reproduction: Type any message in search tab on localhost:8090
started: After recent refactor to useChatActions + ApiTokenSync

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-26T00:01:00Z
  checked: backend/src/config.ts lines 26-33
  found: DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:8081']. Frontend runs on localhost:8090. CORS will block all requests.
  implication: PRIMARY BLOCKER — all API calls from the web preview will fail with CORS errors

- timestamp: 2026-03-26T00:02:00Z
  checked: mobile-app/hooks/useChatActions.ts lines 107-123
  found: catch block logs to console.warn but returns null. The error is NOT surfaced to the user in search.tsx because search.tsx only shows chatStore messages on null result, and the error message IS added to chatStore. However the CORS error itself is swallowed.
  implication: Error handling chain works IF the request reaches the backend. CORS prevents the request entirely.

- timestamp: 2026-03-26T00:03:00Z
  checked: mobile-app/services/api/client.ts response interceptor lines 85-115
  found: showApiError() emits a toast for non-401 errors. But CORS errors produce NO response object (network error), so the toast says "No internet connection" which may be confusing.
  implication: Secondary UX issue — error message is misleading

- timestamp: 2026-03-26T00:04:00Z
  checked: Auth flow for web preview
  found: Clerk uses try/catch require (line 23-30 of _layout.tsx). On web, Clerk may fail to load, falling back to stub. Stub useAuth returns getToken = async () => null. ApiTokenSync calls setApiAuthToken(null). All requests go unauthenticated. But auth middleware has dev-user fallback (isDev && !requireAuth) so this is OK for dev.
  implication: Auth is NOT a blocker — dev-user fallback handles it

- timestamp: 2026-03-26T00:05:00Z
  checked: search.tsx send button disable logic (line 224-226)
  found: Send button is disabled when !inputText.trim(). The onPress handler (line 226) calls handleSend() which reads inputText from state. This is correct.
  implication: UI send logic is correct — button enables when text is entered

- timestamp: 2026-03-26T00:06:00Z
  checked: search.tsx handleSend catch block (lines 98-99)
  found: catch block only does console.error('Search error:', error) — no user-facing feedback. If chatSend returns null AND chatStore has no error message, the user sees nothing.
  implication: Secondary issue — silent failure in some error paths

## Resolution

root_cause: CORS configuration blocks requests from localhost:8090 (Expo web preview port). The backend .env sets CORS_ORIGIN to localhost:3000,8081,8082 only. All API requests from the frontend fail with a network error before reaching any route handler.
fix: Added http://localhost:8090 to CORS_ORIGIN in backend/.env and to DEFAULT_ORIGINS in backend/src/config.ts
verification: Backend must be restarted to pick up the new CORS origins. Then send a chat message from the web preview.
files_changed: [backend/.env, backend/src/config.ts]
