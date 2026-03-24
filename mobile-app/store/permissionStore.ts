/**
 * Mapai — Permission Store (Zustand)
 * Tracks the current grant status for all system permissions the app may request.
 * Updated by PermissionManager — never mutated directly by UI components.
 */

import { create } from 'zustand';

type TrackingTransparencyStatus = 'undetermined' | 'granted' | 'denied';

interface PermissionState {
  locationForeground: boolean;
  locationBackground: boolean;
  microphone: boolean;
  notifications: boolean;
  contacts: boolean;
  camera: boolean;
  trackingTransparency: TrackingTransparencyStatus;

  setLocationForeground: (granted: boolean) => void;
  setLocationBackground: (granted: boolean) => void;
  setMicrophone: (granted: boolean) => void;
  setNotifications: (granted: boolean) => void;
  setContacts: (granted: boolean) => void;
  setCamera: (granted: boolean) => void;
  setTrackingTransparency: (status: TrackingTransparencyStatus) => void;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  locationForeground: false,
  locationBackground: false,
  microphone: false,
  notifications: false,
  contacts: false,
  camera: false,
  trackingTransparency: 'undetermined',

  setLocationForeground: (granted) => set({ locationForeground: granted }),
  setLocationBackground: (granted) => set({ locationBackground: granted }),
  setMicrophone: (granted) => set({ microphone: granted }),
  setNotifications: (granted) => set({ notifications: granted }),
  setContacts: (granted) => set({ contacts: granted }),
  setCamera: (granted) => set({ camera: granted }),
  setTrackingTransparency: (status) => set({ trackingTransparency: status }),
}));
