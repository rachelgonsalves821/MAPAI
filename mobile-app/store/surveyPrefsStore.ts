/**
 * Mapai — Survey Preferences Store (Zustand)
 * Controls whether arrival surveys are shown after a check-in.
 * Persists to AsyncStorage so the user's choice survives app restarts.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mapai_survey_prefs';

interface SurveyPrefsState {
  surveysEnabled: boolean;
  setSurveysEnabled: (enabled: boolean) => void;
  loadFromStorage: () => Promise<void>;
}

export const useSurveyPrefsStore = create<SurveyPrefsState>((set) => ({
  surveysEnabled: true,

  setSurveysEnabled: (enabled) => {
    set({ surveysEnabled: enabled });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ surveysEnabled: enabled })).catch(() => {});
  },

  loadFromStorage: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({ surveysEnabled: parsed.surveysEnabled ?? true });
      }
    } catch {
      // Silently fail — default (enabled) is safe
    }
  },
}));
