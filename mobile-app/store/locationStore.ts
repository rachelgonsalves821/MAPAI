import { create } from 'zustand';

interface Coords {
  latitude: number;
  longitude: number;
}

interface LocationState {
  coords: Coords;
  accuracy: number | null;
  isDefault: boolean;
  setLocation: (coords: Coords) => void;
  setAccuracy: (accuracy: number | null) => void;
  setIsDefault: (isDefault: boolean) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  coords: { latitude: 42.3601, longitude: -71.0589 },
  accuracy: null,
  isDefault: true,
  setLocation: (coords) => set({ coords }),
  setAccuracy: (accuracy) => set({ accuracy }),
  setIsDefault: (isDefault) => set({ isDefault }),
}));
