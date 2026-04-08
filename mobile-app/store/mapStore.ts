import { create } from 'zustand';
import { Place } from '@/types';

interface MapState {
  selectedPlace: Place | null;
  discoveryPlaces: Place[];
  comparisonPlaces: Place[];
  isCompareMode: boolean;
  setSelectedPlace: (place: Place | null) => void;
  setDiscoveryPlaces: (places: Place[]) => void;
  addToComparison: (place: Place) => void;
  removeFromComparison: (placeId: string) => void;
  clearComparison: () => void;
  setCompareMode: (enabled: boolean) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  selectedPlace: null,
  discoveryPlaces: [],
  comparisonPlaces: [],
  isCompareMode: false,
  setSelectedPlace: (place) => set({ selectedPlace: place }),
  setDiscoveryPlaces: (places) => set({ discoveryPlaces: places }),
  addToComparison: (place) => {
    const { comparisonPlaces } = get();
    const alreadyAdded = comparisonPlaces.some((p) => p.id === place.id);
    if (alreadyAdded || comparisonPlaces.length >= 4) return;
    set({ comparisonPlaces: [...comparisonPlaces, place] });
  },
  removeFromComparison: (placeId) => {
    set((state) => ({
      comparisonPlaces: state.comparisonPlaces.filter((p) => p.id !== placeId),
    }));
  },
  clearComparison: () => set({ comparisonPlaces: [], isCompareMode: false }),
  setCompareMode: (enabled) => {
    if (!enabled) {
      set({ isCompareMode: false, comparisonPlaces: [] });
    } else {
      set({ isCompareMode: true });
    }
  },
}));
