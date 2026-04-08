/**
 * Mapai — usePreferenceSync
 *
 * Fetches user preferences from the backend and writes them into authStore
 * so the local cache always reflects what the server holds.
 *
 * Mount this once near the top of the authenticated tree (e.g. in the tabs
 * _layout.tsx) so it runs automatically whenever the user is signed in.
 * It is a no-op when the user is not authenticated.
 */

import { useEffect } from 'react';
import { useUserMemory } from '../services/api/hooks';
import { useAuthStore } from '../store/authStore';
import { useAuth } from '../context/AuthContext';

export function usePreferenceSync() {
  const { user } = useAuth();
  const syncPreferencesFromMemory = useAuthStore((s) => s.syncPreferencesFromMemory);

  // Only fetch when we have an authenticated, non-guest user
  const isEligible = !!user && !user.isGuest;
  const { data } = useUserMemory();

  useEffect(() => {
    if (!isEligible || !data?.preferences) return;
    syncPreferencesFromMemory(data.preferences);
  }, [isEligible, data, syncPreferencesFromMemory]);
}
