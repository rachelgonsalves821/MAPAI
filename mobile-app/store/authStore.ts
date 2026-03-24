/**
 * Mapai — Auth Store (Zustand)
 * Lightweight store for user profile + preferences state.
 * Complements AuthContext (which handles session/login lifecycle).
 */

import { create } from 'zustand';

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
