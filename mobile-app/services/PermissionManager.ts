/**
 * Mapai — Permission Manager
 * Centralized service for requesting and checking all system permissions.
 * All methods update the permissionStore as a side-effect.
 *
 * Permissions are NEVER requested on import — only when a method is explicitly called.
 *
 * Optional dependencies (expo-av, expo-contacts, expo-camera / expo-image-picker,
 * expo-tracking-transparency) are wrapped in try/catch so the app builds even
 * when those packages are not yet installed.
 */

import * as Location from 'expo-location';
import { usePermissionStore } from '../store/permissionStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pull setters from the store outside of a component (Zustand supports this). */
function getStore() {
  return usePermissionStore.getState();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const PermissionManager = {
  /**
   * Requests foreground location permission.
   * Returns true when granted.
   */
  async requestLocationForeground(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      getStore().setLocationForeground(granted);
      return granted;
    } catch (error) {
      console.warn('[PermissionManager] requestLocationForeground failed:', error);
      getStore().setLocationForeground(false);
      return false;
    }
  },

  /**
   * Requests background location permission.
   * Foreground permission must be granted first; if it is not this method
   * requests it before proceeding.
   * Returns true when background is granted.
   */
  async requestLocationBackground(): Promise<boolean> {
    try {
      // Ensure foreground is already granted before asking for background.
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        const fgGranted = await PermissionManager.requestLocationForeground();
        if (!fgGranted) return false;
      }

      const { status } = await Location.requestBackgroundPermissionsAsync();
      const granted = status === 'granted';
      getStore().setLocationBackground(granted);
      return granted;
    } catch (error) {
      console.warn('[PermissionManager] requestLocationBackground failed:', error);
      getStore().setLocationBackground(false);
      return false;
    }
  },

  /**
   * Requests microphone (audio recording) permission via expo-av.
   * Falls back gracefully when expo-av is not installed.
   * Returns true when granted.
   */
  async requestMicrophone(): Promise<boolean> {
    try {
      // expo-av may not be installed yet — dynamic require inside try/catch.
      const { Audio } = await import('expo-av');
      const { status } = await Audio.requestPermissionsAsync();
      const granted = status === 'granted';
      getStore().setMicrophone(granted);
      return granted;
    } catch (error) {
      console.warn(
        '[PermissionManager] requestMicrophone failed (expo-av may not be installed):',
        error
      );
      getStore().setMicrophone(false);
      return false;
    }
  },

  /**
   * Requests camera permission via expo-image-picker.
   * Falls back gracefully when the package is not installed.
   * Returns true when granted.
   */
  async requestCamera(): Promise<boolean> {
    try {
      const ImagePicker = await import('expo-image-picker');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      const granted = status === 'granted';
      getStore().setCamera(granted);
      return granted;
    } catch (error) {
      console.warn(
        '[PermissionManager] requestCamera failed (expo-image-picker may not be installed):',
        error
      );
      getStore().setCamera(false);
      return false;
    }
  },

  /**
   * Requests contacts permission via expo-contacts.
   * Falls back gracefully when the package is not installed.
   * Returns true when granted.
   */
  async requestContacts(): Promise<boolean> {
    try {
      const Contacts = await import('expo-contacts');
      const { status } = await Contacts.requestPermissionsAsync();
      const granted = status === 'granted';
      getStore().setContacts(granted);
      return granted;
    } catch (error) {
      console.warn(
        '[PermissionManager] requestContacts failed (expo-contacts may not be installed):',
        error
      );
      getStore().setContacts(false);
      return false;
    }
  },

  /**
   * Checks the current status of all permissions without triggering any
   * system prompts, then syncs the results into the permissionStore.
   * Safe to call on app start.
   */
  async checkAllPermissions(): Promise<void> {
    const store = getStore();

    // Location — foreground
    try {
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      store.setLocationForeground(fgStatus === 'granted');
    } catch {
      store.setLocationForeground(false);
    }

    // Location — background
    try {
      const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      store.setLocationBackground(bgStatus === 'granted');
    } catch {
      store.setLocationBackground(false);
    }

    // Microphone (expo-av)
    try {
      const { Audio } = await import('expo-av');
      const { status } = await Audio.getPermissionsAsync();
      store.setMicrophone(status === 'granted');
    } catch {
      store.setMicrophone(false);
    }

    // Camera (expo-image-picker)
    try {
      const ImagePicker = await import('expo-image-picker');
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      store.setCamera(status === 'granted');
    } catch {
      store.setCamera(false);
    }

    // Contacts (expo-contacts)
    try {
      const Contacts = await import('expo-contacts');
      const { status } = await Contacts.getPermissionsAsync();
      store.setContacts(status === 'granted');
    } catch {
      store.setContacts(false);
    }

    // Tracking transparency (expo-tracking-transparency)
    try {
      const TrackingTransparency = await import('expo-tracking-transparency');
      const { status } = await TrackingTransparency.getTrackingPermissionsAsync();
      if (status === 'granted') {
        store.setTrackingTransparency('granted');
      } else if (status === 'denied') {
        store.setTrackingTransparency('denied');
      } else {
        store.setTrackingTransparency('undetermined');
      }
    } catch {
      store.setTrackingTransparency('undetermined');
    }

    // Notifications — expo-notifications is part of the Expo SDK but may not
    // be configured yet; wrap defensively.
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      store.setNotifications(status === 'granted');
    } catch {
      store.setNotifications(false);
    }
  },
};
