---
description: How to set up and run a Backend/API agent for Mapai server-side services
---

# Backend / API Agent Workflow

This agent builds the server-side services that power the Mapai mobile app. It should be run in parallel with the mobile frontend work.

## Context

- **PRD sections**: §6.2 (Core Services), §7 (API Design), §6.3 (AI Architecture)
- **Tech stack**: Node.js (TypeScript) or Python (FastAPI), PostgreSQL, Redis, Supabase Auth
- **API conventions**: RESTful + WebSocket for chat (PRD §7.1)
- **Base URL**: `https://api.mapai.app/v1/`

## Sprint 0 Tasks (Weeks 1-2)

1. **Initialize backend project**
   - Set up Node.js/TypeScript project with Express or Fastify
   - Configure PostgreSQL database (Supabase hosted)
   - Set up Redis for caching
   - Create Dockerfile + docker-compose.yml for local dev

2. **Auth service**
   - Configure Supabase Auth (Apple + Google OAuth)
   - Implement JWT middleware for API routes
   - Set up user profile table in PostgreSQL

3. **API scaffolding**
   - Create route structure per PRD §7.2:
     - `POST /v1/chat/message`
     - `GET /v1/places/nearby`
     - `GET /v1/places/:id`
     - `GET /v1/user/memory`
     - `PUT /v1/user/memory`
   - Implement standard response envelope: `{data, meta: {request_id, timestamp}, error?}`
   - Error handling per RFC 7807

4. **CI/CD pipeline**
   - GitHub Actions for lint + test on PR
   - Auto-deploy to staging on merge to main

## Sprint 1 Tasks (Weeks 3-4)

1. **AI Orchestration Service**
   - WebSocket endpoint for chat: `wss://api.mapai.app/v1/chat/stream`
   - Prompt envelope construction (PRD §6.3.2): system persona + user memory + situational context + user message
   - Claude API integration with structured JSON output parsing
   - Response streaming to mobile client

2. **Places Service**
   - Google Places API proxy with caching layer (Redis, 1-hour TTL)
   - Personalization re-ranking: take raw Google results and re-score using user preferences
   - Place detail enrichment endpoint

3. **Memory Engine (basic)**
   - PostgreSQL schema for structured preference facts:
     ```sql
     CREATE TABLE user_preferences (
       id UUID PRIMARY KEY,
       user_id UUID REFERENCES users(id),
       dimension VARCHAR(100),
       value TEXT,
       confidence DECIMAL(3,2),
       source VARCHAR(20),
       created_at TIMESTAMPTZ,
       last_updated TIMESTAMPTZ,
       decay_weight DECIMAL(3,2) DEFAULT 1.0
     );
     ```
   - CRUD endpoints for preference management
   - Memory context injection for LLM calls

## Key API Contracts (for mobile ↔ backend handoff)

```typescript
// POST /v1/chat/message
{
  message: string;
  session_id: string;
  location?: { lat: number; lng: number };
}

// Response
{
  data: {
    reply: string;
    places?: Place[];
    intent?: DiscoveryIntent;
  },
  meta: { request_id: string; timestamp: string }
}
```

## Handoff to Mobile

The mobile app currently calls Google Places API and Claude directly from the client. Once this backend is ready, the mobile agent should:
1. Replace `services/places.ts` direct API calls with backend proxy calls
2. Replace `services/llm.ts` direct API calls with WebSocket chat connection
3. Add auth token to all API requests
