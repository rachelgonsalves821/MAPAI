/**
 * Mapai Backend — AI Orchestrator Service
 * Handles prompt construction, Claude API calls, and response parsing.
 * PRD §6.3: System persona + user memory + situational context + user message.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
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

// In-memory session store (Redis in production)
const sessions = new Map<string, { messages: Array<{ role: string; content: string }> }>();

export class AiOrchestrator {
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }

    async chat(input: ChatInput): Promise<ChatOutput> {
        const sessionId = input.sessionId || uuid();

        // Get or create session
        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, { messages: [] });
        }
        const session = sessions.get(sessionId)!;

        // Build system prompt (PRD §6.3.2)
        const systemPrompt = this.buildSystemPrompt(input.userMemory, input.location, input.context);

        // Add user message to session
        session.messages.push({ role: 'user', content: input.message });

        // Keep last 20 messages to stay within context window
        const recentMessages = session.messages.slice(-20);

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

            // Parse structured output
            const parsed = this.parseResponse(rawText);

            // Add assistant response to session
            session.messages.push({ role: 'assistant', content: parsed.text });

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
You help users discover places to eat, drink, work, and explore in Boston. You are warm, knowledgeable, opinionated (in a friendly way), and deeply familiar with Boston's neighborhoods.

## User Profile
${memorySummary || '(New user — preferences still being learned)'}

## Situational Context
- Location: ${location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Boston area'}
- Neighborhood: ${context?.neighborhood || 'Not specified'}
- Time: ${context?.time_of_day || new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}

## Response Rules
1. Be conversational and warm — you're a knowledgeable local friend, not a search engine
2. When recommending places, explain WHY they match this specific user
3. Proactively ask clarifying questions to narrow down the perfect spot
4. Reference Boston neighborhoods specifically (Back Bay, South End, North End, Somerville, etc.)
5. If you detect a place discovery intent, include the following JSON block at the END of your response (after your conversational text):

\`\`\`mapai_intent
{
  "search_query": "text query for Google Places",
  "intent": {
    "type": "food_discovery|drink_discovery|activity_discovery|general",
    "category": "optional category",
    "neighborhood": "optional neighborhood"
  },
  "preference_insights": [
    {"type": "cuisine_like|cuisine_dislike|price_preference|ambiance_preference|dietary_restriction", "value": "...", "confidence": 0.0-1.0}
  ]
}
\`\`\`

Only include the JSON block when you detect the user wants to find a place. For general conversation, just respond naturally.`;
    }

    private parseResponse(rawText: string): {
        text: string;
        searchQuery?: string;
        discoveryIntent?: any;
        preferenceInsights: PreferenceInsight[];
    } {
        // Extract structured intent block if present
        const intentMatch = rawText.match(/```mapai_intent\s*([\s\S]*?)```/);

        let text = rawText;
        let searchQuery: string | undefined;
        let discoveryIntent: any;
        let preferenceInsights: PreferenceInsight[] = [];

        if (intentMatch) {
            // Remove the JSON block from the conversational text
            text = rawText.replace(/```mapai_intent[\s\S]*?```/, '').trim();

            try {
                const parsed = JSON.parse(intentMatch[1]);
                searchQuery = parsed.search_query;
                discoveryIntent = parsed.intent;
                preferenceInsights = parsed.preference_insights || [];
            } catch {
                // JSON parse failed — just use the text as-is
            }
        }

        return { text, searchQuery, discoveryIntent, preferenceInsights };
    }
}
