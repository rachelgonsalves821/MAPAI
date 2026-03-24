/**
 * Mapai — Onboarding Store (Zustand)
 * Tracks onboarding progress for the identity + social flow.
 * Persists to AsyncStorage so state survives app restarts.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingState {
  currentStep: number;
  displayName: string;
  username: string;
  selectedFriends: string[];
  onboardingComplete: boolean;

  setStep: (step: number) => void;
  setDisplayName: (name: string) => void;
  setUsername: (username: string) => void;
  addFriend: (friendId: string) => void;
  removeFriend: (friendId: string) => void;
  complete: () => void;
  reset: () => void;
  loadFromStorage: () => Promise<void>;
}

const STORAGE_KEY = 'mapai_onboarding';

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  currentStep: 1,
  displayName: '',
  username: '',
  selectedFriends: [],
  onboardingComplete: false,

  setStep: (step) => {
    set({ currentStep: step });
    persist(get());
  },

  setDisplayName: (displayName) => {
    set({ displayName });
    persist(get());
  },

  setUsername: (username) => {
    set({ username });
    persist(get());
  },

  addFriend: (friendId) => {
    set((s) => ({ selectedFriends: [...s.selectedFriends, friendId] }));
    persist(get());
  },

  removeFriend: (friendId) => {
    set((s) => ({ selectedFriends: s.selectedFriends.filter((id) => id !== friendId) }));
    persist(get());
  },

  complete: () => {
    set({ onboardingComplete: true });
    persist({ ...get(), onboardingComplete: true });
  },

  reset: () => {
    set({
      currentStep: 1,
      displayName: '',
      username: '',
      selectedFriends: [],
      onboardingComplete: false,
    });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

  loadFromStorage: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({
          currentStep: parsed.currentStep ?? 1,
          displayName: parsed.displayName ?? '',
          username: parsed.username ?? '',
          selectedFriends: parsed.selectedFriends ?? [],
          onboardingComplete: parsed.onboardingComplete ?? false,
        });
      }
    } catch {
      // Silently fail — defaults are fine
    }
  },
}));

function persist(state: OnboardingState) {
  const { currentStep, displayName, username, selectedFriends, onboardingComplete } = state;
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ currentStep, displayName, username, selectedFriends, onboardingComplete })
  ).catch(() => {});
}
