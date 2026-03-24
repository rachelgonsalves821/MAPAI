/**
 * Mapai — Preference Persistence Service
 * Saves user preferences to backend and local stores.
 */

import apiClient from '@/services/api/client';
import { useAuthStore, UserPreferencesState } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';

/**
 * Save preferences to backend and update local stores.
 * Non-blocking — always updates local state even if backend fails.
 */
export async function savePreferences(
  userId: string,
  preferences: UserPreferencesState
): Promise<boolean> {
  // Update local stores immediately
  useAuthStore.getState().updatePreferences(preferences);
  useOnboardingStore.getState().setPreferences(preferences);

  // Map to backend schema
  const priceMap: Record<string, number> = {
    budget: 1,
    moderate: 2,
    upscale: 3,
    splurge: 4,
  };
  const priceNums = preferences.priceRange.map((p) => priceMap[p] || 2);

  const backendPayload = {
    preferences: {
      cuisine_likes: preferences.categories.filter((c) =>
        ['food', 'coffee', 'gems'].includes(c)
      ),
      ambiance_preferences: [
        ...preferences.categories.filter((c) =>
          ['nightlife', 'culture', 'outdoors', 'music', 'work', 'vibey'].includes(c)
        ),
        ...preferences.ambiance,
      ],
      dietary_restrictions: preferences.dietaryRestrictions,
      price_range: {
        min: Math.min(...(priceNums.length > 0 ? priceNums : [1])),
        max: Math.max(...(priceNums.length > 0 ? priceNums : [3])),
      },
      speed_sensitivity: preferences.serviceSpeed || 'moderate',
    },
  };

  // Save to backend (non-blocking)
  try {
    await apiClient.put('/v1/user/memory', backendPayload);
    return true;
  } catch (err) {
    console.warn('[Preferences] Backend save failed (non-blocking):', err);
    return false;
  }
}
