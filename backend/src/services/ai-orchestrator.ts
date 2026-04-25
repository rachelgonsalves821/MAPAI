/**
 * Mapai Backend — AI Orchestrator Service
 * Handles prompt construction, LLM calls (Gemini or Claude), and response parsing.
 * PRD §6.3: System persona + user memory + situational context + user message.
 *
 * Provider selection: set LLM_PROVIDER=gemini|anthropic in .env
 * Default: gemini (cheapest). Switch to anthropic for higher quality.
 *
 * Sessions persist to Supabase when available, in-memory fallback otherwise.
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { getSupabase, hasDatabase } from '../db/supabase-client.js';
import { v4 as uuid } from 'uuid';
import { ChatService } from './chat-service.js';
import { withGeminiRetry } from '../lib/gemini-retry.js';

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

// In-memory session fallback (used when Supabase is not configured)
const inMemorySessions = new Map<string, { messages: SessionMessage[] }>();

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Convert a past date into a human-readable relative string so the LLM can
 * resolve temporal references like "that coffee place from Tuesday".
 */
function formatRelativeDate(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) {
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        return `last ${dayName}`;
    }
    if (diffDays < 14) return 'last week';
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
}

export class AiOrchestrator {
    private chatService = new ChatService();
    private anthropicClient: Anthropic | null = null;
    private geminiClient: GoogleGenerativeAI | null = null;
    private provider: 'gemini' | 'anthropic';

    constructor() {
        this.provider = config.llmProvider;

        if (this.provider === 'anthropic' && config.anthropic.apiKey) {
            this.anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
            console.log(`[AI] Provider: Anthropic Claude (${config.anthropic.model})`);
        } else if (this.provider === 'gemini' && config.gemini.apiKey) {
            this.geminiClient = new GoogleGenerativeAI(config.gemini.apiKey);
            console.log(`[AI] Provider: Google Gemini (${config.gemini.model})`);
        } else if (config.gemini.apiKey) {
            // Fallback: if requested provider has no key, try gemini
            this.provider = 'gemini';
            this.geminiClient = new GoogleGenerativeAI(config.gemini.apiKey);
            console.log(`[AI] Provider fallback: Gemini (${config.gemini.model}) — ${config.llmProvider} key missing`);
        } else if (config.anthropic.apiKey) {
            // Fallback: try anthropic
            this.provider = 'anthropic';
            this.anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
            console.log(`[AI] Provider fallback: Claude (${config.anthropic.model}) — gemini key missing`);
        } else {
            console.error('[AI] No LLM API keys configured! Set ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY');
        }
    }

    async chat(input: ChatInput): Promise<ChatOutput> {
        const sessionId = input.sessionId || uuid();

        console.log('\n=== PIPELINE TRACE ===');
        console.log('Backend received request: YES');
        console.log(`[AI] Provider: ${this.provider} | Message: "${input.message}"`);

        // Guard: fail fast if no client
        if (!this.anthropicClient && !this.geminiClient) {
            console.error('[AI] No LLM client available');
            console.log('LLM called: NO (no API key)');
            console.log('=== END PIPELINE TRACE ===\n');
            return {
                text: '⚠️ No LLM configured. Set ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY in backend/.env',
                preferenceInsights: [],
                sessionId,
            };
        }

        // Load session history.
        // When the database is available the route handler already persisted the
        // current user message before calling ai.chat(), so loadSession() will
        // return it as the last row. We must NOT push it again to avoid sending
        // duplicate messages to the LLM.
        // When running in-memory (no DB) the message has not been stored yet, so
        // we push it ourselves.
        const { messages, currentMessageIncluded } = await this.loadSessionWithFlag(
            sessionId, input.userId, input.message
        );

        if (!currentMessageIncluded) {
            // In-memory path: add the current user message manually
            messages.push({
                role: 'user',
                content: input.message,
                timestamp: new Date().toISOString(),
            });
        }

        // Build system prompt — load memory and cross-session context in parallel
        const [memoryContext, recentContext] = await Promise.all([
            this.buildMemoryContext(input.userId),
            this.getRecentContext(input.userId, sessionId),
        ]);
        const systemPrompt = this.buildSystemPrompt(input.userMemory, input.location, input.context);
        const fullSystemPrompt = systemPrompt + memoryContext + recentContext;

        if (config.isDev) {
            console.log('[AI] System prompt length:', fullSystemPrompt.length, 'chars');
        }

        // Keep last 20 messages
        const recentMessages = messages.slice(-20);
        console.log(`[AI] Sending ${recentMessages.length} messages (provider: ${this.provider})`);
        console.log('LLM called: YES');

        try {
            let rawText: string;

            if (this.provider === 'gemini') {
                rawText = await this.callGemini(fullSystemPrompt, recentMessages);
            } else {
                rawText = await this.callClaude(fullSystemPrompt, recentMessages);
            }

            console.log('LLM responded: YES');
            if (config.isDev) {
                console.log('\n[DEBUG] RAW LLM RESPONSE:');
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

            console.log(`[AI] searchQuery: ${parsed.searchQuery ? `"${parsed.searchQuery}"` : '(none)'}`);
            console.log('Response returned to frontend: YES');
            console.log('=== END PIPELINE TRACE ===\n');

            // Fire-and-forget: extract preferences from this exchange
            this.extractPreferencesFromExchange(input.userId, input.message, parsed.text)
                .catch(err => console.warn('[Extraction] Background error:', err));

            // Fire-and-forget: generate/refresh session summary every 4 messages so that
            // future sessions can reference this one via cross-session context carryover.
            if (messages.length >= 4 && messages.length % 4 === 0) {
                this.generateSessionSummary(sessionId, messages)
                    .catch(err => console.warn('[Summary] Background error:', err));
            }

            return {
                text: parsed.text,
                searchQuery: parsed.searchQuery,
                discoveryIntent: parsed.discoveryIntent,
                preferenceInsights: parsed.preferenceInsights,
                sessionId,
            };
        } catch (err: any) {
            const errorMessage = err?.message || String(err);
            console.error(`[AI] ${this.provider} error: ${errorMessage}`);

            // Automatic fallback: if primary provider fails, try the other one
            const fallbackProvider = this.provider === 'gemini' ? 'anthropic' : 'gemini';
            const fallbackAvailable =
                (fallbackProvider === 'anthropic' && this.anthropicClient) ||
                (fallbackProvider === 'gemini' && this.geminiClient);

            if (fallbackAvailable) {
                console.log(`[AI] Attempting fallback to ${fallbackProvider}...`);
                try {
                    let rawText: string;
                    if (fallbackProvider === 'gemini') {
                        rawText = await this.callGemini(fullSystemPrompt, recentMessages);
                    } else {
                        rawText = await this.callClaude(fullSystemPrompt, recentMessages);
                    }

                    console.log(`[AI] Fallback to ${fallbackProvider} succeeded`);
                    const parsed = this.parseResponse(rawText);

                    messages.push({
                        role: 'assistant',
                        content: parsed.text,
                        timestamp: new Date().toISOString(),
                    });
                    await this.saveSession(sessionId, input.userId, messages);

                    return {
                        text: parsed.text,
                        searchQuery: parsed.searchQuery,
                        discoveryIntent: parsed.discoveryIntent,
                        preferenceInsights: parsed.preferenceInsights,
                        sessionId,
                    };
                } catch (fallbackErr: any) {
                    console.error(`[AI] Fallback ${fallbackProvider} also failed: ${fallbackErr?.message}`);
                }
            }

            console.log('LLM responded: NO (error)');
            return {
                text: config.isDev
                    ? `[Dev] AI error (${this.provider}): ${errorMessage}`
                    : `I'm having trouble connecting right now. Please try again in a moment.`,
                preferenceInsights: [],
                sessionId,
            };
        }
    }

    // ─── LLM Providers ───────────────────────────────────

    /**
     * Focused single-turn LLM call — no session management, no parsing.
     * Used for lightweight tasks like the "Why this?" explanation.
     * Tries the configured provider first; throws on failure.
     */
    async generateFocused(prompt: string): Promise<string> {
        if (this.geminiClient) {
            try {
                return await withGeminiRetry(this.geminiClient, async (client, modelName) => {
                    const model = client.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent(prompt);
                    return result.response.text().trim();
                });
            } catch (e) {
                console.warn('[AI] generateFocused: Gemini exhausted, trying Anthropic', (e as Error).message);
                // Fall through to Anthropic below
            }
        }
        if (this.anthropicClient) {
            const result = await this.anthropicClient.messages.create({
                model: config.anthropic.model,
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }],
            });
            return result.content[0]?.type === 'text' ? result.content[0].text.trim() : '';
        }
        throw new Error('No LLM client available');
    }

    private async callGemini(systemPrompt: string, messages: SessionMessage[]): Promise<string> {
        return await withGeminiRetry(this.geminiClient!, async (client, modelName) => {
            const model = client.getGenerativeModel({
                model: modelName,
                systemInstruction: systemPrompt,
            });

            // Build history from all messages except the last (which is sent as the new turn).
            // Gemini requires history to start with a 'user' turn and strictly alternate —
            // drop any leading 'model' turns to avoid a 400 error.
            const rawHistory = messages.slice(0, -1).map((m) => ({
                role: m.role === 'assistant' ? 'model' as const : 'user' as const,
                parts: [{ text: m.content }],
            }));
            const firstUserIdx = rawHistory.findIndex((m) => m.role === 'user');
            const history = firstUserIdx > 0 ? rawHistory.slice(firstUserIdx) : rawHistory;

            const lastMessage = messages[messages.length - 1].content;
            const chat = model.startChat({ history });

            // Belt-and-suspenders timeout: AbortController cancels the fetch; Promise.race
            // covers mid-stream body stalls that AbortController alone cannot cancel.
            // Budget is per-attempt — each retry gets a fresh 12 s.
            //
            // Why 12 s? With 2 retry attempts and a max backoff of 2 s the worst-case
            // Gemini budget is 12 + 2 + 12 = 26 s, leaving room for DB I/O and the
            // Places API call within Vercel's 60 s maxDuration window.
            const controller = new AbortController();
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => { controller.abort(); reject(new Error('Gemini call timed out after 12s')); }, 12_000)
            );

            const result = await Promise.race([
                chat.sendMessage(lastMessage, { signal: controller.signal }),
                timeoutPromise,
            ]);
            return result.response.text();
        });
    }

    private async callClaude(systemPrompt: string, messages: SessionMessage[]): Promise<string> {
        // 20 s ceiling for Claude — fits within the 60 s Vercel maxDuration budget
        // alongside DB overhead and the Places API call.
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Claude call timed out after 20s')), 20_000)
        );

        const response = await Promise.race([
            this.anthropicClient!.messages.create({
                model: config.anthropic.model,
                max_tokens: 1024,
                system: systemPrompt,
                messages: messages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            }),
            timeoutPromise,
        ]);

        return response.content[0]?.type === 'text' ? response.content[0].text : '';
    }

    // ─── Session persistence ─────────────────────────────

    /**
     * Load session history and indicate whether the current user message is
     * already included in the returned array.
     *
     * - DB path: the route handler persisted the user message before calling
     *   ai.chat(), so the DB already contains it. We return it and set
     *   currentMessageIncluded = true so the caller does not add it again.
     * - In-memory path: the message has not been stored yet, so we return the
     *   previous history and set currentMessageIncluded = false so the caller
     *   appends it.
     */
    private async loadSessionWithFlag(
        sessionId: string,
        _userId: string,
        currentMessage: string
    ): Promise<{ messages: SessionMessage[]; currentMessageIncluded: boolean }> {
        // In-memory fallback: return buffered history without the current message
        if (!hasDatabase()) {
            const buffered = inMemorySessions.get(sessionId)?.messages || [];
            return { messages: [...buffered], currentMessageIncluded: false };
        }

        try {
            // Load up to 20 messages from chat_messages, oldest first.
            // The route handler already inserted the current user message, so
            // it will appear as the last row.
            const rows = await this.chatService.getSessionHistory(sessionId);
            const recent = rows.slice(-20);
            const mapped: SessionMessage[] = recent.map((r: any) => ({
                role: r.role as string,
                content: r.content as string,
                timestamp: r.created_at as string,
            }));

            // Verify the last message actually matches what we expect
            const last = mapped[mapped.length - 1];
            const currentMessageIncluded =
                !!last && last.role === 'user' && last.content === currentMessage;

            return { messages: mapped, currentMessageIncluded };
        } catch (err) {
            console.warn('[AI] loadSession failed, starting with empty history:', err);
            return { messages: [], currentMessageIncluded: false };
        }
    }

    private async saveSession(
        sessionId: string,
        userId: string,
        messages: SessionMessage[]
    ): Promise<void> {
        // In-memory path: keep the full buffer so context is available within the process
        if (!hasDatabase()) {
            inMemorySessions.set(sessionId, { messages });
            return;
        }

        // Database path: the chat route handler is responsible for inserting individual
        // messages via ChatService before and after the LLM call. By the time we reach
        // here both the user message and the assistant response have already been
        // persisted, so there is nothing extra to do.
        // We intentionally do NOT re-insert messages here to avoid duplicates.
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
    "neighborhood": "<Boston neighborhood or empty string>",
    "travel_willingness": "default|nearby|flexible|specific",
    "max_walk_minutes": null
  },
  "preference_insights": [
    {"type": "cuisine_like|cuisine_dislike|price_preference|ambiance_preference|dietary_restriction", "value": "<value>", "confidence": 0.0}
  ]
}

travel_willingness values:
- "nearby": user said "near me", "close by", "walking distance"
- "flexible": user said "don't mind traveling", "worth the trip", "anywhere in Boston"
- "specific": user named a specific place or distant neighborhood
- "default": no mention of distance

max_walk_minutes: if user specifies a time limit (e.g. "5 minute walk"), extract as integer. Otherwise null.
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

    // ─── Conversational memory ───────────────────────────

    private async buildMemoryContext(userId: string): Promise<string> {
        try {
            if (!hasDatabase()) return '';

            const supabase = getSupabase()!;
            const { data: preferences } = await (supabase as any)
                .from('user_preferences')
                .select('dimension, value, confidence')
                .eq('user_id', userId)
                .gte('confidence', 0.3)
                .order('confidence', { ascending: false })
                .limit(15);

            if (!preferences || preferences.length === 0) return '';

            const lines = preferences.map((p: any) => {
                const strength = p.confidence >= 0.8 ? 'strongly'
                    : p.confidence >= 0.5 ? 'generally' : 'somewhat';
                return `• ${strength} prefers ${p.dimension}: ${p.value}`;
            });

            return `\n\n## What you remember about this user\n${lines.join('\n')}\n\nUse these preferences to personalize your recommendations. Reference them naturally — "Since you enjoy Italian food..." not "According to my database..." Never tell the user you are reading from stored data. Speak as if you genuinely remember past conversations. If a preference contradicts what the user is asking for right now, prioritize what they're asking for — preferences evolve.`;
        } catch (err) {
            console.warn('[Orchestrator] Memory fetch failed:', err);
            return '';
        }
    }

    // ─── Cross-session context carryover ────────────────

    /**
     * Build a compact context string summarising the user's recent past sessions
     * so the LLM can resolve references like "that coffee place from Tuesday".
     *
     * Only queries the database; always returns '' for in-memory / no-DB paths.
     * Errors are swallowed — context loading must never block the chat response.
     */
    private async getRecentContext(userId: string, currentSessionId: string): Promise<string> {
        if (!hasDatabase()) return '';

        try {
            // Load the 6 most recent sessions (we'll filter out the current one below)
            const sessions = await this.chatService.getRecentSessions(userId, 6);
            const pastSessions = sessions.filter((s: any) => s.id !== currentSessionId);

            if (pastSessions.length === 0) return '';

            // Take at most 5 past sessions
            const recent = pastSessions.slice(0, 5);

            let context = '\n\n## Recent Activity\n';
            context += 'Past conversations with this user (use these to resolve references like "that place from Tuesday"):\n';

            for (const session of recent) {
                const dateLabel = formatRelativeDate(session.created_at);
                // Prefer the richer summary; fall back to the short title
                const description = session.summary || session.title || 'General conversation';
                context += `- ${dateLabel}: ${description}\n`;
            }

            context += '\nIf the user references something from a past conversation (e.g. "that coffee place from Tuesday", "the ramen spot you mentioned"), use the above context to identify what they mean. If you cannot determine the specific place, ask a brief clarifying question.';

            if (config.isDev) {
                console.log(`[AI] Cross-session context: ${recent.length} past sessions loaded (${context.length} chars)`);
            }

            return context;
        } catch (err) {
            console.warn('[AI] getRecentContext failed (non-fatal):', err);
            return '';
        }
    }

    private async extractPreferencesFromExchange(
        userId: string,
        userMessage: string,
        aiResponse: string
    ): Promise<void> {
        const extractionPrompt = `You are analyzing a conversation between a user and an AI place recommendation assistant in Boston. Extract any user preferences revealed in this exchange.

Return ONLY a valid JSON array. If no preferences are found, return [].

USER: "${userMessage}"
ASSISTANT: "${aiResponse}"

Each preference object must have:
- "dimension": one of: cuisine_like, cuisine_dislike, price_preference, ambiance_preference, dietary_restriction, neighborhood, activity_type, time_preference, distance_preference, drink_preference, occasion
- "value": the specific preference
- "confidence": number between 0.3 and 1.0

Return ONLY the JSON array:`;

        try {
            let extracted: Array<{ dimension: string; value: string; confidence: number }>;

            if (this.provider === 'gemini' && this.geminiClient) {
                const text = await withGeminiRetry(this.geminiClient, async (client, modelName) => {
                    const model = client.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent(extractionPrompt);
                    return result.response.text().replace(/```json|```/g, '').trim();
                });
                extracted = JSON.parse(text);
            } else if (this.anthropicClient) {
                const result = await this.anthropicClient.messages.create({
                    model: config.anthropic.model,
                    messages: [{ role: 'user', content: extractionPrompt }],
                    max_tokens: 500,
                });
                const text = result.content[0]?.type === 'text' ? result.content[0].text.replace(/```json|```/g, '').trim() : '[]';
                extracted = JSON.parse(text);
            } else {
                return;
            }

            if (!Array.isArray(extracted) || extracted.length === 0) return;

            if (!hasDatabase()) return;
            const supabase = getSupabase()!;

            for (const pref of extracted) {
                if (!pref.dimension || !pref.value || typeof pref.confidence !== 'number') continue;

                // Only update if new confidence is higher
                const { data: existing } = await (supabase as any)
                    .from('user_preferences')
                    .select('confidence')
                    .eq('user_id', userId)
                    .eq('dimension', pref.dimension)
                    .maybeSingle();

                if (existing && parseFloat(String(existing.confidence)) >= pref.confidence) continue;

                await (supabase as any)
                    .from('user_preferences')
                    .upsert(
                        {
                            user_id: userId,
                            dimension: pref.dimension,
                            value: pref.value,
                            confidence: pref.confidence,
                            source: 'inferred',
                            last_updated: new Date().toISOString(),
                            decay_weight: 1.0,
                        },
                        { onConflict: 'user_id,dimension' }
                    );
            }
        } catch (err) {
            console.warn('[Orchestrator] Preference extraction failed:', err);
        }
    }

    private async generateSessionSummary(
        sessionId: string,
        messages: SessionMessage[]
    ): Promise<void> {
        // Use the first 10 messages so the prompt stays small
        const conversationText = messages
            .slice(0, 10)
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');

        // Two-part prompt: produce a short title AND a richer summary sentence
        // so that (a) the chat history UI has a readable label and (b) the
        // cross-session context carryover has enough detail to resolve references
        // like "that coffee place from Tuesday".
        const prompt = `You are summarizing a chat session from a Boston place-discovery app.

Produce TWO outputs separated by a newline:
Line 1 — SHORT TITLE (6-8 words): what the user was looking for. Examples: "Italian in Back Bay", "Late night coffee options"
Line 2 — CONTEXT SUMMARY (1-2 sentences): include specific place names, neighborhoods, categories, and any user constraints mentioned. This will be shown to the AI in future sessions so it can resolve references like "that coffee place from Tuesday". Examples:
  "User was looking for quiet coffee shops in Back Bay under $8. Recommended Thinking Cup and Pavement Coffeehouse."
  "User wanted late-night ramen in South End. Suggested Ganko Ittetsu and Yume Wo Katare."

Conversation:
${conversationText}

Return ONLY the two lines, no labels, no quotes:`;

        try {
            let rawOutput: string;
            if (this.provider === 'gemini' && this.geminiClient) {
                rawOutput = await withGeminiRetry(this.geminiClient, async (client, modelName) => {
                    const model = client.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent(prompt);
                    return result.response.text().trim();
                });
            } else if (this.anthropicClient) {
                const result = await this.anthropicClient.messages.create({
                    model: config.anthropic.model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 120,
                });
                rawOutput = result.content[0]?.type === 'text' ? result.content[0].text.trim() : '';
            } else {
                return;
            }

            if (!rawOutput) return;

            // Split into title (line 1) and summary (line 2+)
            const lines = rawOutput.split('\n').map(l => l.trim()).filter(Boolean);
            const title = lines[0]?.replace(/^["']|["']$/g, '') || '';
            const summary = lines.slice(1).join(' ').replace(/^["']|["']$/g, '') || title;

            if (!title) return;

            if (!hasDatabase()) return;

            const supabase = getSupabase()!;
            await (supabase.from('chat_sessions') as any)
                .update({ title, summary })
                .eq('id', sessionId);

            if (config.isDev) {
                console.log(`[Summary] Session ${sessionId} — title: "${title}" | summary: "${summary}"`);
            }
        } catch (err) {
            console.warn('[Orchestrator] Summary generation failed:', err);
        }
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
            } catch (parseErr) {
                console.warn('[AI] mapai_intent JSON parse failed. Raw block text:', intentMatch[1]);
                console.warn('[AI] Parse error:', parseErr);
            }
        }

        return { text, searchQuery, discoveryIntent, preferenceInsights };
    }
}
