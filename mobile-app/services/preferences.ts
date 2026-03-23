/**
 * Mapai — User Preferences Store
 * Manages user preferences that EVOLVE from conversations and interactions.
 * Uses AsyncStorage for persistence across sessions.
 * In Sprint 2 this migrates to server-side Supabase storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserPreferences, MemoryFact } from '../types';

const PREFS_STORAGE_KEY = '@mapai_user_preferences';
const MEMORY_STORAGE_KEY = '@mapai_memory_facts';

// Default preferences for a new user (minimal — the AI learns the rest)
const DEFAULT_PREFERENCES: UserPreferences = {
    cuisinePreferences: [],
    cuisineAversions: [],
    priceRange: { min: 1, max: 3 },
    speedSensitivity: 'moderate',
    ambiancePreferences: [],
    dietaryRestrictions: [],
};

let currentPreferences: UserPreferences | null = null;
let memoryFacts: MemoryFact[] = [];

/**
 * Load preferences from storage. If none exist, returns defaults.
 */
export async function loadPreferences(): Promise<UserPreferences> {
    if (currentPreferences) return currentPreferences;

    try {
        const stored = await AsyncStorage.getItem(PREFS_STORAGE_KEY);
        if (stored) {
            currentPreferences = JSON.parse(stored);
            return currentPreferences!;
        }
    } catch (e) {
        console.warn('Failed to load preferences:', e);
    }

    currentPreferences = { ...DEFAULT_PREFERENCES };
    return currentPreferences;
}

/**
 * Save preferences to storage.
 */
export async function savePreferences(prefs: UserPreferences): Promise<void> {
    currentPreferences = prefs;
    try {
        await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.warn('Failed to save preferences:', e);
    }
}

/**
 * Update preferences based on an LLM-extracted insight from conversation.
 * This is the core learning loop — called after each chat interaction.
 */
export async function learnFromConversation(
    insight: PreferenceInsight
): Promise<void> {
    const prefs = await loadPreferences();

    switch (insight.type) {
        case 'cuisine_like':
            if (!prefs.cuisinePreferences.includes(insight.value)) {
                prefs.cuisinePreferences.push(insight.value);
            }
            break;
        case 'cuisine_dislike':
            if (!prefs.cuisineAversions.includes(insight.value)) {
                prefs.cuisineAversions.push(insight.value);
            }
            break;
        case 'price_preference':
            const level = parsePriceLevel(insight.value);
            if (level) {
                prefs.priceRange = level;
            }
            break;
        case 'speed_preference':
            if (['relaxed', 'moderate', 'fast'].includes(insight.value)) {
                prefs.speedSensitivity = insight.value as UserPreferences['speedSensitivity'];
            }
            break;
        case 'ambiance_preference':
            if (!prefs.ambiancePreferences.includes(insight.value)) {
                prefs.ambiancePreferences.push(insight.value);
            }
            break;
        case 'dietary_restriction':
            if (!prefs.dietaryRestrictions.includes(insight.value)) {
                prefs.dietaryRestrictions.push(insight.value);
            }
            break;
    }

    // Record as a memory fact
    const fact: MemoryFact = {
        dimension: insight.type,
        value: insight.value,
        confidence: insight.confidence,
        source: 'explicit',
        createdAt: new Date(),
        lastUpdated: new Date(),
        decayWeight: 1.0,
    };
    memoryFacts.push(fact);

    await savePreferences(prefs);
    await saveMemoryFacts();
}

/**
 * Extract preference insights from a chat message pair (user + AI response).
 * Uses Claude to identify any implicit or explicit preference signals.
 */
export async function extractPreferenceInsights(
    userMessage: string,
    aiResponse: string
): Promise<PreferenceInsight[]> {
    const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
    if (!ANTHROPIC_API_KEY) return [];

    const prompt = `Analyze this conversation exchange and extract any user preference signals. Only extract preferences the user CLEARLY expressed or implied.

User: "${userMessage}"
AI: "${aiResponse}"

For each preference signal found, return a JSON array with objects like:
{
  "type": "cuisine_like" | "cuisine_dislike" | "price_preference" | "speed_preference" | "ambiance_preference" | "dietary_restriction",
  "value": "the specific preference value",
  "confidence": 0.0-1.0 (how confident are you this is a real preference?)
}

Examples:
- "I want ramen" → [{"type": "cuisine_like", "value": "Japanese", "confidence": 0.7}]
- "Nothing too expensive" → [{"type": "price_preference", "value": "budget", "confidence": 0.8}]
- "somewhere quiet" → [{"type": "ambiance_preference", "value": "quiet", "confidence": 0.9}]
- "I'm vegan" → [{"type": "dietary_restriction", "value": "vegan", "confidence": 0.95}]

If no preference signals are found, return an empty array [].
Return ONLY the JSON array.`;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250514',
                max_tokens: 512,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) return [];

        const data = await response.json();
        const text = data.content?.[0]?.text || '[]';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        return JSON.parse(jsonMatch[0]);
    } catch {
        return [];
    }
}

/**
 * Get a formatted summary of current preferences for LLM system prompt injection.
 */
export async function getPreferenceSummary(): Promise<string> {
    const prefs = await loadPreferences();
    const lines: string[] = [];

    if (prefs.cuisinePreferences.length > 0) {
        lines.push(`Enjoys: ${prefs.cuisinePreferences.join(', ')}`);
    }
    if (prefs.cuisineAversions.length > 0) {
        lines.push(`Avoids: ${prefs.cuisineAversions.join(', ')}`);
    }
    lines.push(
        `Price comfort: ${'$'.repeat(prefs.priceRange.min)}–${'$'.repeat(prefs.priceRange.max)}`
    );
    lines.push(`Service speed: ${prefs.speedSensitivity}`);
    if (prefs.ambiancePreferences.length > 0) {
        lines.push(`Ambiance: ${prefs.ambiancePreferences.join(', ')}`);
    }
    if (prefs.dietaryRestrictions.length > 0) {
        lines.push(`Dietary: ${prefs.dietaryRestrictions.join(', ')}`);
    }

    if (lines.length === 2) {
        // Only default price + speed — user is new
        lines.unshift('(New user — preferences still being learned)');
    }

    return lines.join('\n');
}

/**
 * Get all stored memory facts for the profile screen.
 */
export async function getMemoryFacts(): Promise<MemoryFact[]> {
    if (memoryFacts.length > 0) return memoryFacts;

    try {
        const stored = await AsyncStorage.getItem(MEMORY_STORAGE_KEY);
        if (stored) {
            memoryFacts = JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to load memory facts:', e);
    }

    return memoryFacts;
}

/**
 * Clear all preferences and memory (for settings/privacy).
 */
export async function clearAllPreferences(): Promise<void> {
    currentPreferences = { ...DEFAULT_PREFERENCES };
    memoryFacts = [];
    await AsyncStorage.multiRemove([PREFS_STORAGE_KEY, MEMORY_STORAGE_KEY]);
}

// ─── Internal ────────────────────────────────────────────────

async function saveMemoryFacts(): Promise<void> {
    try {
        await AsyncStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memoryFacts));
    } catch (e) {
        console.warn('Failed to save memory facts:', e);
    }
}

function parsePriceLevel(
    value: string
): { min: number; max: number } | null {
    const lower = value.toLowerCase();
    if (lower.includes('budget') || lower.includes('cheap')) return { min: 1, max: 2 };
    if (lower.includes('moderate') || lower.includes('mid')) return { min: 2, max: 3 };
    if (lower.includes('upscale') || lower.includes('expensive')) return { min: 3, max: 4 };
    return null;
}

export interface PreferenceInsight {
    type:
    | 'cuisine_like'
    | 'cuisine_dislike'
    | 'price_preference'
    | 'speed_preference'
    | 'ambiance_preference'
    | 'dietary_restriction';
    value: string;
    confidence: number;
}
