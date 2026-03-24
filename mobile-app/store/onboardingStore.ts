/**
 * Mapai — Onboarding Store (Zustand)
 * Tracks onboarding progress and preference selections.
 * Persists to AsyncStorage so onboarding state survives app restarts.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OnboardingPreferences {
  categories: string[];
  priceRange: string[];
  ambiance: string[];
  serviceSpeed: string;
  dietaryRestrictions: string[];
}

interface OnboardingState {
  step: number;
  isComplete: boolean;
  preferences: OnboardingPreferences;

  setStep: (step: number) => void;
  next: () => void;
  setPreferences: (prefs: Partial<OnboardingPreferences>) => void;
  complete: () => void;
  reset: () => void;
  loadFromStorage: () => Promise<void>;
}

const DEFAULT_PREFERENCES: OnboardingPreferences = {
  categories: [],
  priceRange: [],
  ambiance: [],
  serviceSpeed: '',
  dietaryRestrictions: [],
};

const STORAGE_KEY = 'mapai_onboarding';

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  step: 1,
  isComplete: false,
  preferences: { ...DEFAULT_PREFERENCES },

  setStep: (step) => set({ step }),

  next: () => set((s) => ({ step: s.step + 1 })),

  setPreferences: (prefs) =>
    set((state) => {
      const updated = { ...state.preferences, ...prefs };
      // Persist asynchronously
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ preferences: updated, isComplete: state.isComplete })
      ).catch(() => {});
      return { preferences: updated };
    }),

  complete: () => {
    set({ isComplete: true });
    const state = get();
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ preferences: state.preferences, isComplete: true })
    ).catch(() => {});
  },

  reset: () => {
    set({ step: 1, isComplete: false, preferences: { ...DEFAULT_PREFERENCES } });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

  loadFromStorage: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({
          preferences: { ...DEFAULT_PREFERENCES, ...parsed.preferences },
          isComplete: parsed.isComplete || false,
        });
      }
    } catch {
      // Silently fail — defaults are fine
    }
  },
}));
