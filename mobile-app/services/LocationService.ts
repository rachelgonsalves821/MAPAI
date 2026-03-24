import * as Location from 'expo-location';
import { useLocationStore } from '../store/locationStore';

const BOSTON_DEFAULT = { latitude: 42.3601, longitude: -71.0589 };

export const LocationService = {
  async init() {
    const store = useLocationStore.getState();
    store.setLocation(BOSTON_DEFAULT);
    store.setIsDefault(true);

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      await LocationService.startWatching();
    } else {
      console.log('[LocationService] Permission not granted, using Boston default');
    }
  },

  async requestAndStart() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      await LocationService.startWatching();
    }
  },

  async startWatching() {
    const store = useLocationStore.getState();
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      store.setLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      store.setIsDefault(false);
      store.setAccuracy(current.coords.accuracy ?? null);

      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 15000,
          distanceInterval: 50,
        },
        (loc) => {
          store.setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          store.setAccuracy(loc.coords.accuracy ?? null);
          store.setIsDefault(false);
        },
      );
    } catch (err) {
      console.error('[LocationService] Failed to get location:', err);
    }
  },
};
