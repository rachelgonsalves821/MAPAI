/**
 * Mapai — LLM User Context Builder
 * Transforms user preferences into a context object for chat requests.
 * This gets sent alongside every chat message to personalize AI responses.
 */

import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';

export interface UserLLMContext {
  user_profile: {
    prefers_fast_service: boolean;
    budget_sensitive: boolean;
    likes_coffee: boolean;
    likes_nightlife: boolean;
    likes_outdoors: boolean;
    likes_culture: boolean;
    ambiance_preferences: string[];
    price_range: string[];
    dietary_restrictions: string[];
    categories: string[];
  };
}

/**
 * Build a user context object from current store state.
 * Call this before sending chat messages to include personalization.
 */
export function buildUserContext(): UserLLMContext {
  // Try authStore first, fall back to onboardingStore
  const authUser = useAuthStore.getState().user;
  const onboardingPrefs = useOnboardingStore.getState().preferences;

  const prefs = authUser?.preferences || onboardingPrefs;

  return {
    user_profile: {
      prefers_fast_service: prefs.serviceSpeed === 'fast',
      budget_sensitive:
        prefs.priceRange?.includes('budget') ||
        prefs.priceRange?.includes('moderate'),
      likes_coffee: prefs.categories?.includes('coffee') || false,
      likes_nightlife: prefs.categories?.includes('nightlife') || false,
      likes_outdoors: prefs.categories?.includes('outdoors') || false,
      likes_culture: prefs.categories?.includes('culture') || false,
      ambiance_preferences: prefs.ambiance || [],
      price_range: prefs.priceRange || [],
      dietary_restrictions: prefs.dietaryRestrictions || [],
      categories: prefs.categories || [],
    },
  };
}

/**
 * Get a flat summary string for debugging / logging.
 */
export function getUserContextSummary(): string {
  const ctx = buildUserContext();
  const p = ctx.user_profile;
  const parts: string[] = [];

  if (p.categories.length > 0) parts.push(`Interests: ${p.categories.join(', ')}`);
  if (p.price_range.length > 0) parts.push(`Price: ${p.price_range.join(', ')}`);
  if (p.ambiance_preferences.length > 0) parts.push(`Vibe: ${p.ambiance_preferences.join(', ')}`);
  if (p.prefers_fast_service) parts.push('Wants fast service');
  if (p.dietary_restrictions.length > 0) parts.push(`Dietary: ${p.dietary_restrictions.join(', ')}`);

  return parts.length > 0 ? parts.join(' | ') : 'New user — no preferences yet';
}
