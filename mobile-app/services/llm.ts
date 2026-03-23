/**
 * Mapai — LLM Service (Anthropic Claude)
 * Real API integration using claude-sonnet-4-5
 * Handles discovery intent parsing, personalized recommendations, and conversational AI.
 *
 * Required: EXPO_PUBLIC_ANTHROPIC_API_KEY in .env
 */

import { ChatMessage, DiscoveryIntent, Place, UserPreferences } from '../types';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250514';

// ─── Response Cache (dev cost optimization) ─────────────────

const llmCache = new Map<string, { data: any; timestamp: number }>();
const LLM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes in dev

function getCachedResponse<T>(key: string): T | null {
    const entry = llmCache.get(key);
    if (entry && Date.now() - entry.timestamp < LLM_CACHE_TTL_MS) {
        return entry.data as T;
    }
    llmCache.delete(key);
    return null;
}

function cacheResponse(key: string, data: any): void {
    llmCache.set(key, { data, timestamp: Date.now() });
}

// ─── System Prompt (PRD §6.3.2) ─────────────────────────────

function buildSystemPrompt(
    userPreferences: UserPreferences,
    currentTime: string,
    neighborhood?: string
): string {
    return `You are Mapai, a knowledgeable and friendly local guide for Boston, MA. You help users discover the perfect places based on their personal preferences and current context.

## Your Personality
- You speak like a helpful local friend, not a chatbot
- You are opinionated and specific — never say "there are many options"
- You explain WHY a place fits, not just WHAT it is
- You are concise — 2-3 sentences per recommendation max
- You proactively ask clarifying questions when intent is ambiguous

## User Preferences
${formatPreferences(userPreferences)}

## Current Context
- Time: ${currentTime}
- Location: Boston, MA${neighborhood ? ` (${neighborhood})` : ''}

## Response Format
When the user asks for place recommendations, respond conversationally but ALSO return structured data.

For discovery queries, end your response with a JSON block inside <places_json> tags:
<places_json>
{
  "intent": "discovery",
  "filters": {
    "category": "restaurant|cafe|bar|coffee|bakery|gym|grocery|nightlife",
    "cuisine": "optional cuisine type",
    "maxPrice": 1-4,
    "ambiance": "optional ambiance preference",
    "openNow": true/false,
    "otherConstraints": ["any other filters"]
  },
  "searchQuery": "optimized Google Places text search query",
  "reasoning": "why these filters match the user's request"
}
</places_json>

For non-discovery queries (general conversation, follow-ups, factual questions), respond naturally without the JSON block.

IMPORTANT: Your conversational response should come BEFORE the JSON block. The JSON is for the app to parse — the user sees your conversational text.`;
}

function formatPreferences(prefs: UserPreferences): string {
    const lines: string[] = [];
    if (prefs.cuisinePreferences.length > 0) {
        lines.push(`- Enjoys: ${prefs.cuisinePreferences.join(', ')}`);
    }
    if (prefs.cuisineAversions.length > 0) {
        lines.push(`- Avoids: ${prefs.cuisineAversions.join(', ')}`);
    }
    lines.push(
        `- Price comfort: ${'$'.repeat(prefs.priceRange.min)} to ${'$'.repeat(prefs.priceRange.max)}`
    );
    lines.push(`- Service speed preference: ${prefs.speedSensitivity}`);
    if (prefs.ambiancePreferences.length > 0) {
        lines.push(`- Ambiance: ${prefs.ambiancePreferences.join(', ')}`);
    }
    if (prefs.dietaryRestrictions.length > 0) {
        lines.push(
            `- Dietary restrictions: ${prefs.dietaryRestrictions.join(', ')}`
        );
    }
    return lines.join('\n');
}

// ─── Core Chat API Call ─────────────────────────────────────

interface LLMResponse {
    conversationalText: string;
    discoveryIntent?: DiscoveryIntent;
    searchQuery?: string;
}

export async function sendChatMessage(
    userMessage: string,
    conversationHistory: ChatMessage[],
    userPreferences: UserPreferences,
    options?: {
        neighborhood?: string;
        skipCache?: boolean;
    }
): Promise<LLMResponse> {
    // Build cache key from message + last 2 history items
    const cacheKey = JSON.stringify({
        msg: userMessage,
        history: conversationHistory.slice(-2).map((m) => m.content),
    });

    if (!options?.skipCache) {
        const cached = getCachedResponse<LLMResponse>(cacheKey);
        if (cached) return cached;
    }

    const currentTime = new Date().toLocaleString('en-US', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
    });

    const systemPrompt = buildSystemPrompt(
        userPreferences,
        currentTime,
        options?.neighborhood
    );

    // Build conversation messages for Claude
    const messages = [
        ...conversationHistory.slice(-10).map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        })),
        { role: 'user' as const, content: userMessage },
    ];

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 1024,
                system: systemPrompt,
                messages,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Anthropic API error:', response.status, errorText);
            return {
                conversationalText:
                    "I'm having trouble thinking right now. Could you try again?",
            };
        }

        const data = await response.json();
        const rawText = data.content?.[0]?.text || '';

        const parsed = parseResponse(rawText);
        cacheResponse(cacheKey, parsed);
        return parsed;
    } catch (error) {
        console.error('LLM fetch error:', error);
        return {
            conversationalText:
                "I'm having trouble connecting. Please check your connection and try again.",
        };
    }
}

// ─── Response Parser ────────────────────────────────────────

function parseResponse(rawText: string): LLMResponse {
    // Extract conversational text (everything before <places_json>)
    const jsonMatch = rawText.match(
        /<places_json>\s*([\s\S]*?)\s*<\/places_json>/
    );

    let conversationalText = rawText;
    let discoveryIntent: DiscoveryIntent | undefined;
    let searchQuery: string | undefined;

    if (jsonMatch) {
        conversationalText = rawText
            .replace(/<places_json>[\s\S]*<\/places_json>/, '')
            .trim();

        try {
            const parsed = JSON.parse(jsonMatch[1]);
            discoveryIntent = {
                type: parsed.intent || 'discovery',
                filters: parsed.filters || {},
                reasoning: parsed.reasoning || '',
            };
            searchQuery = parsed.searchQuery;
        } catch (e) {
            console.warn('Failed to parse LLM JSON block:', e);
        }
    }

    return { conversationalText, discoveryIntent, searchQuery };
}

// ─── Match Score Explanation ────────────────────────────────

export async function explainMatchScore(
    place: Place,
    userPreferences: UserPreferences
): Promise<string> {
    const cacheKey = `explain:${place.id}`;
    const cached = getCachedResponse<string>(cacheKey);
    if (cached) return cached;

    const prompt = `Explain in 2-3 sentences why "${place.name}" (${place.category}, ${place.address}) is a ${place.matchScore}% match for this user. Be specific about what fits and what might not.

User preferences:
${formatPreferences(userPreferences)}

Place details:
- Rating: ${place.rating}/5
- Price level: ${'$'.repeat(place.priceLevel)}
- Category: ${place.categoryChips.join(', ')}`;

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 256,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) return 'Unable to generate explanation.';

        const data = await response.json();
        const explanation = data.content?.[0]?.text || 'No explanation available.';
        cacheResponse(cacheKey, explanation);
        return explanation;
    } catch {
        return 'Unable to generate explanation.';
    }
}

// ─── Proactive Suggestions (PRD FR-1.4) ─────────────────────

export async function generateProactiveSuggestion(
    userPreferences: UserPreferences,
    timeOfDay: string,
    dayOfWeek: string
): Promise<string[]> {
    const cacheKey = `proactive:${timeOfDay}:${dayOfWeek}`;
    const cached = getCachedResponse<string[]>(cacheKey);
    if (cached) return cached;

    const prompt = `Given it's ${dayOfWeek} ${timeOfDay} in Boston, suggest 3 short, tappable search suggestions (under 5 words each) that would appeal to this user. Return as a JSON array of strings.

User preferences:
${formatPreferences(userPreferences)}

Examples of good suggestions: "Quiet brunch spot", "Best ramen nearby", "Coffee with WiFi"
Return ONLY the JSON array, nothing else.`;

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 128,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok)
            return ['Coffee nearby', 'Lunch under $15', 'Open now'];

        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        const suggestions = JSON.parse(text);
        cacheResponse(cacheKey, suggestions);
        return suggestions;
    } catch {
        return ['Coffee nearby', 'Lunch under $15', 'Open now'];
    }
}
