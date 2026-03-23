import { create } from 'zustand';
import { Place } from '@/types';

interface MapState {
  selectedPlace: Place | null;
  discoveryPlaces: Place[];
  setSelectedPlace: (place: Place | null) => void;
  setDiscoveryPlaces: (places: Place[]) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedPlace: null,
  discoveryPlaces: [],
  setSelectedPlace: (place) => set({ selectedPlace: place }),
  setDiscoveryPlaces: (places) => set({ discoveryPlaces: places }),
}));
