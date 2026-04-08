/**
 * Mapai — Auth Store (Zustand)
 * Lightweight store for user profile + preferences state.
 * Complements AuthContext (which handles session/login lifecycle).
 *
 * Preferences in this store are a LOCAL CACHE of the backend.
 * The authoritative source is the backend (user_preferences table).
 * Use syncPreferencesFromMemory() to populate from a useUserMemory() response.
 */

import { create } from 'zustand';
import type { UserMemoryContext } from '../services/api/memory';

export interface UserProfile {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  preferences: UserPreferencesState;
  social: SocialState;
}

export interface UserPreferencesState {
  categories: string[];
  priceRange: string[];
  ambiance: string[];
  serviceSpeed: string;
  dietaryRestrictions: string[];
}

export interface SocialState {
  friendsCount: number;
  mutuals: number;
}

interface AuthStoreState {
  user: UserProfile | null;
  session: any | null;
  isAuthenticated: boolean;

  setSession: (session: any) => void;
  setUser: (user: UserProfile | null) => void;
  updatePreferences: (prefs: Partial<UserPreferencesState>) => void;
  /**
   * Populate the local preferences cache from a backend UserMemoryContext.
   * Call this after a successful useUserMemory() fetch on auth state change.
   */
  syncPreferencesFromMemory: (memory: UserMemoryContext) => void;
  updateSocial: (social: Partial<SocialState>) => void;
  logout: () => void;
}

const DEFAULT_PREFERENCES: UserPreferencesState = {
  categories: [],
  priceRange: [],
  ambiance: [],
  serviceSpeed: '',
  dietaryRestrictions: [],
};

const DEFAULT_SOCIAL: SocialState = {
  friendsCount: 0,
  mutuals: 0,
};

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,

  setSession: (session) =>
    set({
      session,
      isAuthenticated: !!session,
    }),

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
    }),

  updatePreferences: (prefs) =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            preferences: { ...state.user.preferences, ...prefs },
          }
        : null,
    })),

  syncPreferencesFromMemory: (memory: UserMemoryContext) =>
    set((state) => {
      if (!state.user) return {};
      const synced: UserPreferencesState = {
        categories: memory.cuisineLikes,
        priceRange: [],
        ambiance: memory.ambiancePreferences,
        serviceSpeed: memory.speedSensitivity,
        dietaryRestrictions: memory.dietaryRestrictions,
      };
      return {
        user: { ...state.user, preferences: synced },
      };
    }),

  updateSocial: (social) =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            social: { ...state.user.social, ...social },
          }
        : null,
    })),

  logout: () =>
    set({
      user: null,
      session: null,
      isAuthenticated: false,
    }),
}));
