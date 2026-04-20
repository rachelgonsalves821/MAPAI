---
status: diagnosed
trigger: "Users are being bounced back to the landing page after attempting to create accounts with Clerk authentication"
created: 2026-03-26T00:00:00Z
updated: 2026-03-26T00:00:00Z
---

## Current Focus

hypothesis: Multiple interacting issues in the route guard and SSO callback cause new users to bounce back to landing
test: Code trace through all auth flows
expecting: Identify specific race conditions and logic gaps
next_action: Report diagnosis

## Symptoms

expected: User signs up (Google OAuth or email) -> progresses through onboarding (create-identity -> enable-location -> find-friends -> ready -> home)
actual: User bounces back to landing page after account creation
errors: No explicit error messages reported
reproduction: Create new account via Clerk auth (Google OAuth or email sign-up)
started: After Clerk migration (based on commit history)

## Eliminated

(none - first pass diagnosis)

## Evidence

- timestamp: 2026-03-26T00:01:00Z
  checked: AuthContext.tsx route guard logic (lines 104-128)
  found: Route guard checks `user.onboardingComplete` which maps to `clerkUser.publicMetadata?.onboardingCompleted`. For NEW users, publicMetadata is empty/undefined, so onboardingComplete = false. The guard allows new users to stay in auth group but does NOT proactively navigate them to create-identity.
  implication: After sign-up completes, the user gets a session but the route guard only prevents leaving the auth group - it doesn't push them forward.

- timestamp: 2026-03-26T00:02:00Z
  checked: SSO callback (sso-callback.tsx) and sign-in.tsx OAuth flow
  found: |
    CRITICAL ISSUE 1 - Web OAuth redirectUrlComplete points to '/':
    In sign-in.tsx line 80: `redirectUrlComplete: window.location.origin + '/'`
    After Google OAuth on web, Clerk redirects to '/' (root). The root layout's initialRouteName is '(auth)' (line 57 of _layout.tsx), which means Expo Router renders the auth group. The auth group's first screen is 'landing'. So the user lands back on the landing page.

    CRITICAL ISSUE 2 - SSO callback has a timing/state race:
    sso-callback.tsx checks `signUpHook.signUp?.status === 'complete'` and `signInHook.signIn?.status === 'complete'` but these may not be populated yet when isLoaded becomes true. The useEffect fires once when isLoaded flips to true, but the signIn/signUp objects may not yet reflect the completed OAuth flow. If neither condition matches, the function silently returns without navigating.

    CRITICAL ISSUE 3 - hasNavigated ref prevents re-evaluation:
    In AuthContext.tsx, `hasNavigated` is reset when `isSignedIn` changes (line 62). But the route guard (line 104-128) has this logic: if user exists, onboarding not complete, and already in auth group -> do nothing. The user stays on whatever auth screen they were on. After OAuth completes and the page reloads to '/', the initial render hits the auth group landing page. The route guard sees: user exists, onboarding incomplete, inAuthGroup = true -> does nothing. User stays on landing.
  implication: The combination of redirectUrlComplete pointing to '/' and the route guard not redirecting within the auth group means new users land on the landing page after successful sign-up.

- timestamp: 2026-03-26T00:03:00Z
  checked: Email sign-up flow (sign-in.tsx lines 136-177)
  found: |
    After email verification completes (line 167-168), setActive is called and the comment says "Route guard handles navigation." But the route guard will see: new user, onboardingComplete=false, currently in auth group (sign-in screen is in auth group) -> does nothing. User stays on sign-in screen with no forward navigation. The sign-in screen itself does not navigate after successful sign-up.
  implication: Email sign-up also fails to advance the user. The sign-in screen relies on a route guard that explicitly does NOT navigate within the auth group.

- timestamp: 2026-03-26T00:04:00Z
  checked: Native OAuth flow (sign-in.tsx lines 86-96)
  found: Same pattern - after setActive on line 94, comment says "DO NOT navigate - route guard handles it." But route guard won't navigate a new user who is already in the auth group.
  implication: All three auth paths (Google web, Google native, email) have the same fundamental issue.

- timestamp: 2026-03-26T00:05:00Z
  checked: Web OAuth redirect flow end-to-end
  found: |
    The web OAuth flow uses authenticateWithRedirect (line 77-81). This causes a FULL PAGE REDIRECT to Google, then back to /sso-callback. The sso-callback has a race condition (Issue 2 above). Even if the callback succeeds and calls setActive, the route guard then takes over. Since the user is new (publicMetadata empty), onboardingComplete=false. The sso-callback is NOT in the auth group (it's at root level in _layout.tsx line 112). So the route guard sees: user exists, not onboarded, not in auth group -> router.replace('/(auth)/create-identity'). This SHOULD work for the SSO callback path, IF the callback successfully activates the session.

    However, the redirectUrlComplete is set to '/' not '/sso-callback'. The redirectUrl is '/sso-callback' (where Clerk sends the initial callback), but redirectUrlComplete (where Clerk sends AFTER token exchange) is '/'. So the flow is:
    1. User clicks Google -> redirected to Google
    2. Google redirects to /sso-callback (redirectUrl)
    3. sso-callback processes and Clerk completes -> Clerk redirects to / (redirectUrlComplete)
    4. At '/', initial route is (auth)/landing
    5. Route guard: user exists, not onboarded, inAuthGroup=true -> does nothing
    6. User sees landing page again
  implication: The redirectUrlComplete = '/' is the primary cause of the bounce for web OAuth.

## Resolution

root_cause: |
  THREE INTERACTING ROOT CAUSES:

  1. **Web OAuth redirectUrlComplete misconfigured (PRIMARY):** In `sign-in.tsx` line 80,
     `redirectUrlComplete` is set to `window.location.origin + '/'`. After Clerk completes
     the OAuth token exchange, it redirects to the app root. Expo Router's initialRouteName
     is `(auth)`, so the first screen rendered is the landing page. The route guard sees
     "user exists, onboarding incomplete, already in auth group" and does nothing -- user
     stays on landing.

  2. **Route guard does not navigate WITHIN the auth group:** The route guard in
     `AuthContext.tsx` (lines 104-128) has three branches:
     - No user + not in auth group -> go to landing
     - User exists + not onboarded + not in auth group -> go to create-identity
     - User onboarded + in auth group -> go to home

     Missing case: user exists + not onboarded + IS in auth group but on the WRONG screen
     (e.g., landing). The guard assumes if you're in the auth group you're on the right
     screen, but after OAuth redirect to '/' you land on the landing page, not
     create-identity.

  3. **SSO callback race condition:** The `sso-callback.tsx` useEffect checks signIn/signUp
     status synchronously when isLoaded becomes true, but the OAuth completion state may
     not be populated yet. If both checks fail, the callback silently does nothing --
     no navigation, no error. The user may be stuck on the "Completing sign in..." spinner
     until Clerk's redirect to redirectUrlComplete kicks in (which goes to '/' per issue 1).

  4. **Email sign-up has no post-verification navigation:** After email verification
     succeeds in `sign-in.tsx` (line 167-168), `setActive` is called but no navigation
     occurs. The comment says "Route guard handles navigation" but the route guard
     does nothing because the user is already in the auth group.

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
