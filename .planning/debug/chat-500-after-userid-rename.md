---
status: diagnosed
trigger: "POST /v1/chat/message returns 500 after recent refactor renamed clerkUserId→userId in saveMessage calls"
created: 2026-04-26T00:00:00Z
updated: 2026-04-26T00:00:01Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — chat_sessions and chat_messages DB columns were never renamed from clerk_user_id to user_id, but the service now inserts using user_id key. RLS policies still reference clerk_user_id.
test: Confirmed via migration file audit — neither 009 nor 010 rename migration lists chat_sessions or chat_messages in their table arrays.
expecting: n/a — root cause confirmed
next_action: Return diagnosis

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Chat sends message, gets AI response
actual: POST /v1/chat/message returns 500 immediately, chat interface crashes
errors: "Request failed with status code 500" / "Server error reported by Mapai Backend"
reproduction: Open chat screen and send any message
started: After commit that changed clerkUserId→userId in chat.ts and chat-history.ts

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Route handler passes wrong field name to saveMessage
  evidence: chat.ts lines 73-78 and 106-111 correctly pass { sessionId, userId, role, content } — matches saveMessage signature exactly
  timestamp: 2026-04-26

- hypothesis: saveMessage service method still internally references clerkUserId
  evidence: chat-service.ts lines 62-68 insert { session_id, user_id, role, content, metadata, created_at } — no mention of clerk_user_id anywhere in the file
  timestamp: 2026-04-26

- hypothesis: createSession inserts wrong column name
  evidence: chat-service.ts lines 25-30 insert { user_id, created_at, updated_at } — correct field name
  timestamp: 2026-04-26

- hypothesis: Error originates in auth middleware before the handler runs
  evidence: Auth errors return 401, not 500; middleware is not in the try/catch that produces 500
  timestamp: 2026-04-26

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-26
  checked: backend/src/db/migrations/005_chat_history.sql
  found: chat_sessions created with column clerk_user_id (line 15); chat_messages created with column clerk_user_id (line 30); RLS policies reference clerk_user_id (lines 57-71)
  implication: The live DB schema has clerk_user_id as the column name on both chat tables

- timestamp: 2026-04-26
  checked: backend/src/db/migrations/009_rename_clerk_user_id.sql (the big DO $$ FOREACH migration)
  found: Table array is ['users', 'user_preferences', 'visits', 'surveys', 'user_loved_places', 'activity_reactions', 'activity_comments', 'user_profiles', 'place_reviews', 'points_transactions', 'reward_redemptions', 'planning_members', 'planning_votes', 'planning_messages'] — chat_sessions and chat_messages are NOT in the list
  implication: Migration 009 never renamed clerk_user_id→user_id on the chat tables

- timestamp: 2026-04-26
  checked: backend/src/db/migrations/010_rename_clerk_user_id.sql
  found: Covers user_loved_places, place_reviews, points_transactions, reward_redemptions, activity_reactions, activity_comments — chat_sessions and chat_messages are NOT present
  implication: Migration 010 also does not touch the chat tables; confirmed by grep returning zero results for chat_sessions|chat_messages in both files

- timestamp: 2026-04-26
  checked: backend/src/services/chat-service.ts — saveMessage DB insert (lines 62-68)
  found: Inserts { session_id, user_id, role, content, metadata, created_at } into chat_messages
  implication: Service now writes user_id but the DB column is still clerk_user_id → Supabase/PostgreSQL rejects the insert with a column-not-found error, which is caught and re-thrown as "Failed to save message: <postgres error>", which propagates to the outer try/catch in chat.ts and returns 500

- timestamp: 2026-04-26
  checked: backend/src/services/chat-service.ts — createSession DB insert (lines 25-30)
  found: Inserts { user_id, created_at, updated_at } into chat_sessions
  implication: createSession also uses user_id → same mismatch; the 500 can be triggered before saveMessage is even called when no session_id is provided

- timestamp: 2026-04-26
  checked: backend/src/routes/chat.ts — handler flow
  found: saveMessage errors at lines 79-82 and 112-114 are caught and logged as warnings (non-fatal). However createSession at line 66 is NOT wrapped in a try/catch — if it throws (which it will when user_id column doesn't exist), the error bubbles to the outer catch at line 155 and produces the 500.
  implication: The 500 is thrown by createSession (chat_sessions.user_id column missing) when no session_id is in the request body. If session_id IS provided, the handler proceeds but saveMessage will still fail silently (non-fatal warn), and any subsequent query using getSessionHistory inside AiOrchestrator may also fail.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Migration 009 and 010 both omit chat_sessions and chat_messages from the clerk_user_id→user_id column rename. The live database still has clerk_user_id on both tables. The service layer (chat-service.ts) was updated to use user_id in all inserts and queries, creating a column-name mismatch. When POST /v1/chat/message runs without a session_id, chat.createSession() immediately fails with a Postgres "column user_id does not exist" error (chat_sessions still has clerk_user_id). This uncaught error propagates to the route's outer catch block and returns 500. Even when a session_id is provided, chat_messages inserts also fail (silently) and getSessionHistory queries break.
fix: Add a migration (011 or amend 010) that renames clerk_user_id→user_id on chat_sessions and chat_messages, drops the old RLS policies that reference clerk_user_id, and creates new RLS policies referencing user_id. The service code and route code require no changes — they are already correct.
verification:
files_changed: []
