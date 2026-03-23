/**
 * Mapai Backend — AI Orchestrator Service
 * Handles prompt construction, Claude API calls, and response parsing.
 * PRD §6.3: System persona + user memory + situational context + user message.
 *
 * Sessions persist to Supabase when available, in-memory fallback otherwise.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { v4 as uuid } from 'uuid';

interface ChatInput {
    message: string;
    userId: string;
    sessionId?: string;
    userMemory: UserMemoryContext;
    location?: { latitude: number; longitude: number };
    context?: { neighborhood?: string; time_of_day?: string };
}

interface ChatOutput {
    text: string;
    searchQuery?: string;
    discoveryIntent?: {
        type: string;
        category?: string;
        neighborhood?: string;
        priceRange?: { min: number; max: number };
    };
    preferenceInsights: PreferenceInsight[];
    sessionId: string;
}

export interface PreferenceInsight {
    type: string;
    value: string;
    confidence: number;
}

export interface UserMemoryContext {
    cuisineLikes: string[];
    cuisineDislikes: string[];
    priceRange: { min: number; max: number };
    speedSensitivity: string;
    ambiancePreferences: string[];
    dietaryRestrictions: string[];
}

interface SessionMessage {
    role: string;
    content: string;
    timestamp: string;
}

// In-memory session fallback
const inMemorySessions = new Map<string, { messages: SessionMessage[] }>();

export class AiOrchestrator {
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }

    async chat(input: ChatInput): Promise<ChatOutput> {
        const sessionId = input.sessionId || uuid();

        // Load session history
        const messages = await this.loadSession(sessionId, input.userId);

        // Build system prompt (PRD §6.3.2)
        const systemPrompt = this.buildSystemPrompt(input.userMemory, input.location, input.context);

        // Add user message
        const newMessage: SessionMessage = {
            role: 'user',
            content: input.message,
            timestamp: new Date().toISOString(),
        };
        messages.push(newMessage);

        // Keep last 20 messages to stay within context window
        const recentMessages = messages.slice(-20);

        try {
            const response = await this.client.messages.create({
                model: config.anthropic.model,
                max_tokens: 1024,
                system: systemPrompt,
                messages: recentMessages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            });

            const rawText =
                response.content[0]?.type === 'text'
                    ? response.content[0].text
                    : '';

            if (config.isDev) {
              console.log('\n[DEBUG] RAW CLAUDE RESPONSE:');
              console.log(rawText);
              console.log('[DEBUG] END RAW RESPONSE\n');
            }

            // Parse structured output
            const parsed = this.parseResponse(rawText);

            // Add assistant response
            messages.push({
                role: 'assistant',
                content: parsed.text,
                timestamp: new Date().toISOString(),
            });

            // Persist session
            await this.saveSession(sessionId, input.userId, messages);

            return {
                text: parsed.text,
                searchQuery: parsed.searchQuery,
                discoveryIntent: parsed.discoveryIntent,
                preferenceInsights: parsed.preferenceInsights,
                sessionId,
            };
        } catch (err) {
            console.error('Claude API error:', err);
            return {
                text: "I'm having trouble right now. Could you try again?",
                preferenceInsights: [],
                sessionId,
            };
        }
    }

    // ─── Session persistence ─────────────────────────────

    private async loadSession(sessionId: string, userId: string): Promise<SessionMessage[]> {
        if (!hasDatabase()) {
            return inMemorySessions.get(sessionId)?.messages || [];
        }

        const supabase = getSupabase()!;
        const { data } = await (supabase
            .from('chat_sessions') as any)
            .select('messages')
            .eq('id', sessionId)
            .maybeSingle();

        return (data?.messages as SessionMessage[]) || [];
    }

    private async saveSession(
        sessionId: string,
        userId: string,
        messages: SessionMessage[]
    ): Promise<void> {
        if (!hasDatabase()) {
            inMemorySessions.set(sessionId, { messages });
            return;
        }

        const supabase = getSupabase()!;
        await (supabase.from('chat_sessions') as any).upsert(
            {
                id: sessionId,
                user_id: userId,
                messages: messages as any,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
        );
    }

    // ─── Prompt construction ─────────────────────────────

    private buildSystemPrompt(
        memory: UserMemoryContext,
        location?: { latitude: number; longitude: number },
        context?: { neighborhood?: string; time_of_day?: string }
    ): string {
        const memorySummary = [
            memory.cuisineLikes.length > 0 ? `Enjoys: ${memory.cuisineLikes.join(', ')}` : '',
            memory.cuisineDislikes.length > 0 ? `Avoids: ${memory.cuisineDislikes.join(', ')}` : '',
            `Price comfort: ${'$'.repeat(memory.priceRange.min)}–${'$'.repeat(memory.priceRange.max)}`,
            `Pace: ${memory.speedSensitivity}`,
            memory.ambiancePreferences.length > 0 ? `Ambiance: ${memory.ambiancePreferences.join(', ')}` : '',
            memory.dietaryRestrictions.length > 0 ? `Dietary: ${memory.dietaryRestrictions.join(', ')}` : '',
        ]
            .filter(Boolean)
            .join('\n');

        return `You are Mapai, an AI-powered local discovery assistant for Boston, Massachusetts.

## Your Role
You help users discover places to eat, drink, work, and explore in Boston. You are warm, knowledgeable, opinionated, and deeply familiar with Boston's neighborhoods.

## User Profile
${memorySummary || '(New user — preferences still being learned)'}

## Situational Context
- Location: ${location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Boston area'}
- Neighborhood: ${context?.neighborhood || 'Not specified'}
- Time: ${context?.time_of_day || new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}

## Response Rules
1. Be conversational and warm — you're a knowledgeable local friend, not a search engine.
2. ALWAYS explain WHY each recommended place fits this specific user based on their profile (cuisine preferences, price range, ambiance). Be specific: "Since you love Japanese food and prefer cozy spots..." — not a generic description.
3. Keep your conversational text to 2–4 sentences. Do not list or enumerate places — that's what the map cards are for.
4. Reference Boston neighborhoods specifically (Back Bay, South End, North End, Somerville, Fenway, Cambridge, etc.).
5. If the query is vague, ask ONE focused clarifying question.

## CRITICAL: mapai_intent Block
When the user's message involves finding, discovering, or navigating to places, you MUST include a \`mapai_intent\` JSON block at the END of your response. This triggers the map to show real place results.

Rules:
- It MUST appear after your conversational text, separated by a blank line
- The JSON must be valid and complete — never truncate or omit required fields
- "search_query" must be a descriptive Google Places-style text query
- Always include "preference_insights" — even if empty array
- NEVER mention or reference this block in your conversational text

\`\`\`mapai_intent
{
  "search_query": "<descriptive Google Places query>",
  "intent": {
    "type": "food_discovery|drink_discovery|coffee_discovery|activity_discovery|navigation|general",
    "category": "restaurant|cafe|bar|coffee_shop|bakery|park|...",
    "neighborhood": "<Boston neighborhood or empty string>"
  },
  "preference_insights": [
    {"type": "cuisine_like|cuisine_dislike|price_preference|ambiance_preference|dietary_restriction", "value": "<value>", "confidence": 0.0}
  ]
}
\`\`\`

## Few-Shot Examples

### Example 1 — Ramen query (user likes Japanese food)
User: "find me great ramen in Boston"

Your response:
"Since you love Japanese cuisine, you're going to be right at home — South End and Back Bay have some seriously underrated ramen spots with rich tonkotsu broths and housemade noodles. Pulling up the best matches for you now.

\`\`\`mapai_intent
{
  "search_query": "ramen restaurant boston",
  "intent": {
    "type": "food_discovery",
    "category": "restaurant",
    "neighborhood": "South End"
  },
  "preference_insights": [
    {"type": "cuisine_like", "value": "ramen", "confidence": 0.9},
    {"type": "cuisine_like", "value": "Japanese", "confidence": 0.8}
  ]
}
\`\`\`"

### Example 2 — Coffee with ambiance preference
User: "I need a cozy coffee shop to work from"

Your response:
"Given that you love cozy spots, I'm thinking somewhere with warm lighting, good WiFi, and just the right buzz — not too loud. Beacon Hill and Cambridge have some perfect fits. Let me pull them up.

\`\`\`mapai_intent
{
  "search_query": "cozy coffee shop boston work laptop wifi",
  "intent": {
    "type": "coffee_discovery",
    "category": "cafe",
    "neighborhood": "Beacon Hill"
  },
  "preference_insights": [
    {"type": "ambiance_preference", "value": "cozy", "confidence": 0.85},
    {"type": "ambiance_preference", "value": "work-friendly", "confidence": 0.8}
  ]
}
\`\`\`"

### Example 3 — General conversation (no intent block)
User: "What's the difference between North End and South End?"

Your response:
"Great question! North End is Boston's Italian neighborhood — cobblestone streets, old-world charm, incredible pasta and cannoli. South End is hipper and more diverse, with a thriving restaurant scene, art galleries, and a strong community feel. Both are incredible — which vibe is calling you tonight?"`;
    }

    // ─── Response parsing ────────────────────────────────

    private parseResponse(rawText: string): {
        text: string;
        searchQuery?: string;
        discoveryIntent?: any;
        preferenceInsights: PreferenceInsight[];
    } {
        const intentMatch = rawText.match(/```mapai_intent\s*([\s\S]*?)```/);

        let text = rawText;
        let searchQuery: string | undefined;
        let discoveryIntent: any;
        let preferenceInsights: PreferenceInsight[] = [];

        if (intentMatch) {
            text = rawText.replace(/```mapai_intent[\s\S]*?```/, '').trim();

            try {
                const parsed = JSON.parse(intentMatch[1]);
                searchQuery = parsed.search_query || parsed.searchQuery;
                discoveryIntent = parsed.intent;
                preferenceInsights = parsed.preference_insights || parsed.preferenceInsights || [];
            } catch {
                // JSON parse failed — just use the text as-is
            }
        }

        return { text, searchQuery, discoveryIntent, preferenceInsights };
    }
}
