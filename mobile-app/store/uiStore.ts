import { create } from 'zustand';

interface UIState {
  isChatOpen: boolean;
  mapOpacity: number;
  openChat: () => void;
  closeChat: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isChatOpen: false,
  mapOpacity: 1.0,
  openChat: () => set({ isChatOpen: true, mapOpacity: 0.3 }),
  closeChat: () => set({ isChatOpen: false, mapOpacity: 1.0 }),
}));
